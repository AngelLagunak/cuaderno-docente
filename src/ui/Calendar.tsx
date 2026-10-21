import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { addDays, bySessionOrder, distribute, monday, parseHolidays, schoolDays, unitBalance, ymd } from '../core/planning';
import type { Activity, Group, LearningUnit, Session, Subject } from '../core/model';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const dm = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

/** Generar sesiones a partir del horario semanal del grupo, entre dos fechas y sin festivos. */
function Generate({ group, existing, onDone }: { group: Group; existing: Session[]; onDone: (m: string) => void }) {
  const [tt, setTt] = useState(group.timetable ?? []);
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState('');
  const [hol, setHol] = useState(group.holidays ?? '');
  const has = new Set(existing.map((s) => `${s.date}|${s.slot}`));
  const list = schoolDays(from, to, tt, parseHolidays(hol)).filter((x) => !has.has(`${x.date}|${x.slot}`));
  const toggle = (wd: number, slot: string) => setTt(tt.some((t) => t.weekday === wd && t.slot === slot) ? tt.filter((t) => !(t.weekday === wd && t.slot === slot)) : [...tt, { weekday: wd, slot }]);

  async function run() {
    const now = Date.now();
    await db.groups.put({ ...group, timetable: tt, holidays: hol, updatedAt: now });
    await db.sessions.bulkPut(list.map((x) => ({ id: uid(), groupId: group.id, date: x.date, slot: x.slot, topic: '', updatedAt: now })));
    onDone(`Creadas ${list.length} sesiones.`);
  }
  return (
    <div className="card form">
      <b>Generar sesiones</b>
      <p className="mute">Marca tus horas de clase con este grupo (hora = número de sesión del día).</p>
      <div className="tw">
        <table className="t">
          <thead><tr><th>Hora</th>{DAYS.map((d) => <th key={d}>{d.slice(0, 3)}</th>)}</tr></thead>
          <tbody>
            {['1', '2', '3', '4', '5', '6', '7'].map((h) => (
              <tr key={h}><td>{h}.ª</td>{DAYS.map((_, i) => (
                <td key={i}><input type="checkbox" style={{ width: 'auto' }} checked={tt.some((t) => t.weekday === i + 1 && t.slot === h)} onChange={() => toggle(i + 1, h)} /></td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <label>Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label>Festivos y vacaciones (una fecha o «inicio..fin» por línea)
        <textarea rows={3} placeholder={'2026-12-08\n2026-12-22..2027-01-07'} value={hol} onChange={(e) => setHol(e.target.value)} />
      </label>
      <p className="mute">{list.length} sesiones nuevas{has.size ? ' (las que ya existen no se duplican)' : ''}.</p>
      <div className="row">
        <button className="on" disabled={!list.length} onClick={run}>Crear {list.length} sesiones</button>
        <button onClick={() => onDone('')}>Cerrar</button>
      </div>
    </div>
  );
}

function SessionCard({ s, units, acts }: { s: Session; units: LearningUnit[]; acts: Activity[] }) {
  const save = (p: Partial<Session>) => db.sessions.put({ ...s, ...p, updatedAt: Date.now() });
  const u = units.find((x) => x.id === s.unitId);
  return (
    <div className="session">
      <div className="sp">
        <b>{s.slot}.ª h</b>
        <select value={s.unitId ?? ''} onChange={(e) => save({ unitId: e.target.value || undefined })} title={u?.title}>
          <option value="">Sin unidad</option>
          {units.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
        </select>
        <button className="small" title="Borrar sesión" onClick={() => confirm(`¿Borrar la sesión del ${dm(s.date)} (${s.slot}.ª h)?`) && softDelete(db.sessions, s)}>×</button>
      </div>
      <input placeholder="Tema / qué se hace" defaultValue={s.topic} key={'t' + s.updatedAt} onBlur={(e) => e.target.value !== s.topic && save({ topic: e.target.value })} />
      {acts.length > 0 && <div className="chips">{acts.map((a) => <span className="chip" key={a.id} title="Actividad con esta fecha">{a.title}</span>)}</div>}
    </div>
  );
}

/**
 * Calendario de sesiones por semanas: unidad y tema de cada sesión, y las actividades con esa fecha.
 * Generar sesiones desde el horario semanal y repartir las unidades según sus sesiones previstas.
 */
export function Calendar({ subject, groups, units, acts }: { subject: Subject; groups: Group[]; units: LearningUnit[]; acts: Activity[] }) {
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [week, setWeek] = useState(monday(ymd(new Date())));
  const [gen, setGen] = useState(false);
  const [msg, setMsg] = useState('');
  const raw = useLiveQuery(() => (group ? db.sessions.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const sessions = (raw ?? []).filter((s) => !s.deleted).sort(bySessionOrder);
  if (!group) return <p className="mute">Crea un grupo en la pestaña Grupos.</p>;
  const gActs = acts.filter((a) => a.groupId === group.id && !a.deleted);
  const days = DAYS.map((d, i) => ({ name: d, date: addDays(week, i) }));
  const bal = unitBalance(units, sessions);
  const next = sessions.find((s) => s.date >= ymd(new Date()));

  async function spread() {
    const m = distribute(sessions, units);
    if (!m.size) return setMsg('No hay sesiones libres o las unidades ya tienen todas sus sesiones.');
    if (!confirm(`Se asignará unidad a ${m.size} sesiones sin unidad, por orden (${units.map((u) => `${u.code}: ${u.plannedSessions}`).join(', ')}). ¿Continuar?`)) return;
    const now = Date.now();
    await db.sessions.bulkPut(sessions.filter((s) => m.has(s.id)).map((s) => ({ ...s, unitId: m.get(s.id), updatedAt: now })));
    setMsg(`Unidades repartidas en ${m.size} sesiones.`);
  }
  async function add(date: string) {
    const slot = prompt(`Nueva sesión el ${dm(date)}: hora (1–7)`, '1');
    if (!slot?.trim()) return;
    await db.sessions.put({ id: uid(), groupId: group!.id, date, slot: slot.trim(), topic: '', updatedAt: Date.now() });
  }

  return (
    <div>
      <div className="row">
        <select value={group.id} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className="small" onClick={() => setGen(!gen)}>Generar sesiones</button>
        <button className="small" disabled={!units.length || !sessions.length} onClick={spread}>Repartir unidades</button>
      </div>
      {gen && <Generate group={group} existing={sessions} onDone={(m) => { setGen(false); if (m) setMsg(m); }} />}
      {msg && <p className="mute">{msg}</p>}
      <div className="row">
        <button className="small" onClick={() => setWeek(addDays(week, -7))}>‹</button>
        <b>Semana del {dm(week)}</b>
        <button className="small" onClick={() => setWeek(addDays(week, 7))}>›</button>
        <button className="small" onClick={() => setWeek(monday(ymd(new Date())))}>Hoy</button>
        {next && <button className="small" onClick={() => setWeek(monday(next.date))}>Próxima sesión</button>}
      </div>
      <div className="week">
        {days.map((d) => {
          const list = sessions.filter((s) => s.date === d.date);
          const dayActs = gActs.filter((a) => a.date === d.date);
          return (
            <div className={'day' + (d.date === ymd(new Date()) ? ' today' : '')} key={d.date}>
              <div className="sp"><b>{d.name} {dm(d.date)}</b><button className="small" onClick={() => add(d.date)}>+</button></div>
              {list.map((s) => <SessionCard key={s.id} s={s} units={units} acts={dayActs} />)}
              {!list.length && dayActs.map((a) => <span className="chip" key={a.id}>{a.title}</span>)}
            </div>
          );
        })}
      </div>
      {units.length > 0 && (
        <details className="card">
          <summary>Sesiones por unidad ({sessions.length} sesiones · {sessions.filter((s) => !s.unitId).length} sin unidad)</summary>
          {bal.map(({ unit, planned, scheduled }) => {
            const ses = sessions.filter((s) => s.unitId === unit.id);
            return (
              <div className="issue" key={unit.id}>
                <b>{unit.code}</b>
                <span>{unit.title} <span className={planned !== scheduled ? 'warn' : 'mute'}>— previstas {planned} · programadas {scheduled}</span>
                  {ses.length > 0 && <span className="mute"> · {dm(ses[0].date)}–{dm(ses[ses.length - 1].date)} · {subject.terms.find((t) => t.id === unit.termId)?.name}</span>}</span>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
