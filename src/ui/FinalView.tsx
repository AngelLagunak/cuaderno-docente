import { saveStudent } from '../data/db';
import { round } from '../core/evaluation';
import type { Curr, StudentGrades } from '../core/evaluation';
import { absenceSummary, outcome, scaleLabel } from '../core/rules';
import type { Activity, Attendance, Student, Subject } from '../core/model';
import { Cell, fmt } from './cells';

const SRC = { ordinaria: '', 'pérdida de evaluación continua': 'PEC', extraordinaria: 'Extr.' } as const;

/**
 * Vista Final: evaluaciones, ordinaria, faltas, nota oficial. Debajo, la pérdida de evaluación continua (la marca el
 * docente; la app solo avisa) y la convocatoria extraordinaria para quien no aprueba la ordinaria.
 */
export function FinalView(p: { subject: Subject; students: Student[]; acts: Activity[]; sgOf: (s: Student) => StudentGrades; curr: Curr; att: Attendance[]; partLabel: string; planned?: number }) {
  const { subject, students } = p;
  const cfg = subject.config;
  const d = cfg.finalDecimals;
  const rows = students.map((s) => ({ s, o: outcome(subject, p.acts, p.sgOf(s), p.curr, s), ab: absenceSummary(subject, p.att, s.id, p.planned) }));
  const lp = cfg.lec ?? { folderPct: 50, examPct: 50 };
  const ep = cfg.extra ?? { projectsPct: 40, examPct: 60, minEach: 0 };
  const pecRows = rows.filter((r) => r.ab.warn || r.s.lec);
  const extraRows = rows.filter((r) => {
    const ord = r.o.lec ? r.o.lec.rounded : r.o.ordinary.rounded;
    return (ord != null && ord < cfg.passMark) || r.s.extra;
  });
  const label = (v: number | null) => { const l = scaleLabel(subject, v); return l ? ` ${l}` : ''; };

  async function togglePec(s: Student, pct: number) {
    if (!s.lec && !confirm(`¿Marcar pérdida de evaluación continua para ${s.firstName} ${s.lastName}? Faltas injustificadas: ${pct.toFixed(1).replace('.', ',')} %.\nSu nota pasará a salir de la carpeta (${lp.folderPct} %) y el examen global (${lp.examPct} %).`)) return;
    await saveStudent(s, { lec: !s.lec });
  }

  return (
    <div>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Alumno</th>
              {subject.terms.map((t) => <th key={t.id} title={t.name}>{t.name.replace(/\s*evaluaci[oó]n/i, '')}</th>)}
              <th>Ordinaria</th>
              <th title={`Faltas injustificadas sobre ${rows[0]?.ab.base ?? 0} sesiones`}>Faltas</th>
              <th className="sum">Oficial</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, o, ab }) => {
              const f = o.ordinary;
              return (
                <tr key={s.id}>
                  <td>{s.lastName}, {s.firstName}</td>
                  {f.terms.map((t) => (
                    <td key={t.id} className={t.result.belowMin.length ? 'warn' : ''} title={t.result.belowMin.length ? `Bajo el aprobado: ${t.result.belowMin.join(', ')}` : ''}>
                      {fmt(round(t.result.value, 1), 1)}
                    </td>
                  ))}
                  <td className={(s.lec ? 'mute ' : '') + ((f.rounded != null && f.rounded < cfg.passMark) || f.belowMin ? 'warn' : '')}
                    title={s.lec ? 'No cuenta: pérdida de evaluación continua' : f.belowMin ? `Alguna parte (${p.partLabel}) por debajo del aprobado` : f.coverage < 1 ? 'Provisional' : ''}>
                    {s.lec ? <s>{fmt(f.rounded, d)}</s> : fmt(f.rounded, d)}{f.coverage < 1 && f.value != null ? '*' : ''}{f.belowMin ? '!' : ''}
                  </td>
                  <td className={ab.warn ? 'warn' : ''}>{ab.base ? `${Math.round(ab.pct)} %` : '—'}{ab.warn ? ' ⚠' : ''}{s.lec ? ' PEC' : ''}</td>
                  <td className={'sum' + (o.official != null && o.official < cfg.passMark ? ' warn' : '')}>
                    {fmt(o.official, d)}{label(o.official)} {SRC[o.source] && <span className="mute">{SRC[o.source]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mute">
        Ordinaria = evaluaciones {subject.terms.map((t) => t.weight).join('/')}. * provisional. ! alguna parte ({p.partLabel}) bajo el aprobado.
        Faltas: injustificadas; ⚠ a partir del {cfg.absenceWarnPct ?? 20} %. Oficial: la que va al acta (PEC = pérdida de evaluación continua; Extr. = extraordinaria).
      </p>

      <details className="card" open={pecRows.length > 0}>
        <summary>Pérdida de evaluación continua ({rows.filter((r) => r.s.lec).length} marcados · {rows.filter((r) => r.ab.warn).length} con aviso)</summary>
        <p className="mute">La app avisa al llegar al {cfg.absenceWarnPct ?? 20} % de faltas injustificadas; la decisión es tuya. Vía alternativa: carpeta {lp.folderPct} % + examen global {lp.examPct} %.</p>
        {pecRows.length === 0 && <p className="mute">Nadie llega al umbral.</p>}
        {pecRows.map(({ s, o, ab }) => (
          <div key={s.id} className="issue" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 140 }}>{s.lastName}, {s.firstName} <span className={ab.warn ? 'warn' : 'mute'}>{Math.round(ab.pct)} %</span></span>
            <label><input type="checkbox" checked={!!s.lec} onChange={() => togglePec(s, ab.pct)} /> PEC</label>
            {s.lec && (
              <>
                <label>Carpeta <Cell value={s.lecGrades?.folder} stamp={s.updatedAt} label="Carpeta" onSave={(v) => saveStudent(s, { lecGrades: { folder: v, exam: s.lecGrades?.exam ?? null } })} /></label>
                <label>Examen <Cell value={s.lecGrades?.exam} stamp={s.updatedAt} label="Examen global" onSave={(v) => saveStudent(s, { lecGrades: { folder: s.lecGrades?.folder ?? null, exam: v } })} /></label>
                <b>{fmt(o.lec?.rounded ?? null, d)}{label(o.lec?.rounded ?? null)}</b>
              </>
            )}
          </div>
        ))}
      </details>

      <details className="card" open={extraRows.length > 0}>
        <summary>Convocatoria extraordinaria ({extraRows.length})</summary>
        <p className="mute">
          Proyectos {ep.projectsPct} % + examen {ep.examPct} %{ep.minEach > 0 ? `. Hace falta al menos un ${String(ep.minEach).replace('.', ',')} en ambas partes para hacer media; si no, suspenso` : ''}.
          Solo cuenta si la ordinaria no está aprobada.
        </p>
        {extraRows.length === 0 && <p className="mute">Nadie suspende la ordinaria.</p>}
        {extraRows.map(({ s, o }) => (
          <div key={s.id} className="issue" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 140 }}>{s.lastName}, {s.firstName}</span>
            <label>Proyectos <Cell value={s.extra?.projects} stamp={s.updatedAt} label="Proyectos" onSave={(v) => saveStudent(s, { extra: { projects: v, exam: s.extra?.exam ?? null } })} /></label>
            <label>Examen <Cell value={s.extra?.exam} stamp={s.updatedAt} label="Examen extraordinario" onSave={(v) => saveStudent(s, { extra: { projects: s.extra?.projects ?? null, exam: v } })} /></label>
            <b>{o.extra ? `${fmt(o.extra.rounded, d)}${label(o.extra.rounded)}` : '—'}</b>
            {o.extra?.blocked && <span className="warn">no hace media (alguna parte &lt; {ep.minEach})</span>}
            {s.extra && o.source !== 'extraordinaria' && o.official != null && o.official >= cfg.passMark && <span className="mute">aprobado en ordinaria: no cuenta</span>}
          </div>
        ))}
      </details>
    </div>
  );
}
