import { useState } from 'react';
import { db, saveActivity, undoable } from '../data/db';
import { callScript } from '../data/api';
import { describe, remapRubric } from '../data/classroomSync';
import type { PullResult } from '../data/classroomSync';
import { gradedLevels } from '../core/curriculum';
import { activityBase, indexGrades, noGrades } from '../core/evaluation';
import type { Activity, CNode, Group, Student, Subject } from '../core/model';

/**
 * Emparejamiento de las filas de la rúbrica de Classroom con criterios. Al guardar, las puntuaciones de cada fila
 * pasan a ser notas de ese criterio (sin pisar las que cambiaste en la app).
 */
export function RubricMap(p: { subject: Subject; act: Activity; nodes: CNode[]; onResult: (r: PullResult) => void }) {
  const { act } = p;
  const [map, setMap] = useState<Record<string, string>>(act.classroomRubricMap ?? {});
  const graded = gradedLevels(p.subject);
  const opts = p.nodes.filter((n) => graded.has(n.level));
  if (!act.rubric) return null;
  const rows = act.rubric.criteria;
  const done = rows.filter((c) => map[c.id]).length;
  const dirty = JSON.stringify(map) !== JSON.stringify(act.classroomRubricMap ?? {});

  async function save() {
    const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
    const a = { ...act, classroomRubricMap: clean, nodeIds: [...new Set([...act.nodeIds, ...Object.values(clean)])], updatedAt: Date.now() };
    await saveActivity(a);
    p.onResult(await undoable('emparejamiento de rúbrica', () => remapRubric(a)));
  }

  return (
    <details className="card" open={dirty || rows.some((c) => !act.classroomRubricMap?.[c.id])}>
      <summary>Rúbrica de Classroom: {done}/{rows.length} filas con criterio</summary>
      <p className="mute">Cada fila de la rúbrica mide un criterio. Las filas que empiezan por un código («3.2 …») se emparejan solas. Las filas sin criterio no cuentan en la nota por criterio.</p>
      {rows.map((c) => (
        <div className="issue" key={c.id} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 160 }}>{c.title || 'Fila sin título'} <span className="mute">· máx. {Math.max(0, ...c.levels.map((l) => l.points))} pts</span></span>
          <select value={map[c.id] ?? ''} onChange={(e) => setMap({ ...map, [c.id]: e.target.value })}>
            <option value="">Sin criterio</option>
            {opts.map((n) => <option key={n.id} value={n.id}>{n.code} {n.title.slice(0, 50)}</option>)}
          </select>
        </div>
      ))}
      {dirty && <div className="row"><button className="on" onClick={save}>Guardar y aplicar</button></div>}
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
