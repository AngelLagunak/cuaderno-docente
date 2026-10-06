import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useGroups } from './hooks';
import { finalResult, round, termResult, wmean, effectiveValue } from '../core/evaluation';
import type { Num } from '../core/evaluation';
import type { Activity, Grade, Student, Subject } from '../core/model';

const fmt = (v: Num, d: number) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const raw = (v: Num | undefined) => (v == null ? '' : String(v).replace('.', ','));
const parse = (t: string): Num | undefined => {
  const s = t.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined;
};

async function saveGrade(studentId: string, activityId: string, patch: Partial<Grade>) {
  const id = `${studentId}|${activityId}`;
  const cur = await db.grades.get(id);
  await db.grades.put({ id, studentId, activityId, value: null, ...cur, ...patch, updatedAt: Date.now() });
}

function Cell({ g, s, a }: { g?: Grade; s: Student; a: Activity }) {
  const [bad, setBad] = useState(false);
  return (
    <input
      className={'cell' + (bad ? ' bad' : '')}
      inputMode="decimal"
      defaultValue={raw(g?.value)}
      key={g?.updatedAt ?? 0}
      aria-label={`${s.lastName} · ${a.title}`}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={(e) => {
        const v = parse(e.target.value);
        if (v === undefined) { setBad(true); e.target.value = raw(g?.value); return; }
        setBad(false);
        if (v !== (g?.value ?? null)) saveGrade(s.id, a.id, { value: v });
      }}
    />
  );
}

export function Notebook({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [view, setView] = useState<'table' | 'act' | 'final'>('table');
  const [termId, setTermId] = useState('');
  const [actId, setActId] = useState('');

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es'));
  const acRaw = useLiveQuery(() => (group ? db.activities.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const termIdx = (id: string) => subject.terms.findIndex((t) => t.id === id);
  const acts = (acRaw ?? []).filter((a) => !a.deleted).sort((a, b) => termIdx(a.termId) - termIdx(b.termId) || (a.date ?? '').localeCompare(b.date ?? '') || a.title.localeCompare(b.title, 'es'));
  const key = acts.map((a) => a.id).join(',');
  const grRaw = useLiveQuery(() => (acts.length ? db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : []), [key]);
  const gm = new Map((grRaw ?? []).filter((g) => !g.deleted).map((g) => [`${g.studentId}|${g.activityId}`, g]));

  const term = subject.terms.find((t) => t.id === termId) ?? subject.terms[0];
  const termActs = acts.filter((a) => a.termId === term?.id);
  const act = acts.find((a) => a.id === actId) ?? termActs[0] ?? acts[0];
  const cfg = subject.config;
  const studentGrades = (s: Student) => new Map(acts.flatMap((a) => { const g = gm.get(`${s.id}|${a.id}`); return g ? [[a.id, g] as [string, Grade]] : []; }));
  const instName = (id: string) => subject.instruments.find((i) => i.id === id)?.name ?? '?';

  function exportCsv() {
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const head = ['Apellidos', 'Nombre', ...acts.map((a) => `${a.title} (${subject.terms.find((t) => t.id === a.termId)?.name})`), ...subject.terms.map((t) => t.name), 'Final'];
    const lines = students.map((s) => {
      const m = studentGrades(s);
      const f = finalResult(subject, acts, m);
      return [s.lastName, s.firstName,
        ...acts.map((a) => raw(gm.get(`${s.id}|${a.id}`)?.value)),
        ...f.terms.map((t) => fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)),
        fmt(f.rounded, cfg.finalDecimals)].map((x) => q(String(x))).join(';');
    });
    const blob = new Blob(['\ufeff' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notas-${group?.name ?? 'grupo'}.csv`;
    a.click();
  }

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;

  const LateBtn = ({ s, a }: { s: Student; a: Activity }) => {
    const g = gm.get(`${s.id}|${a.id}`);
    if (!cfg.latePenaltyPct || g?.value == null) return null;
    return <button className={'small late' + (g.late ? ' on' : '')} title={`Entrega tardía (−${cfg.latePenaltyPct} %)`} onClick={() => saveGrade(s.id, a.id, { late: !g.late })}>T</button>;
  };

  return (
    <div>
      <div className="row">
        <select value={group.id} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Tabla</button>
        <button className={view === 'act' ? 'on' : ''} onClick={() => setView('act')}>Por actividad</button>
        <button className={view === 'final' ? 'on' : ''} onClick={() => setView('final')}>Final</button>
        <button className="small" onClick={exportCsv}>Exportar CSV</button>
      </div>

      {students.length === 0 && <p className="mute">Este grupo no tiene alumnos.</p>}
      {students.length > 0 && acts.length === 0 && <p className="mute">Crea actividades en el Planificador.</p>}

      {students.length > 0 && acts.length > 0 && view !== 'final' && (
        <div className="row">
          {view === 'table' ? (
            <select value={term.id} onChange={(e) => setTermId(e.target.value)}>
              {subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <select value={act?.id} onChange={(e) => setActId(e.target.value)}>
              {acts.map((a) => <option key={a.id} value={a.id}>{a.title} · {subject.terms.find((t) => t.id === a.termId)?.name}</option>)}
            </select>
          )}
        </div>
      )}

      {students.length > 0 && acts.length > 0 && view === 'table' && (
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Alumno</th>
                {termActs.map((a) => <th key={a.id} title={`${a.title} · ${instName(a.instrumentId)}`}>{a.title}<div className="mute">{instName(a.instrumentId).slice(0, 10)}</div></th>)}
                {subject.instruments.map((i) => <th key={i.id} className="sum">{i.name.slice(0, 10)}</th>)}
                <th className="sum">{term.name}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const r = termResult(subject, acts, studentGrades(s), term.id);
                return (
                  <tr key={s.id}>
                    <td>{s.lastName}, {s.firstName}</td>
                    {termActs.map((a) => <td key={a.id}><Cell g={gm.get(`${s.id}|${a.id}`)} s={s} a={a} /><LateBtn s={s} a={a} /></td>)}
                    {r.byInstrument.map((i) => <td key={i.id} className={'sum' + (cfg.minPerInstrument && i.value != null && i.value < cfg.passMark ? ' warn' : '')}>{fmt(round(i.value, cfg.termDecimals), cfg.termDecimals)}</td>)}
                    <td className="sum" title={r.coverage < 1 ? `Provisional: ${Math.round(r.coverage * 100)} % de instrumentos con datos` : ''}>
                      {fmt(round(r.value, cfg.termDecimals), cfg.termDecimals)}{r.coverage < 1 && r.value != null ? '*' : ''}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="mute">Media</td>
                {termActs.map((a) => <td key={a.id} className="mute">{fmt(round(wmean(students.map((s): [Num, number] => [effectiveValue(gm.get(`${s.id}|${a.id}`), subject), 1])), 1), 1)}</td>)}
                <td colSpan={subject.instruments.length + 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === 'table' && students.length > 0 && <p className="mute">* Provisional: faltan instrumentos por evaluar. Lo no evaluado no cuenta como 0. Se guarda al salir de la casilla o con Intro.</p>}

      {students.length > 0 && acts.length > 0 && view === 'act' && act && (
        <div className="card">
          <b>{act.title}</b>
          <div className="mute">{instName(act.instrumentId)} · peso {act.weight}</div>
          {students.map((s) => {
            const g = gm.get(`${s.id}|${act.id}`);
            return (
              <div className="issue sp" key={s.id} style={{ alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{s.lastName}, {s.firstName}</span>
                <input className="cell" style={{ width: 140 }} placeholder="Comentario" defaultValue={g?.comment ?? ''} key={'c' + (g?.updatedAt ?? 0)}
                  onBlur={(e) => e.target.value !== (g?.comment ?? '') && saveGrade(s.id, act.id, { comment: e.target.value || undefined })} />
                <span><Cell g={g} s={s} a={act} /><LateBtn s={s} a={act} /></span>
              </div>
            );
          })}
        </div>
      )}

      {students.length > 0 && acts.length > 0 && view === 'final' && (
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Alumno</th>
                {subject.terms.map((t) => <th key={t.id}>{t.name}</th>)}
                <th className="sum">Final</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const f = finalResult(subject, acts, studentGrades(s));
                const fail = f.rounded != null && f.rounded < cfg.passMark;
                return (
                  <tr key={s.id}>
                    <td>{s.lastName}, {s.firstName}</td>
                    {f.terms.map((t) => (
                      <td key={t.id} className={t.result.belowMin.length ? 'warn' : ''} title={t.result.belowMin.length ? `Bajo mínimo: ${t.result.belowMin.join(', ')}` : ''}>
                        {fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)}
                      </td>
                    ))}
                    <td className={'sum' + (fail || f.belowMin ? ' warn' : '')} title={f.belowMin ? 'Algún instrumento por debajo del mínimo' : f.coverage < 1 ? 'Provisional' : ''}>
                      {fmt(f.rounded, cfg.finalDecimals)}{f.coverage < 1 && f.value != null ? '*' : ''}{f.belowMin ? '!' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {view === 'final' && <p className="mute">Final = media ponderada de las evaluaciones con datos. * provisional. ! algún instrumento bajo el mínimo (en rojo).</p>}
    </div>
  );
}
