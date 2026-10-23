import { useState } from 'react';
import { saveGrade, undoable } from '../data/db';
import { importChanges, parseCsv, planImport } from '../core/io';
import type { CellIn, ImportPlan } from '../core/io';
import type { StudentGrades } from '../core/evaluation';
import type { Activity, Student, Subject } from '../core/model';

/** Lee la primera hoja de un .xlsx o un .csv como tabla. */
async function readTable(file: File): Promise<CellIn[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as CellIn[][];
  }
  return parseCsv(await file.text());
}

/**
 * Importar notas desde CSV o Excel: una fila por alumno (NIA, correo o apellidos y nombre) y una columna por
 * actividad. Vista previa con el emparejamiento de columnas; las celdas vacías no borran notas.
 */
export function ImportGrades(p: { subject: Subject; students: Student[]; acts: Activity[]; sgOf: (s: Student) => StudentGrades; onDone: (msg: string) => void }) {
  const [table, setTable] = useState<CellIn[][] | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState('');
  const byId = new Map(p.students.map((s) => [s.id, s]));
  const current = (sid: string, aid: string) => { const s = byId.get(sid); return s ? p.sgOf(s).byActivity.get(aid) : undefined; };

  async function pick(f?: File) {
    if (!f) return;
    setErr('');
    try {
      const t = await readTable(f);
      setTable(t);
      setPlan(planImport(t, p.students, p.acts, p.subject.terms));
    } catch (e) { setErr('No se pudo leer el archivo: ' + (e as Error).message); }
  }

  const res = plan && table ? importChanges(plan, table, current) : null;
  const fresh = res?.changes.filter((c) => c.current == null) ?? [];
  const differ = res?.changes.filter((c) => c.current != null) ?? [];
  const todo = overwrite ? res?.changes ?? [] : fresh;

  async function run() {
    await undoable('importación de notas', async () => {
      for (const c of todo) await saveGrade(c.studentId, c.activityId, { value: c.value });
    });
    p.onDone(`Importadas ${todo.length} notas.${!overwrite && differ.length ? ` ${differ.length} distintas a las de la app sin tocar.` : ''}`);
  }

  return (
    <div className="card form">
      <b>Importar notas (CSV o Excel)</b>
      <p className="mute">Una fila por alumno (NIA, correo o apellidos y nombre) y una columna por actividad, con el título de la actividad en la cabecera. Sirve el CSV o Excel que exporta la app. Las celdas vacías no borran notas.</p>
      <input type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      {err && <p className="warn">{err}</p>}
      {plan && res && (
        <>
          <p className="mute">
            Alumnado reconocido por {plan.by === 'nia' ? 'NIA' : plan.by === 'email' ? 'correo' : plan.by === 'name' ? 'apellidos y nombre' : '— (falta una columna NIA, correo o apellidos)'}:
            {' '}{plan.rows.filter((r) => r.studentId).length} de {plan.rows.length} filas.
          </p>
          {plan.rows.some((r) => !r.studentId) && <p className="mute warn">Sin emparejar: {plan.rows.filter((r) => !r.studentId).map((r) => r.label).slice(0, 8).join('; ')}{plan.rows.filter((r) => !r.studentId).length > 8 ? '…' : ''}</p>}
          {plan.columns.filter((c) => !c.skip).map((c) => (
            <div className="issue" key={c.index} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 140 }}>{c.header}</span>
              <select value={c.activityId ?? ''} onChange={(e) => setPlan({ ...plan, columns: plan.columns.map((x) => (x.index === c.index ? { ...x, activityId: e.target.value || null } : x)) })}>
                <option value="">No importar</option>
                {p.acts.map((a) => <option key={a.id} value={a.id}>{a.title} · {p.subject.terms.find((t) => t.id === a.termId)?.name}</option>)}
              </select>
            </div>
          ))}
          <p>
            {fresh.length} notas nuevas · {differ.length} distintas a las de la app{res.invalid ? ` · ${res.invalid} celdas no válidas (se ignoran)` : ''}.
          </p>
          {differ.length > 0 && <label><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Sobrescribir también las {differ.length} distintas</label>}
        </>
      )}
      <div className="row">
        {plan && <button className="on" disabled={!todo.length} onClick={run}>Importar {todo.length}</button>}
        <button onClick={() => p.onDone('')}>Cerrar</button>
      </div>
    </div>
  );
}
