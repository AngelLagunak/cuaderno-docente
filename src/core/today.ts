import { bySessionOrder, weekday } from './planning';
import type { Activity, Attendance, Grade, Group, Session, SlotTime, Student } from './model';

export interface DayClass { group: Group; slot: string; session?: Session; state: 'past' | 'now' | 'next' | 'later'; time?: SlotTime }

/**
 * Clases de un día en todos los grupos: las sesiones planificadas y, si no las hay, las horas del horario semanal
 * (salvo días no lectivos). Estado: pasada, ahora, siguiente o más tarde. Con las horas del centro (`times`) y la hora
 * actual (`now`, HH:MM) se usa el reloj; si no, pasada = con lista pasada y siguiente = la primera de hoy sin lista.
 */
export function classesOfDay(date: string, today: string, groups: Group[], sessions: Session[], attendance: Attendance[], holidays: Set<string>, times: SlotTime[] = [], now = ''): DayClass[] {
  const live = groups.filter((g) => !g.deleted);
  const out: Omit<DayClass, 'state'>[] = [];
  for (const g of live) {
    const own = sessions.filter((s) => !s.deleted && s.groupId === g.id && s.date === date);
    for (const s of own) out.push({ group: g, slot: s.slot, session: s });
    if (holidays.has(date)) continue;
    for (const t of g.timetable ?? []) if (t.weekday === weekday(date) && !own.some((s) => s.slot === t.slot)) out.push({ group: g, slot: t.slot });
  }
  out.sort((a, b) => a.slot.localeCompare(b.slot, 'es', { numeric: true }) || a.group.name.localeCompare(b.group.name, 'es'));
  const held = (c: Omit<DayClass, 'state'>) => attendance.some((r) => !r.deleted && r.groupId === c.group.id && r.date === date && r.slot === c.slot);
  const timeOf = (slot: string) => times.find((t) => t.slot === slot && t.start && t.end);
  const states = out.map((c): DayClass['state'] => {
    const t = timeOf(c.slot);
    if (date < today) return 'past';
    if (date > today) return 'later';
    if (t && now) return now >= t.end ? 'past' : now >= t.start ? 'now' : 'later';
    return held(c) ? 'past' : 'later';
  });
  // Si no hay ninguna en curso, la primera que queda hoy es la siguiente.
  if (date === today && !states.includes('now')) { const i = states.indexOf('later'); if (i >= 0) states[i] = 'next'; }
  return out.map((c, i) => ({ ...c, state: states[i], time: timeOf(c.slot) }));
}

/** Lo pendiente de la sesión anterior del grupo a una fecha y hora (aunque esa hora aún no tenga sesión creada). */
export function pendingBefore(sessions: Session[], groupId: string, date: string, slot: string): string {
  const prev = sessions
    .filter((s) => !s.deleted && s.groupId === groupId && (s.date < date || (s.date === date && s.slot.localeCompare(slot, 'es', { numeric: true }) < 0)))
    .sort(bySessionOrder);
  return prev[prev.length - 1]?.pending ?? '';
}

export interface ToGrade { activity: Activity; missing: number; total: number }

/** Actividades con fecha ya pasada a las que les falta la nota de algún alumno, de la más reciente a la más antigua. */
export function toGrade(activities: Activity[], students: Student[], grades: Grade[], today: string): ToGrade[] {
  const graded = new Set(grades.filter((g) => !g.deleted && g.value != null).map((g) => `${g.studentId}|${g.activityId}`));
  return activities
    .filter((a) => !a.deleted && a.date && a.date <= today)
    .map((a) => {
      const st = students.filter((s) => !s.deleted && s.groupId === a.groupId);
      return { activity: a, total: st.length, missing: st.filter((s) => !graded.has(`${s.id}|${a.id}`)).length };
    })
    .filter((x) => x.missing > 0)
    .sort((a, b) => b.activity.date!.localeCompare(a.activity.date!));
}
