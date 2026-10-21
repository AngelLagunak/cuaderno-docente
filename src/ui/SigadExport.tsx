import { useState } from 'react';
import { planSigad, sigadValue } from '../core/sigad';
import type { SigadPlan, SigadWhat } from '../core/sigad';
import { outcome, scaleLabel } from '../core/rules';
import type { Curr, StudentGrades } from '../core/evaluation';
import type { Activity, Student, Subject } from '../core/model';

/**
 * Notas para SIGAD: se carga el listado descargado de SIGAD (.xls con Apellido1, Apellido2, Nombre y Calificación),
 * se rellena la calificación de cada alumno y se descarga para subirlo de nuevo a SIGAD.
 */
export function SigadExport(p: { subject: Subject; students: Student[]; acts: Activity[]; sgOf: (s: Student) => StudentGrades; curr: Curr; onDone: (msg: string) => void }) {
  const { subject } = p;
  const [what, setWhat] = useState('ordinary');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [plan, setPlan] = useState<SigadPlan | null>(null);
  const [err, setErr] = useState('');
  const sel: SigadWhat = what === 'ordinary' ? { kind: 'ordinary' } : what === 'extra' ? { kind: 'extra' } : { kind: 'term', termId: what };
  const byId = new Map(p.students.map((s) => [s.id, s]));
  const value = (sid: string | null) => {
    const s = sid ? byId.get(sid) : undefined;
    return s ? sigadValue(subject, outcome(subject, p.acts, p.sgOf(s), p.curr, s), sel) : null;
  };

  async function pick(f?: File) {
    if (!f) return;
    setErr(''); setPlan(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { readXls } = await import('../core/xls');
      const [sheet] = readXls(bytes);
      const pl = sheet && planSigad(sheet.rows, p.students);
      if (!pl) return setErr('No encuentro la columna «Calificación». ¿Es el listado descargado de SIGAD?');
      setFile({ name: f.name, bytes });
      setPlan(pl);
    } catch (e) { setErr('No se pudo leer el archivo: ' + (e as Error).message); }
  }

  async function download() {
    if (!file || !plan) return;
    const { fillXls } = await import('../core/xls');
    const out = fillXls(file.bytes, 0, plan.rows.map((r) => ({ row: r.row, col: plan.gradeCol, value: value(r.studentId) })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.ms-excel' }));
    a.download = file.name.replace(/(\.xls)?$/i, '') + '-notas.xls';
    a.click();
    p.onDone(`Archivo para SIGAD descargado (${filled} notas). Súbelo en SIGAD desde la misma pantalla de donde lo descargaste.`);
  }

  const used = new Set(plan?.rows.map((r) => r.studentId).filter(Boolean));
  const notInFile = p.students.filter((s) => !used.has(s.id));
  const filled = plan?.rows.filter((r) => value(r.studentId) != null).length ?? 0;
  const label = (v: number | null) => (v == null ? '—' : String(v).replace('.', ',') + (scaleLabel(subject, v) ? ` ${scaleLabel(subject, v)}` : ''));

  return (
    <div className="card form">
      <b>Notas para SIGAD</b>
      <p className="mute">1. Descarga de SIGAD el listado de calificaciones del grupo (Excel). 2. Elige qué nota va y carga el archivo. 3. Descarga el archivo relleno y súbelo a SIGAD.</p>
      <label>Nota
        <select value={what} onChange={(e) => setWhat(e.target.value)}>
          {subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="ordinary">Final ordinaria</option>
          <option value="extra">Extraordinaria</option>
        </select>
      </label>
      <input type="file" accept=".xls,application/vnd.ms-excel" onChange={(e) => pick(e.target.files?.[0])} />
      {err && <p className="warn">{err}</p>}
      {plan && (
        <>
          <p className="mute">{plan.rows.filter((r) => r.studentId).length} de {plan.rows.length} filas emparejadas por apellidos y nombre · {filled} con nota.</p>
          <div className="tw">
            <table className="t">
              <thead><tr><th>Listado de SIGAD</th><th>Alumno en la app</th><th>Nota</th></tr></thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.label}</td>
                    <td>
                      <select value={r.studentId ?? ''} className={r.studentId ? '' : 'bad'} onChange={(e) => setPlan({ ...plan, rows: plan.rows.map((x) => (x.row === r.row ? { ...x, studentId: e.target.value || null } : x)) })}>
                        <option value="">— Sin nota —</option>
                        {p.students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
                      </select>
                    </td>
                    <td className="sum">{label(value(r.studentId))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notInFile.length > 0 && <p className="mute warn">No están en el listado: {notInFile.map((s) => `${s.lastName}, ${s.firstName}`).join('; ')}.</p>}
          {subject.config.finalDecimals > 0 && <p className="mute warn">Las notas llevan {subject.config.finalDecimals} decimal(es) (Configuración → Decimales en la nota final). Comprueba que SIGAD los admite.</p>}
        </>
      )}
      <div className="row">
        {plan && <button className="on" disabled={!filled} onClick={download}>Descargar para SIGAD</button>}
        <button onClick={() => p.onDone('')}>Cerrar</button>
      </div>
    </div>
  );
}
