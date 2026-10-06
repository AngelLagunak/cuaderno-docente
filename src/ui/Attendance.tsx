import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useGroups } from './hooks';
import type { AttStatus, Attendance as Att, Student, Subject } from '../core/model';

const STATUS: [AttStatus, string][] = [['P', 'Presente'], ['A', 'Ausente'], ['R', 'Retraso'], ['J', 'Justificada']];

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const weekStart = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const dmy = (s: string) => s.split('-').reverse().join('/');
const q = (x: string) => `"${x.replace(/"/g, '""')}"`;

function download(name: string, rows: string[][]) {
  const text = '\ufeff' + rows.map((r) => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
}

export function Attendance({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [view, setView] = useState<'list' | 'sum'>('list');
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es'));
  const recRaw = useLiveQuery(() => (group ? db.attendance.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const recs = (recRaw ?? []).filter((r) => !r.deleted);
  const byKey = new Map(recs.map((r) => [r.id, r]));
  const key = (s: Student, d = date, sl = slot) => `${s.id}|${d}|${sl}`;
  const sessionHeld = students.some((s) => byKey.has(key(s)));

  const mk = (s: Student, status: AttStatus, now: number): Att => ({
    id: key(s), studentId: s.id, groupId: group!.id, date, slot, status, updatedAt: now, ...(byKey.get(key(s))?.note ? { note: byKey.get(key(s))!.note } : {}),
  });

  async function setStatus(s: Student, st: AttStatus) {
    const now = Date.now();
    const missing = students.filter((x) => !byKey.has(key(x)) && x.id !== s.id).map((x) => mk(x, 'P', now));
    await db.attendance.bulkPut([...missing, mk(s, st, now)]);
  }
  async function markAll() {
    const now = Date.now();
    await db.attendance.bulkPut(students.filter((s) => !byKey.has(key(s))).map((s) => mk(s, 'P', now)));
  }
  async function delSession() {
    if (!confirm(`¿Borrar la sesión del ${dmy(date)} (hora ${slot})?`)) return;
    const now = Date.now();
    await db.attendance.bulkPut(recs.filter((r) => r.date === date && r.slot === slot).map((r) => ({ ...r, deleted: true, updatedAt: now })));
  }

  // Resumen
  const inRange = recs.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const sessions = [...new Set(inRange.map((r) => `${r.date}|${r.slot}`))].sort();
  const warnPct = subject.config.absenceWarnPct ?? 20;
  const annual = subject.config.annualSessions ?? 0;
  const base = annual > 0 && !from && !to ? annual : sessions.length;
  const counts = (s: Student) => {
    const c = { P: 0, A: 0, R: 0, J: 0 };
    for (const r of inRange) if (r.studentId === s.id) c[r.status]++;
    return c;
  };
  const pct = (n: number) => (base > 0 ? (n / base) * 100 : 0);

  function exportSessions() {
    const head = ['Apellidos', 'Nombre', 'NIA', ...sessions.map((x) => { const [d, sl] = x.split('|'); return `${dmy(d)} h${sl}`; }), 'Ausencias', 'Justificadas', 'Retrasos'];
    const rows = students.map((s) => {
      const c = counts(s);
      return [s.lastName, s.firstName, s.nia ?? '', ...sessions.map((x) => byKey.get(`${s.id}|${x}`)?.status ?? ''), String(c.A), String(c.J), String(c.R)];
    });
    download(`asistencia-${group?.name ?? ''}.csv`, [head, ...rows]);
  }
  function exportWeekly() {
    const weeks = [...new Set(sessions.map((x) => weekStart(x.split('|')[0])))].sort();
    const head = ['Apellidos', 'Nombre', 'NIA', ...weeks.map((w) => `Semana ${dmy(w)}`)];
    const rows = students.map((s) => [s.lastName, s.firstName, s.nia ?? '', ...weeks.map((w) => {
      const c = { A: 0, J: 0, R: 0 };
      for (const r of inRange) if (r.studentId === s.id && weekStart(r.date) === w && r.status !== 'P') c[r.status]++;
      return [c.A && `A${c.A}`, c.J && `J${c.J}`, c.R && `R${c.R}`].filter(Boolean).join(' ');
    })]);
    download(`asistencia-semanal-${group?.name ?? ''}.csv`, [head, ...rows]);
  }

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;

  return (
    <div>
      <div className="row">
        <select value={group.id} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Pasar lista</button>
        <button className={view === 'sum' ? 'on' : ''} onClick={() => setView('sum')}>Resumen</button>
      </div>
      {students.length === 0 && <p className="mute">Este grupo no tiene alumnos.</p>}

      {students.length > 0 && view === 'list' && (
        <div className="card">
          <div className="row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <label>Hora <input className="num" style={{ width: 60 }} value={slot} onChange={(e) => setSlot(e.target.value.trim() || '1')} /></label>
            {!sessionHeld && <button className="on" onClick={markAll}>Todos presentes</button>}
            {sessionHeld && <button className="small" onClick={delSession}>Borrar sesión</button>}
          </div>
          {!sessionHeld && <p className="mute">Sesión sin lista. Pulsa «Todos presentes» o marca a quien falte.</p>}
          {students.map((s) => {
            const st = byKey.get(key(s))?.status ?? 'P';
            return (
              <div className="issue sp" key={s.id} style={{ alignItems: 'center' }}>
                <span>{s.lastName}, {s.firstName}</span>
                <span className="row" style={{ margin: 0, flexWrap: 'nowrap' }}>
                  {STATUS.map(([k, l]) => (
                    <button key={k} title={l} aria-label={l} className={'small' + (sessionHeld && st === k ? ' on' : '')} onClick={() => setStatus(s, k)}>{k}</button>
                  ))}
                </span>
              </div>
            );
          })}
          <p className="mute">P presente · A ausente · R retraso · J falta justificada</p>
        </div>
      )}

      {students.length > 0 && view === 'sum' && (
        <>
          <div className="row">
            <label>Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <p className="mute">
            {sessions.length} sesiones pasadas lista. Base del %: {base} {annual > 0 && !from && !to ? '(sesiones anuales previstas)' : '(sesiones pasadas lista)'}. Aviso a partir del {warnPct} % de faltas injustificadas (A).
          </p>
          <div className="tw">
            <table className="t">
              <thead><tr><th>Alumno</th><th>A</th><th>J</th><th>R</th><th>% inj.</th></tr></thead>
              <tbody>
                {students.map((s) => {
                  const c = counts(s);
                  const p = pct(c.A);
                  const warn = base > 0 && p >= warnPct;
                  return (
                    <tr key={s.id}>
                      <td>{s.lastName}, {s.firstName}</td>
                      <td className={warn ? 'warn' : ''}>{c.A}</td><td>{c.J}</td><td>{c.R}</td>
                      <td className={'sum' + (warn ? ' warn' : '')}>{p.toFixed(1).replace('.', ',')}{warn ? ' ⚠' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button onClick={exportSessions} disabled={!sessions.length}>Exportar por sesión (CSV)</button>
            <button onClick={exportWeekly} disabled={!sessions.length}>Exportar resumen semanal (CSV)</button>
          </div>
          <p className="mute">El formato se ajustará cuando tengamos un ejemplo de exportación de SIGAD.</p>
        </>
      )}
    </div>
  );
}
