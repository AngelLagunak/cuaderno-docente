import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../data/db';
import { addDays, parseHolidays, plannedSessions, schoolYearOf, subjectCalendar, ymd } from '../core/planning';
import { classesOfDay, pendingBefore, toGrade } from '../core/today';
import type { DayClass } from '../core/today';
import { absenceSummary } from '../core/rules';
import { DonePending } from './Calendar';
import { useSchoolCalendar } from './hooks';
import { Icon } from './icons';
import { callScript } from '../data/api';
import { configured } from '../data/sync';

type ClsPending = { groupId: string; courseWorkId: string; title: string; turnedIn: number };
type ClsMissing = { groupId: string; courseWorkId: string; title: string; dueDate: string; userIds: string[] };
type ClsPost = { groupId: string; id: string; userId: string; text: string; time: string; link: string };
type ClsComment = { id: string; subject: string; from: string; time: string; snippet: string; unread: boolean; link: string };
interface ClsInfo { at: number; pending: ClsPending[]; missing: ClsMissing[]; posts: ClsPost[]; comments: ClsComment[]; errors: string[] }
const EMPTY: ClsInfo = { at: 0, pending: [], missing: [], posts: [], comments: [], errors: [] };

/**
 * Lo que llega de Classroom en los grupos vinculados: entregas sin calificar, tareas sin entregar, publicaciones del
 * alumnado en el tablón y comentarios (avisos por correo). Necesita conexión y el Apps Script actualizado.
 * Se guarda 15 minutos para no consultar en cada visita.
 */
function useClassroom(): [ClsInfo, boolean, () => void] {
  // La consulta guardada solo vale para la misma conexión (al cambiar la URL del Apps Script se descarta).
  const read = (): ClsInfo => { try { const c = JSON.parse(sessionStorage.getItem('clsInfo') || 'null'); return c && Date.now() - c.at < 15 * 60_000 && c.url === localStorage.getItem('scriptUrl') ? c : EMPTY; } catch { return EMPTY; } };
  const [info, setInfo] = useState<ClsInfo>(read);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let done = false;
    (async () => {
      if (tick === 0 && read().at) return;
      if (!configured() || !navigator.onLine) return;
      // Un curso de Classroom se consulta una sola vez, aunque esté enlazado a varios grupos; solo grupos de
      // asignaturas que existen, y antes los que tienen alumnado.
      const subjects = new Set((await db.subjects.toArray()).filter((s) => !s.deleted).map((s) => s.id));
      const withStudents = new Set((await db.students.toArray()).filter((s) => !s.deleted).map((s) => s.groupId));
      const linked = (await db.groups.toArray()).filter((g) => !g.deleted && g.classroomCourseId && subjects.has(g.subjectId))
        .sort((a, b) => Number(withStudents.has(b.id)) - Number(withStudents.has(a.id)));
      const groups = linked.filter((g, i) => linked.findIndex((x) => x.classroomCourseId === g.classroomCourseId) === i);
      if (!groups.length) return;
      setBusy(true);
      const out: ClsInfo = { ...EMPTY, at: Date.now(), errors: [] };
      for (const g of groups) {
        const courseId = g.classroomCourseId;
        try {
          const r = await callScript<{ courseWorkId: string; title: string; turnedIn: number }[]>('classroom.pending', { courseId });
          out.pending.push(...r.map((x) => ({ ...x, groupId: g.id })));
        } catch { /* sin conexión: no se muestra */ }
        try {
          const r = await callScript<{ missing: Omit<ClsMissing, 'groupId'>[]; posts: Omit<ClsPost, 'groupId'>[] }>('classroom.alerts', { courseId, days: 14 });
          out.missing.push(...r.missing.map((x) => ({ ...x, groupId: g.id })));
          out.posts.push(...r.posts.map((x) => ({ ...x, groupId: g.id })));
        } catch (e) { out.errors.push(`${g.name}: ${String((e as Error).message ?? e)}`); }
      }
      try { out.comments = await callScript<ClsComment[]>('classroom.comments', { days: 14 }); }
      catch (e) { out.errors.push(`Comentarios: ${String((e as Error).message ?? e)}`); }
      if (done) return;
      setInfo(out); setBusy(false);
      try { sessionStorage.setItem('clsInfo', JSON.stringify({ ...out, url: localStorage.getItem('scriptUrl') })); } catch { /* sin almacenamiento */ }
    })().catch(() => setBusy(false));
    return () => { done = true; };
  }, [tick]);
  return [info, busy, () => setTick((t) => t + 1)];
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DAYS[dt.getDay()]} ${d} de ${MONTHS[m - 1]}`; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface TodayNav {
  attendance: (subjectId: string, groupId: string, date: string, slot: string) => void;
  grade: (subjectId: string, groupId: string, activityId: string) => void;
  notebook: (subjectId: string, groupId: string) => void;
  go: (view: 'groups' | 'conn' | 'cal' | 'plan' | 'new') => void;
  groups: (subjectId: string, groupId: string) => void;
}

/**
 * Inicio: las clases del día de todos los grupos (sesiones planificadas u horario), lo pendiente de la sesión
 * anterior, pasar lista, lo que falta por corregir y los avisos. Se puede ir a otros días.
 */
export function Today({ nav }: { nav: TodayNav }) {
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [pick, setPick] = useState<string | null>(null);
  // Hora actual (HH:MM), al minuto, para saber qué clase toca.
  const hhmm = () => new Date().toTimeString().slice(0, 5);
  const [clock, setClock] = useState(hhmm);
  useEffect(() => { const t = setInterval(() => setClock(hhmm()), 30_000); return () => clearInterval(t); }, []);
  const [cls, clsBusy, clsRefresh] = useClassroom();
  // Filtro de grupo para lo que hay por corregir y los avisos de Classroom (se recuerda en el dispositivo).
  const [fgSaved, setFg] = useState(() => { try { return localStorage.getItem('todayGroup') ?? ''; } catch { return ''; } });
  const [allPend, setAllPend] = useState(false);
  const pickGroup = (id: string) => { setFg(id); setAllPend(false); try { localStorage.setItem('todayGroup', id); } catch { /* sin almacenamiento */ } };
  const pendingCls = cls.pending;
  const [hideSetup, setHideSetup] = useState(() => { try { return localStorage.getItem('setupHidden') === '1'; } catch { return false; } });
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

  if (!subjects.length) return (
    <div className="card empty">
      <b>Bienvenida al cuaderno</b>
      <p className="mute">Empieza creando tu primera asignatura: parte de la plantilla LOMLOE, la de FP o una vacía, y carga su currículo con la ayuda de una IA. Después crea sus grupos.</p>
      <div className="row center">
        <button className="on" onClick={() => nav.go('new')}>Crear una asignatura</button>
        <button onClick={() => nav.go('conn')}>Conectar con Drive</button>
      </div>
      <p className="mute">¿Ya usas la app en otro dispositivo? Conecta con Drive y tus datos llegarán solos.</p>
    </div>
  );
  if (!live.length) return (
    <div className="card empty">
      <b>Aún no hay grupos</b>
      <p className="mute">Crea tu primer grupo y añade al alumnado. Después marca su horario en Calendario escolar para ver aquí las clases de cada día.</p>
      <button className="on" onClick={() => nav.go('groups')}>Crear un grupo</button>
    </div>
  );

  // Puesta en marcha: lo que hace falta para que todo funcione solo.
  const noStudents = live.find((g) => !data.students.some((x) => !x.deleted && x.groupId === g.id));
  const setup: [string, boolean, () => void][] = [
    ['Conectar con Drive y Classroom (Conexión y copias)', configured(), () => nav.go('conn')],
    ['Guardar el calendario escolar del curso', !!cal, () => nav.go('cal')],
    ['Poner las horas del centro (Calendario escolar)', !!cal?.slots?.some((x) => x.start && x.end), () => nav.go('cal')],
    ['Marcar el horario de cada grupo (Calendario escolar)', live.every((g) => g.timetable?.length), () => nav.go('cal')],
    [noStudents ? `Añadir el alumnado de ${noStudents.name}` : 'Añadir el alumnado de cada grupo', !noStudents, () => (noStudents ? nav.groups(noStudents.subjectId, noStudents.id) : nav.go('groups'))],
    ['Crear las unidades didácticas (Planificar)', data.units.some((u) => !u.deleted), () => nav.go('plan')],
    ['Descargar una copia de seguridad', (() => { try { return !!localStorage.getItem('lastBackup'); } catch { return false; } })(), () => nav.go('conn')],
  ];
  const setupLeft = setup.filter((x) => !x[1]);

  const classes = classesOfDay(date, today, live, sessions, attendance, parseHolidays(cal?.holidays ?? ''), cal?.slots, clock);
  const key = (c: DayClass) => `${c.group.id}|${c.slot}`;
  const sel = classes.find((c) => key(c) === pick) ?? classes.find((c) => c.state === 'now' || c.state === 'next') ?? classes[0];
  const moveDay = (n: number) => { setDate(addDays(date, n)); setPick(null); };

  // Por corregir
  const fg = live.some((g) => g.id === fgSaved) ? fgSaved : '';
  const inG = (gid: string) => !fg || gid === fg;
  const pendingAll = toGrade(data.activities.filter((a) => subjectOf(a.subjectId)), data.students, data.grades, today);
  const countOf = (gid: string) => pendingAll.filter((p) => p.activity.groupId === gid).length + cls.pending.filter((x) => x.groupId === gid).length + cls.missing.filter((x) => x.groupId === gid).length;
  const pendingF = pendingAll.filter((p) => inG(p.activity.groupId));
  const pending = allPend ? pendingF : pendingF.slice(0, 5);
  const pendingClsF = pendingCls.filter((x) => inG(x.groupId));

  // Avisos
  const warns: { text: string; go?: () => void }[] = [];
  for (const g of live) {
    const s = subjectOf(g.subjectId)!;
    const rows = attendance.filter((r) => r.groupId === g.id);
    if (!rows.length) continue;
    const planned = plannedSessions(subjectCalendar(cal, s), g.timetable ?? [], g.holidays)?.total;
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
  // Grupos repetidos (mismo nombre en la misma asignatura) o varios grupos enlazados al mismo curso de Classroom.
  for (const g of live) {
    const dupName = live.filter((x) => x.subjectId === g.subjectId && x.name.trim().toLowerCase() === g.name.trim().toLowerCase());
    if (dupName[0] === g && dupName.length > 1) warns.unshift({ text: `Hay ${dupName.length} grupos «${g.name}» en ${subjectOf(g.subjectId)!.name}: borra los que sobren en Grupos y alumnos`, go: () => nav.groups(g.subjectId, g.id) });
    const dupCourse = live.filter((x) => g.classroomCourseId && x.classroomCourseId === g.classroomCourseId);
    if (dupCourse[0] === g && dupCourse.length > 1 && new Set(dupCourse.map((x) => x.name)).size > 1) warns.unshift({ text: `${dupCourse.map((x) => x.name).join(', ')} están enlazados al mismo curso de Classroom`, go: () => nav.groups(g.subjectId, g.id) });
  }

  return (
    <div className="today">
      {!hideSetup && setupLeft.length > 0 && (
        <details className="card sect setup" open={setupLeft.length > 2}>
          <summary>Puesta en marcha · {setup.length - setupLeft.length} de {setup.length}</summary>
          <div className="list">
            {setup.map(([t, ok, f]) => (
              <button key={t} className="li" disabled={ok} onClick={f}>
                <span className={ok ? 'done' : ''}>{ok ? '✓ ' : ''}{t}</span>{!ok && <Icon name="chev" size={18} />}
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: '0 14px 10px' }}><button className="small" onClick={() => { try { localStorage.setItem('setupHidden', '1'); } catch { /* sin almacenamiento */ } setHideSetup(true); }}>Ocultar</button></div>
        </details>
      )}
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
      {live.length > 1 && (
        <div className="pills" role="group" aria-label="Filtrar por grupo">
          <button className={!fg ? 'on' : ''} aria-pressed={!fg} onClick={() => pickGroup('')}>Todos</button>
          {live.map((g) => {
            const n = countOf(g.id);
            return <button key={g.id} className={fg === g.id ? 'on' : ''} aria-pressed={fg === g.id} onClick={() => pickGroup(g.id)}>{g.name}{n ? ` · ${n}` : ''}</button>;
          })}
        </div>
      )}
      {pendingClsF.length > 0 && (
        <div className="card list">
          {pendingClsF.map((x) => {
            const g = live.find((y) => y.id === x.groupId);
            const a = data.activities.find((y) => !y.deleted && y.classroomWorkId === x.courseWorkId);
            return (
              <button key={x.groupId + x.courseWorkId} className="li" onClick={() => g && (a ? nav.grade(g.subjectId, g.id, a.id) : nav.notebook(g.subjectId, g.id))}>
                <span><b>{a?.title ?? x.title}</b><span className="mute">{g?.name} · Classroom: {x.turnedIn} entregad{x.turnedIn === 1 ? 'a' : 'as'} sin calificar{a ? '' : ' (sin vincular)'}</span></span>
                <Icon name="chev" size={18} />
              </button>
            );
          })}
        </div>
      )}
      {pending.length ? (
        <div className="card list">
          {pending.map((p) => (
            <button key={p.activity.id} className="li" onClick={() => nav.grade(p.activity.subjectId, p.activity.groupId, p.activity.id)}>
              <span><b>{p.activity.title}</b><span className="mute">{groups.find((g) => g.id === p.activity.groupId)?.name} · {p.missing} de {p.total} sin nota</span></span>
              <Icon name="chev" size={18} />
            </button>
          ))}
          {pendingF.length > 5 && <button className="li more" onClick={() => setAllPend(!allPend)}><span className="mute">{allPend ? 'Ver menos' : `Ver las ${pendingF.length}`}</span></button>}
        </div>
      ) : <p className="mute">Nada pendiente{fg ? ' en este grupo' : ''}: las actividades con fecha pasada tienen todas sus notas.</p>}

      <ClassroomAlerts info={{ ...cls, missing: cls.missing.filter((x) => inG(x.groupId)), posts: cls.posts.filter((x) => inG(x.groupId)) }} busy={clsBusy} refresh={clsRefresh} groups={live} students={data.students} activities={data.activities}
        open={(g, a) => (a ? nav.grade(g.subjectId, g.id, a) : nav.notebook(g.subjectId, g.id))} />

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
  const badge = c.state === 'past' ? (rows.length ? 'Hecha' : 'Pasada') : c.state === 'now' ? 'Ahora' : c.state === 'next' ? 'Siguiente' : 'Más tarde';
  const main = c.state === 'now' || c.state === 'next';
  async function createSession() {
    await db.sessions.put({ id: uid(), groupId: c.group.id, date: p.date, slot: c.slot, topic: '', updatedAt: Date.now() });
    setNotes(true);
  }
  return (
    <section className="card class">
      <div className="sp"><span className={'badge ' + (main ? 'next' : c.state)}>{badge} · {c.slot}.ª hora</span>{c.time && <span className="mute">{c.time.start} – {c.time.end}</span>}</div>
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
        <button className={'wide' + (main ? ' on big' : '')} onClick={p.onList}>
          {main && <Icon name="users" />} {rows.length ? 'Ver o corregir la lista' : 'Pasar lista'}
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

/** Avisos de Classroom: tareas sin entregar, publicaciones del alumnado y comentarios. */
function ClassroomAlerts(p: {
  info: ClsInfo; busy: boolean; refresh: () => void; groups: import('../core/model').Group[]; students: import('../core/model').Student[];
  activities: import('../core/model').Activity[]; open: (g: import('../core/model').Group, activityId?: string) => void;
}) {
  const { info } = p;
  if (!p.groups.some((g) => g.classroomCourseId)) return null;
  const who = (g: import('../core/model').Group, uid: string) => {
    const s = p.students.find((x) => !x.deleted && x.groupId === g.id && x.classroomUserId === uid);
    return s ? `${s.firstName} ${s.lastName}` : 'alumno sin enlazar';
  };
  const missing = [...info.missing].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const nothing = !missing.length && !info.posts.length && !info.comments.length;
  return (
    <>
      <div className="sp secrow"><h2 className="sec">Classroom</h2><button className="small" disabled={p.busy} onClick={p.refresh}>{p.busy ? 'Consultando…' : 'Actualizar'}</button></div>
      {nothing && <p className="mute">{info.at ? 'Sin tareas sin entregar ni comentarios nuevos (últimos 14 días).' : configured() ? 'Pulsa Actualizar para consultar Classroom.' : 'Conecta el Apps Script en Conexión y copias para ver entregas y comentarios.'}</p>}
      {missing.length > 0 && (
        <details className="card sect" open={missing.length <= 3}>
          <summary>Sin entregar · {missing.reduce((n, m) => n + m.userIds.length, 0)} entregas en {missing.length} tarea{missing.length === 1 ? '' : 's'}</summary>
          <div className="list">
            {missing.map((m) => {
              const g = p.groups.find((x) => x.id === m.groupId)!;
              const a = p.activities.find((x) => !x.deleted && x.classroomWorkId === m.courseWorkId);
              return (
                <button key={m.groupId + m.courseWorkId} className="li" onClick={() => p.open(g, a?.id)}>
                  <span><b>{a?.title ?? m.title}</b><span className="mute">{g.name}{m.dueDate ? ` · fecha ${m.dueDate.split('-').reverse().join('/')}` : ''} · {m.userIds.length} sin entregar: {m.userIds.map((u) => who(g, u)).join(', ')}</span></span>
                  <Icon name="chev" size={18} />
                </button>
              );
            })}
          </div>
        </details>
      )}
      {info.comments.length > 0 && (
        <details className="card sect" open>
          <summary>Comentarios · {info.comments.filter((c) => c.unread).length} sin leer</summary>
          <div className="list">
            {info.comments.map((c) => (
              <a key={c.id} className="li" href={c.link} target="_blank" rel="noreferrer">
                <span><b className={c.unread ? '' : 'mute'}>{c.subject}</b><span className="mute">{shortDate(c.time)} · {c.snippet.slice(0, 140)}</span></span>
                <Icon name="chev" size={18} />
              </a>
            ))}
          </div>
        </details>
      )}
      {info.posts.length > 0 && (
        <details className="card sect" open>
          <summary>Publicaciones del alumnado en el tablón · {info.posts.length}</summary>
          <div className="list">
            {info.posts.map((x) => {
              const g = p.groups.find((y) => y.id === x.groupId)!;
              return (
                <a key={x.id} className="li" href={x.link} target="_blank" rel="noreferrer">
                  <span><b>{who(g, x.userId)} · {g.name}</b><span className="mute">{shortDate(x.time)} · {x.text.slice(0, 140)}</span></span>
                  <Icon name="chev" size={18} />
                </a>
              );
            })}
          </div>
        </details>
      )}
      {info.errors.length > 0 && <p className="mute" style={{ fontSize: ".84rem" }}>No se pudo consultar: {info.errors.join(' · ')}. Revisa que el Apps Script esté actualizado y autorizado.</p>}
    </>
  );
}
