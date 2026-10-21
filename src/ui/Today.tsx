import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../data/db';
import { addDays, parseHolidays, plannedSessions, schoolYearOf, ymd } from '../core/planning';
import { classesOfDay, pendingBefore, toGrade } from '../core/today';
import type { DayClass } from '../core/today';
import { absenceSummary } from '../core/rules';
import { DonePending } from './Calendar';
import { useSchoolCalendar } from './hooks';
import { Icon } from './icons';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DAYS[dt.getDay()]} ${d} de ${MONTHS[m - 1]}`; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface TodayNav {
  attendance: (subjectId: string, groupId: string, date: string, slot: string) => void;
  grade: (subjectId: string, groupId: string, activityId: string) => void;
  go: (view: 'groups' | 'conn' | 'cal' | 'plan') => void;
}

/**
 * Inicio: las clases del día de todos los grupos (sesiones planificadas u horario), lo pendiente de la sesión
 * anterior, pasar lista, lo que falta por corregir y los avisos. Se puede ir a otros días.
 */
export function Today({ nav }: { nav: TodayNav }) {
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [pick, setPick] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const [subjects, groups, sessions, attendance, units, activities, students] = await Promise.all([
      db.subjects.toArray(), db.groups.toArray(), db.sessions.toArray(), db.attendance.toArray(), db.units.toArray(), db.activities.toArray(), db.students.toArray(),
    ]);
    const past = activities.filter((a) => !a.deleted && a.date && a.date <= today);
    const grades = past.length ? await db.grades.where('activityId').anyOf(past.map((a) => a.id)).toArray() : [];
    return { subjects: subjects.filter((s) => !s.deleted), groups: groups.filter((g) => !g.deleted), sessions, attendance, units, activities, students, grades };
  }, [today]);
  const cal = useSchoolCalendar(schoolYearOf(date));
  if (!data) return null;
  const { subjects, groups, sessions, attendance, units } = data;
  const subjectOf = (id: string) => subjects.find((s) => s.id === id);
  const live = groups.filter((g) => subjectOf(g.subjectId));

  if (!live.length) return (
    <div className="card empty">
      <b>Aún no hay grupos</b>
      <p className="mute">Crea tu primer grupo y añade al alumnado. Después marca su horario en Calendario escolar para ver aquí las clases de cada día.</p>
      <button className="on" onClick={() => nav.go('groups')}>Crear un grupo</button>
    </div>
  );

  const classes = classesOfDay(date, today, live, sessions, attendance, parseHolidays(cal?.holidays ?? ''));
  const key = (c: DayClass) => `${c.group.id}|${c.slot}`;
  const sel = classes.find((c) => key(c) === pick) ?? classes.find((c) => c.state === 'next') ?? classes[0];
  const moveDay = (n: number) => { setDate(addDays(date, n)); setPick(null); };

  // Por corregir
  const pending = toGrade(data.activities.filter((a) => subjectOf(a.subjectId)), data.students, data.grades, today).slice(0, 4);

  // Avisos
  const warns: { text: string; go?: () => void }[] = [];
  for (const g of live) {
    const s = subjectOf(g.subjectId)!;
    const rows = attendance.filter((r) => r.groupId === g.id);
    if (!rows.length) continue;
    const planned = plannedSessions(cal, g.timetable ?? [], g.holidays)?.total;
    for (const st of data.students.filter((x) => !x.deleted && x.groupId === g.id)) {
      const a = absenceSummary(s, rows, st.id, planned);
      if (a.warn && !st.lec) warns.push({ text: `${st.firstName} ${st.lastName} (${g.name}) · ${a.pct.toFixed(0)} % de faltas injustificadas` });
    }
  }
  let last = 0;
  try { last = Number(localStorage.getItem('lastBackup') || 0); } catch { /* sin almacenamiento */ }
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (days == null || days > 14) warns.push({ text: days == null ? 'Aún no has descargado ninguna copia de seguridad' : `Copia de seguridad descargada hace ${days} días`, go: () => nav.go('conn') });
  if (!cal) warns.push({ text: 'Falta el calendario escolar del curso (festivos y evaluaciones)', go: () => nav.go('cal') });

  return (
    <div className="today">
      <div className="daynav">
        <button aria-label="Día anterior" onClick={() => moveDay(-1)}><Icon name="left" /></button>
        <b>{date === today ? `Hoy, ${longDate(date)}` : cap(longDate(date))}</b>
        <button aria-label="Día siguiente" onClick={() => moveDay(1)}><Icon name="right" /></button>
      </div>
      {date !== today && <div className="row center"><button className="small" onClick={() => { setDate(today); setPick(null); }}>Volver a hoy</button></div>}

      <div className="todayGrid"><div>
      {classes.length > 0 ? (
        <>
          <div className="pills" role="group" aria-label="Clases del día">
            {classes.map((c) => (
              <button key={key(c)} className={key(c) === key(sel!) ? 'on' : ''} aria-pressed={key(c) === key(sel!)} onClick={() => setPick(key(c))}>
                {c.slot}.ª · {c.group.name}{c.state === 'past' ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {sel && <ClassCard c={sel} date={date} today={today} subject={subjectOf(sel.group.subjectId)!.name} sessions={sessions} attendance={attendance} units={units}
            onList={() => nav.attendance(sel.group.subjectId, sel.group.id, date, sel.slot)} />}
        </>
      ) : (
        <div className="card empty">
          <b>Sin clases este día</b>
          <p className="mute">{parseHolidays(cal?.holidays ?? '').has(date) ? 'Es un día no lectivo.' : 'No hay sesiones planificadas ni horas en el horario de tus grupos.'}</p>
          {!live.some((g) => g.timetable?.length) && <button className="small" onClick={() => nav.go('cal')}>Marcar el horario de los grupos</button>}
        </div>
      )}

      </div><div>
      <h2 className="sec">Por corregir</h2>
      {pending.length ? (
        <div className="card list">
          {pending.map((p) => (
            <button key={p.activity.id} className="li" onClick={() => nav.grade(p.activity.subjectId, p.activity.groupId, p.activity.id)}>
              <span><b>{p.activity.title}</b><span className="mute">{groups.find((g) => g.id === p.activity.groupId)?.name} · {p.missing} de {p.total} sin nota</span></span>
              <Icon name="chev" size={18} />
            </button>
          ))}
        </div>
      ) : <p className="mute">Nada pendiente: las actividades con fecha pasada tienen todas sus notas.</p>}

      {warns.length > 0 && (
        <>
          <h2 className="sec">Avisos</h2>
          <div className="card list">
            {warns.slice(0, 6).map((w, i) => (
              w.go
                ? <button key={i} className="li" onClick={w.go}><span className="dotted">{w.text}</span><Icon name="chev" size={18} /></button>
                : <div key={i} className="li"><span className="dotted">{w.text}</span></div>
            ))}
          </div>
        </>
      )}
      </div></div>
    </div>
  );
}

function ClassCard(p: { c: DayClass; date: string; today: string; subject: string; sessions: import('../core/model').Session[]; attendance: import('../core/model').Attendance[]; units: import('../core/model').LearningUnit[]; onList: () => void }) {
  const { c } = p;
  const [notes, setNotes] = useState(false);
  const s = c.session;
  const u = s?.unitId ? p.units.find((x) => x.id === s.unitId) : undefined;
  const prev = pendingBefore(p.sessions, c.group.id, p.date, c.slot);
  const rows = p.attendance.filter((r) => !r.deleted && r.groupId === c.group.id && r.date === p.date && r.slot === c.slot);
  const n = (k: string) => rows.filter((r) => r.status === k).length;
  const badge = c.state === 'past' ? (rows.length ? 'Hecha' : 'Pasada') : c.state === 'next' ? 'Siguiente' : 'Más tarde';
  async function createSession() {
    await db.sessions.put({ id: uid(), groupId: c.group.id, date: p.date, slot: c.slot, topic: '', updatedAt: Date.now() });
    setNotes(true);
  }
  return (
    <section className="card class">
      <div className="sp"><span className={'badge ' + c.state}>{badge} · {c.slot}.ª hora</span></div>
      <div>
        <div className="big">{c.group.name} · {p.subject}</div>
        <div className="ink2">{[u && `${u.code} ${u.title}`, s?.topic].filter(Boolean).join(' · ') || 'Sin unidad ni tema'}</div>
      </div>
      {prev && <div className="pend"><Icon name="back" size={16} /> <span><b>Pendiente de la sesión anterior:</b> {prev}</span></div>}
      {rows.length > 0 && <div className="ink2">Asistencia: {n('P') + n('R')} presentes{n('A') ? ` · ${n('A')} ausentes` : ''}{n('R') ? ` · ${n('R')} retrasos` : ''}{n('J') ? ` · ${n('J')} justificadas` : ''}</div>}
      {s && (s.done || s.pending) && !notes && (
        <div className="ink2">{s.done && <div><b>Realizado:</b> {s.done}</div>}{s.pending && <div><b>Queda pendiente:</b> {s.pending}</div>}</div>
      )}
      {p.date <= p.today && (
        <button className={'wide' + (c.state === 'next' ? ' on big' : '')} onClick={p.onList}>
          {c.state === 'next' && <Icon name="users" />} {rows.length ? 'Ver o corregir la lista' : 'Pasar lista'}
        </button>
      )}
      {notes && s ? <div className="form"><DonePending s={s} /></div> : (
        <button className="wide" onClick={() => (s ? setNotes(true) : createSession())}>
          {p.date > p.today ? 'Preparar la sesión' : 'Anotar realizado y pendiente'}
        </button>
      )}
    </section>
  );
}
