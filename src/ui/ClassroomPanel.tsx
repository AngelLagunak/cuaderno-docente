import { useState } from 'react';
import { saveActivity, undoable } from '../data/db';
import { callScript } from '../data/api';
import { describe, remapRubric } from '../data/classroomSync';
import type { PullResult } from '../data/classroomSync';
import { assessableNodes } from '../core/curriculum';
import { mappedNodes, rowNodes } from '../core/classroom';
import { activityBase, indexGrades, noGrades } from '../core/evaluation';
import type { Activity, CLink, CNode, Group, Student, Subject } from '../core/model';

/**
 * Rúbrica de Classroom (filas y niveles, traídos con las notas de cada alumno) y las concreciones que mide cada fila:
 * Classroom no permite indicarlas, así que se enlazan aquí. Una fila puede medir varias concreciones. Al guardar, los
 * puntos de cada alumno en la fila pasan a ser su nota en esas concreciones (sin pisar las que cambiaste en la app).
 */
export function RubricMap(p: { subject: Subject; act: Activity; nodes: CNode[]; links: CLink[]; onResult: (r: PullResult) => void; open?: boolean; onSaved?: (a: Activity) => void }) {
  const { act } = p;
  const init = () => Object.fromEntries(Object.keys(act.classroomRubricMap ?? {}).map((k) => [k, rowNodes(act.classroomRubricMap, k)]));
  const [map, setMap] = useState<Record<string, string[]>>(init);
  if (!act.rubric) return null;
  const opts = assessableNodes(p.subject, p.nodes, p.links);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const rows = act.rubric.criteria;
  const done = rows.filter((c) => map[c.id]?.length).length;
  const dirty = JSON.stringify(Object.fromEntries(Object.entries(map).filter(([, v]) => v.length))) !== JSON.stringify(Object.fromEntries(Object.entries(init()).filter(([, v]) => v.length)));
  const set = (row: string, ids: string[]) => setMap({ ...map, [row]: ids });

  async function save() {
    const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v.length));
    const a = { ...act, classroomRubricMap: clean, nodeIds: [...new Set([...act.nodeIds, ...mappedNodes(clean)])] };
    await saveActivity(a);
    p.onSaved?.(a);
    p.onResult(await undoable('emparejamiento de rúbrica', () => remapRubric(a)));
  }

  return (
    <details className="card rubricmap" open={p.open || dirty || rows.some((c) => !rowNodes(act.classroomRubricMap, c.id).length)}>
      <summary>Rúbrica de Classroom: {done} de {rows.length} filas enlazadas con concreciones</summary>
      <p className="mute">Classroom no guarda qué evalúa cada fila: elige aquí las concreciones. Las filas que empiezan por un código («1.1.2 …») se enlazan solas. Las notas de la rúbrica ya están traídas; al guardar pasan a las concreciones.</p>
      {rows.map((c) => (
        <div className="rrow" key={c.id}>
          <div><b>{c.title || 'Fila sin título'}</b> <span className="mute">· {c.levels.map((l) => `${l.title || 'nivel'} ${l.points}`).join(' / ')}</span></div>
          <div className="chips">
            {(map[c.id] ?? []).map((id) => (
              <span className="chip" key={id} title={byId.get(id)?.title}>{byId.get(id)?.code ?? '?'}<button aria-label="Quitar" onClick={() => set(c.id, (map[c.id] ?? []).filter((x) => x !== id))}>×</button></span>
            ))}
            <select aria-label={`Añadir concreción a ${c.title}`} value="" onChange={(e) => e.target.value && set(c.id, [...(map[c.id] ?? []), e.target.value])}>
              <option value="">+ concreción</option>
              {opts.filter((n) => !(map[c.id] ?? []).includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.code} {n.title.slice(0, 60)}</option>)}
            </select>
          </div>
        </div>
      ))}
      {dirty && <div className="row"><button className="on" onClick={save}>Guardar y pasar las notas</button><button onClick={() => setMap(init())}>Deshacer cambios</button></div>}
    </details>
  );
}

/** Envía las notas de la app a una tarea creada desde la app (como borrador: el alumnado no las ve hasta que las devuelvas). */
export function PushGrades(p: { act: Activity; group: Group; students: Student[]; grades: Parameters<typeof indexGrades>[0]; onMsg: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!p.act.classroomCreated || !p.act.classroomWorkId || !p.group.classroomCourseId) return null;
  async function push() {
    const max = p.act.maxPoints || 10;
    const idx = indexGrades(p.grades);
    const list = p.students
      .filter((s) => s.classroomUserId)
      .map((s) => ({ userId: s.classroomUserId!, v: activityBase(p.act, idx.get(s.id) ?? noGrades()) }))
      .filter((x): x is { userId: string; v: number } => x.v != null)
      .map((x) => ({ userId: x.userId, grade: Math.round((x.v / 10) * max * 100) / 100 }));
    if (!list.length) return p.onMsg('No hay notas que enviar.');
    if (!confirm(`Se enviarán ${list.length} notas a Classroom como borrador (sobre ${max}). ¿Continuar?`)) return;
    setBusy(true);
    try {
      const r = await callScript<{ updated: number; errors: string[] }>('classroom.grades.push', { courseId: p.group.classroomCourseId, courseWorkId: p.act.classroomWorkId, grades: list });
      p.onMsg(`${r.updated} notas enviadas a Classroom como borrador.${r.errors.length ? ' Errores: ' + r.errors.join('; ') : ''}`);
    } catch (e) {
      p.onMsg('Error: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <button className="small" disabled={busy} onClick={push}>Enviar notas a Classroom (borrador)</button>;
}

export { describe };
