import { db, saveGrade, saveItemGrade } from './db';
import { callScript } from './api';
import type { CGrades } from './api';
import { autoMap, classify, pointsValue, rubricItems } from '../core/classroom';
import type { Incoming } from '../core/classroom';
import { gradedLevels } from '../core/curriculum';
import { indexGrades, noGrades } from '../core/evaluation';
import type { Activity, Group, Subject } from '../core/model';

/** Nota de Classroom que no se ha aplicado porque en la app se cambió a mano. */
export interface Pending extends Incoming { activityId: string; current: number | null }
export interface PullResult { applied: number; conflicts: Pending[]; unmatched: number; notes: string[] }

const empty = (): PullResult => ({ applied: 0, conflicts: [], unmatched: 0, notes: [] });

/**
 * Trae de Classroom las notas de una actividad vinculada: la nota global y, si la tarea tiene rúbrica, la de cada
 * fila emparejada con un criterio. Aplica lo que no choca con cambios hechos en la app; lo demás queda pendiente.
 */
export async function pullActivity(subject: Subject, act: Activity, group: Group): Promise<PullResult> {
  const res = empty();
  if (!act.classroomWorkId || !group.classroomCourseId) return res;
  const r = await callScript<CGrades>('classroom.grades', { courseId: group.classroomCourseId, courseWorkId: act.classroomWorkId });
  const students = (await db.students.where('groupId').equals(group.id).toArray()).filter((s) => !s.deleted);
  const byUser = new Map(students.filter((s) => s.classroomUserId).map((s) => [s.classroomUserId!, s]));

  // Actividad: puntos, rúbrica y emparejamiento automático de filas con criterios.
  let a: Activity = { ...act, maxPoints: r.maxPoints ?? act.maxPoints };
  if (r.rubric) {
    const nodes = (await db.nodes.where('subjectId').equals(subject.id).toArray()).filter((n) => !n.deleted);
    const map = autoMap(r.rubric, nodes, gradedLevels(subject), act.classroomRubricMap ?? {});
    a = { ...a, rubric: r.rubric, classroomRubricMap: map, nodeIds: [...new Set([...a.nodeIds, ...Object.values(map)])] };
  } else if (r.rubricError) res.notes.push(`Rúbrica no disponible: ${r.rubricError}`);
  if (JSON.stringify(a) !== JSON.stringify(act)) await db.activities.put({ ...a, updatedAt: Date.now() });

  const load = async () => indexGrades(await db.grades.where('activityId').equals(act.id).toArray());
  let idx = await load();
  const handle = async (inc: Incoming) => {
    const sg = idx.get(inc.studentId) ?? noGrades();
    const cur = inc.nodeId ? sg.byItem.get(a.id)?.get(inc.nodeId) : sg.byActivity.get(a.id);
    const k = classify(cur, inc.value);
    const save = (p: Parameters<typeof saveGrade>[2]) => (inc.nodeId ? saveItemGrade(inc.studentId, a.id, inc.nodeId, p) : saveGrade(inc.studentId, a.id, p));
    if (k === 'same') { if (cur?.cls !== inc.value) await save({ cls: inc.value }); return; }
    if (k === 'apply') { await save({ value: inc.value, cls: inc.value, ...(inc.nodeId ? { level: undefined } : {}) }); res.applied++; return; }
    res.conflicts.push({ ...inc, activityId: a.id, current: cur?.value ?? null });
  };

  for (const sub of r.submissions) {
    const st = byUser.get(sub.userId);
    if (!st) { res.unmatched++; continue; }
    const cur = idx.get(st.id)?.byActivity.get(a.id);
    // Las puntuaciones de la rúbrica se guardan tal cual vienen: son datos de Classroom.
    if (JSON.stringify(sub.rubricGrades) !== JSON.stringify(cur?.rubric ?? [])) await saveGrade(st.id, a.id, { rubric: sub.rubricGrades.length ? sub.rubricGrades : undefined });
    const v = pointsValue(sub.assignedGrade ?? sub.draftGrade, a.maxPoints);
    if (v != null) await handle({ studentId: st.id, value: v });
  }
  idx = await load();
  for (const inc of rubricItems(a, students.map((s) => s.id), (id) => idx.get(id) ?? noGrades())) await handle(inc);
  return res;
}

/** Trae las notas de todas las actividades del grupo vinculadas con Classroom. */
export async function pullGroup(subject: Subject, group: Group, activities: Activity[]): Promise<PullResult & { count: number }> {
  const total = { ...empty(), count: 0 };
  for (const a of activities.filter((x) => x.classroomWorkId && !x.deleted)) {
    try {
      const r = await pullActivity(subject, a, group);
      total.applied += r.applied;
      total.conflicts.push(...r.conflicts);
      total.unmatched = Math.max(total.unmatched, r.unmatched);
      total.notes.push(...r.notes.map((n) => `${a.title}: ${n}`));
      total.count++;
    } catch (e) {
      total.notes.push(`${a.title}: ${(e as Error).message}`);
    }
  }
  return total;
}

/** Aplica notas pendientes de Classroom (el docente ha aceptado sobrescribir). */
export async function applyPending(list: Pending[]) {
  for (const p of list) {
    if (p.nodeId) await saveItemGrade(p.studentId, p.activityId, p.nodeId, { value: p.value, cls: p.value, level: undefined });
    else await saveGrade(p.studentId, p.activityId, { value: p.value, cls: p.value });
  }
}

/** Vuelve a calcular las notas por criterio desde las rúbricas de Classroom ya traídas (tras cambiar el emparejamiento). */
export async function remapRubric(act: Activity): Promise<PullResult> {
  const res = empty();
  const students = (await db.students.where('groupId').equals(act.groupId).toArray()).filter((s) => !s.deleted).map((s) => s.id);
  const idx = indexGrades(await db.grades.where('activityId').equals(act.id).toArray());
  for (const inc of rubricItems(act, students, (id) => idx.get(id) ?? noGrades())) {
    const cur = idx.get(inc.studentId)?.byItem.get(act.id)?.get(inc.nodeId!);
    const k = classify(cur, inc.value);
    if (k === 'apply') { await saveItemGrade(inc.studentId, act.id, inc.nodeId!, { value: inc.value, cls: inc.value, level: undefined }); res.applied++; }
    else if (k === 'conflict') res.conflicts.push({ ...inc, activityId: act.id, current: cur?.value ?? null });
  }
  return res;
}

/** Texto breve del resultado de una importación. */
export function describe(r: PullResult, extra = ''): string {
  return [
    `${r.applied} notas actualizadas desde Classroom${extra}`,
    r.conflicts.length ? `${r.conflicts.length} distintas a las que cambiaste en la app (sin tocar)` : '',
    r.unmatched ? `${r.unmatched} alumnos de Classroom sin emparejar (importa los alumnos en Grupos)` : '',
    ...r.notes,
  ].filter(Boolean).join(' · ');
}
