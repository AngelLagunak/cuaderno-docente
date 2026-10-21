import { useState } from 'react';
import { saveGrade, undoable } from '../data/db';
import { itemGrades } from '../core/evaluation';
import type { StudentGrades } from '../core/evaluation';
import { obsGrade } from '../core/rules';
import { defaultObservations } from '../core/model';
import type { Activity, Attendance, Group, Student, Subject } from '../core/model';
import { useSchoolCalendar } from './hooks';
import { fmt } from './cells';

/**
 * Actividad de dinámica del aula: propone la nota de cada alumno con las observaciones marcadas al pasar lista
 * en las fechas de la evaluación (calendario escolar) y la aplica de una vez (se puede deshacer).
 */
export function ObsPanel(p: { subject: Subject; group: Group; act: Activity; students: Student[]; att: Attendance[]; sgOf: (s: Student) => StudentGrades; onMsg: (m: string) => void }) {
  const { subject, act } = p;
  const cal = useSchoolCalendar(p.group.schoolYear);
  const ti = subject.terms.findIndex((t) => t.id === act.termId);
  const range = cal?.terms[ti];
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const f = from ?? range?.start ?? '', t = to ?? range?.end ?? '';
  const aspects = subject.config.observations ?? defaultObservations();
  const rows = p.students.map((s) => ({ s, r: obsGrade(subject, p.att, s.id, f, t), cur: p.sgOf(s).byActivity.get(act.id)?.value ?? null, items: itemGrades(act, p.sgOf(s)).length > 0 }));

  async function apply() {
    const todo = rows.filter((x) => !x.items && x.cur !== x.r.value);
    const changed = todo.filter((x) => x.cur != null).length;
    if (changed && !confirm(`Se cambiarán ${changed} notas ya puestas. ¿Continuar?`)) return;
    await undoable('notas desde observaciones', async () => {
      for (const x of todo) await saveGrade(x.s.id, act.id, { value: x.r.value });
    });
    const skipped = rows.filter((x) => x.items).length;
    p.onMsg(`Aplicadas ${todo.length} notas desde las observaciones.${skipped ? ` ${skipped} con nota por criterio sin tocar.` : ''}`);
  }

  return (
    <details className="card" open>
      <summary>Nota desde las observaciones del aula</summary>
      <div className="row">
        <label>Desde <input type="date" value={f} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={t} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="mute">
        {subject.config.obsBase ?? 6} {'+'} {String(subject.config.obsStep ?? 0.5).replace('.', ',')} por cada marca positiva − {String(subject.config.obsStep ?? 0.5).replace('.', ',')} por cada negativa (entre 0 y 10). Se cambia en Configuración.
        {!range?.start && ' Sin fechas de esta evaluación en el Calendario escolar: se cuentan todas las sesiones salvo que elijas fechas.'}
      </p>
      <div className="tw">
        <table className="t">
          <thead><tr><th>Alumno</th>{aspects.map((a) => <th key={a.id} title={a.label}>{a.sign > 0 ? '+' : '−'} {a.label}</th>)}<th className="sum">Propuesta</th><th className="sum">Actual</th></tr></thead>
          <tbody>
            {rows.map(({ s, r, cur, items }) => (
              <tr key={s.id}>
                <td>{s.lastName}, {s.firstName}</td>
                {aspects.map((a) => <td key={a.id}>{r.counts[a.id] || '·'}</td>)}
                <td className="sum">{fmt(r.value, 2)}</td>
                <td className={'sum' + (cur != null && cur !== r.value ? ' warn' : '')} title={items ? 'Tiene nota por criterio: no se cambia' : ''}>{items ? 'por criterio' : fmt(cur, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row"><button className="on" onClick={apply}>Aplicar propuesta</button></div>
    </details>
  );
}
