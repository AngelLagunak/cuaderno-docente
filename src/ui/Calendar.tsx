import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { addDays, bySessionOrder, distribute, holidayItems, monday, parseHolidays, previousPending, schoolDays, unitBalance, ymd } from '../core/planning';
import { DAYS, TimetableGrid } from './Timetable';
import { useSchoolCalendar } from './hooks';
import type { Activity, Group, LearningUnit, Session, Subject } from '../core/model';

const dm = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

/** Generar sesiones a partir del horario semanal del grupo y el calendario escolar (sin días no lectivos). */
function Generate({ group, existing, onDone }: { group: Group; existing: Session[]; onDone: (m: string) => void }) {
  const cal = useSchoolCalendar(group.schoolYear);
  const [tt, setTt] = useState(group.timetable ?? []);
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState('');
  const [hol, setHol] = useState(group.holidays ?? '');
  useEffect(() => { if (cal?.end && !to) setTo(cal.end); }, [cal?.end, to]);
  const has = new Set(existing.map((s) => `${s.date}|${s.slot}`));
  const off = parseHolidays((cal?.holidays ?? '') + '\n' + hol);
  const list = schoolDays(from, to, tt, off).filter((x) => !has.has(`${x.date}|${x.slot}`));

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
      <TimetableGrid value={tt} onChange={setTt} />
      <div className="row">
        <label>Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className={cal ? 'mute' : 'warn'}>
        {cal ? `Sin clase los días no lectivos del calendario escolar ${cal.id} (${holidayItems(cal.holidays).length} días o periodos).` : 'No hay calendario escolar: añade los festivos en la pestaña «Calendario escolar».'}
      </p>
      <label>Otros días sin clase con este grupo (excursiones, salidas…)
        <textarea rows={2} placeholder={'2027-02-11 Salida al museo'} value={hol} onChange={(e) => setHol(e.target.value)} />
      </label>
      <p className="mute">{list.length} sesiones nuevas{has.size ? ' (las que ya existen no se duplican)' : ''}.</p>
      <div className="row">
        <button className="on" disabled={!list.length} onClick={run}>Crear {list.length} sesiones</button>
        <button onClick={() => onDone('')}>Cerrar</button>
      </div>
    </div>
  );
}

/** Qué se ha hecho en la sesión y qué queda para la siguiente (se ve en la sesión siguiente). */
function DonePending({ s }: { s: Session }) {
  const save = (p: Partial<Session>) => db.sessions.update(s.id, { ...p, updatedAt: Date.now() });
  return (
    <>
      <textarea rows={2} placeholder="Realizado" defaultValue={s.done ?? ''} key={'d' + s.updatedAt} onBlur={(e) => e.target.value !== (s.done ?? '') && save({ done: e.target.value || undefined })} />
      <textarea rows={2} placeholder="Pendiente para la siguiente sesión" defaultValue={s.pending ?? ''} key={'p' + s.updatedAt} onBlur={(e) => e.target.value !== (s.pending ?? '') && save({ pending: e.target.value || undefined })} />
    </>
  );
}

function SessionCard({ s, units, acts, prev }: { s: Session; units: LearningUnit[]; acts: Activity[]; prev: string }) {
  const save = (p: Partial<Session>) => db.sessions.update(s.id, { ...p, updatedAt: Date.now() });
  const [open, setOpen] = useState(false);
  const u = units.find((x) => x.id === s.unitId);
  const past = s.date <= ymd(new Date());
  return (
    <div className={'session' + (s.done ? ' done' : '')}>
      <div className="sp">
        <b>{s.slot}.ª h{s.done ? ' ✓' : ''}</b>
        <select value={s.unitId ?? ''} onChange={(e) => save({ unitId: e.target.value || undefined })} title={u?.title}>
          <option value="">Sin unidad</option>
          {units.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
        </select>
        <button className="small" title="Borrar sesión" onClick={() => confirm(`¿Borrar la sesión del ${dm(s.date)} (${s.slot}.ª h)?`) && softDelete(db.sessions, s)}>×</button>
      </div>
      {prev && <div className="pend" title="Pendiente de la sesión anterior">⤷ {prev}</div>}
      <input placeholder="Tema / qué se hace" defaultValue={s.topic} key={'t' + s.updatedAt} onBlur={(e) => e.target.value !== s.topic && save({ topic: e.target.value })} />
      {acts.length > 0 && <div className="chips">{acts.map((a) => <span className="chip" key={a.id} title="Actividad con esta fecha">{a.title}</span>)}</div>}
      {(open || s.done || s.pending) ? <DonePending s={s} /> : past && <button className="small" onClick={() => setOpen(true)}>Realizado / pendiente</button>}
    </div>
  );
}

/** En Asistencia: la sesión planificada a esa hora, lo pendiente de la anterior y lo realizado. */
export function SessionNotes({ groupId, date, slot }: { groupId: string; date: string; slot: string }) {
  const all = useLiveQuery(() => db.sessions.where('groupId').equals(groupId).toArray(), [groupId]);
  const units = useLiveQuery(() => db.units.toArray());
  const s = all?.find((x) => !x.deleted && x.date === date && x.slot === slot);
  if (!s) return null;
  const u = units?.find((x) => x.id === s.unitId);
  const prev = previousPending(all ?? [], s);
  return (
    <details className="card" open={!!prev || !!s.topic}>
      <summary>Sesión planificada: {[u?.code, s.topic].filter(Boolean).join(' · ') || 'sin tema'}</summary>
      <div className="form">
        {prev && <div className="pend">⤷ Pendiente de la sesión anterior: {prev}</div>}
        <DonePending s={s} />
      </div>
    </details>
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
              {list.map((s) => <SessionCard key={s.id} s={s} units={units} acts={dayActs} prev={previousPending(sessions, s)} />)}
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
