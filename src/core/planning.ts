import type { LearningUnit, Session } from './model';

/** Fecha AAAA-MM-DD de un Date en hora local. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
/** Día de la semana: 1 = lunes … 7 = domingo. */
export const weekday = (s: string) => ((parse(s).getDay() + 6) % 7) + 1;
/** Lunes de la semana de una fecha. */
export const monday = (s: string) => addDays(s, 1 - weekday(s));

const DATE = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
const pad = (n: string) => n.padStart(2, '0');
/** Fechas AAAA-MM-DD (o DD/MM/AAAA) que aparecen en un texto, en orden. */
const datesIn = (t: string) => [...t.matchAll(DATE)].map((m) => (m[1] ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : `${m[6]}-${pad(m[5])}-${pad(m[4])}`));

export interface HolidayItem { from: string; to: string; label: string }

/**
 * Días no lectivos: una fecha o un intervalo («inicio..fin», «inicio – fin») por línea o separados por comas,
 * con su nombre detrás si se quiere. Lo que no lleva fecha se ignora.
 */
export function holidayItems(text: string): HolidayItem[] {
  const out: HolidayItem[] = [];
  for (const part of text.split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))) {
    const ds = datesIn(part);
    if (!ds.length) continue;
    const label = part.replace(DATE, ' ').replace(/^(?:\s|\.\.|[–—:>-]|\ba\b)+/, '').trim();
    out.push({ from: ds[0], to: ds[1] && ds[1] > ds[0] ? ds[1] : ds[0], label });
  }
  return out;
}

export function parseHolidays(text: string): Set<string> {
  const out = new Set<string>();
  for (const h of holidayItems(text)) {
    let d = h.from;
    for (let i = 0; d <= h.to && i < 400; i++, d = addDays(d, 1)) out.add(d);
  }
  return out;
}

/** Curso escolar de una fecha: de septiembre a agosto, «2026/27». */
export function schoolYearOf(date: string) {
  const [y, m] = date.split('-').map(Number);
  const a = m >= 8 ? y : y - 1;
  return `${a}/${String((a + 1) % 100).padStart(2, '0')}`;
}

/**
 * Lee la respuesta de la IA (o un texto escrito a mano): líneas «INICIO: fecha», «FIN: fecha»,
 * «EVALUACION: nombre | inicio | fin» y el resto, días no lectivos.
 */
export function parseCalendarText(text: string): { start?: string; end?: string; terms: { name: string; start: string; end: string }[]; holidays: string } {
  let start: string | undefined, end: string | undefined;
  const terms: { name: string; start: string; end: string }[] = [];
  const rest: string[] = [];
  for (const raw of text.replace(/```\w*/g, '').split(/\r?\n/)) {
    const l = raw.replace(/^[\s*>\-•]+/, '').replace(/\*\*/g, '').trim();
    if (!l) continue;
    const key = /^(inicio|fin|evaluaci[oó]n)\s*:\s*(.*)$/i.exec(l);
    if (!key) { if (datesIn(l).length) rest.push(l); continue; }
    const [k, v] = [key[1].toLowerCase(), key[2]];
    const ds = datesIn(v);
    if (k === 'inicio') start = ds[0];
    else if (k === 'fin') end = ds[0];
    else {
      const name = (v.split('|')[0] ?? '').replace(DATE, '').trim() || `${terms.length + 1}.ª evaluación`;
      terms.push({ name, start: ds[0] ?? '', end: ds[1] ?? '' });
    }
  }
  return { start, end, terms, holidays: rest.join('\n') };
}

export interface Slot { weekday: number; slot: string }

/** Sesiones lectivas entre dos fechas según el horario semanal, sin festivos. */
export function schoolDays(from: string, to: string, timetable: Slot[], holidays: Set<string>): { date: string; slot: string }[] {
  const out: { date: string; slot: string }[] = [];
  if (!from || !to || from > to) return out;
  for (let d = from, i = 0; d <= to && i < 800; d = addDays(d, 1), i++) {
    if (holidays.has(d)) continue;
    for (const t of timetable) if (t.weekday === weekday(d)) out.push({ date: d, slot: t.slot });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot, 'es', { numeric: true }));
}

/** Orden de las sesiones: fecha y hora. */
export const bySessionOrder = (a: Session, b: Session) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot, 'es', { numeric: true });

/**
 * Reparte las unidades (en su orden) por las sesiones sin unidad, según las sesiones previstas de cada una y
 * descontando las que ya tienen asignadas. Devuelve sesión → unidad.
 */
export function distribute(sessions: Session[], units: LearningUnit[]): Map<string, string> {
  const live = sessions.filter((s) => !s.deleted).sort(bySessionOrder);
  const have = new Map<string, number>();
  for (const s of live) if (s.unitId) have.set(s.unitId, (have.get(s.unitId) ?? 0) + 1);
  const queue: string[] = [];
  for (const u of units.filter((x) => !x.deleted)) for (let i = have.get(u.id) ?? 0; i < u.plannedSessions; i++) queue.push(u.id);
  const out = new Map<string, string>();
  for (const s of live) {
    if (s.unitId || !queue.length) continue;
    out.set(s.id, queue.shift()!);
  }
  return out;
}

/** Sesiones previstas y programadas por unidad. */
export function unitBalance(units: LearningUnit[], sessions: Session[]) {
  const n = new Map<string, number>();
  for (const s of sessions) if (!s.deleted && s.unitId) n.set(s.unitId, (n.get(s.unitId) ?? 0) + 1);
  return units.filter((u) => !u.deleted).map((u) => ({ unit: u, planned: u.plannedSessions, scheduled: n.get(u.id) ?? 0 }));
}

/** Sesiones previstas de un grupo en el curso y en cada evaluación, según su horario y el calendario escolar. */
export function plannedSessions(cal: { start: string; end: string; holidays: string; terms: { start: string; end: string }[] } | undefined, timetable: Slot[], extraHolidays = '') {
  if (!cal?.start || !cal.end || !timetable.length) return null;
  const hol = parseHolidays(cal.holidays + '\n' + extraHolidays);
  const all = schoolDays(cal.start, cal.end, timetable, hol);
  return {
    total: all.length,
    byTerm: cal.terms.map((t) => (t.start && t.end ? all.filter((x) => x.date >= t.start && x.date <= t.end).length : null)),
  };
}

/** Lo que quedó pendiente en la sesión anterior del mismo grupo. */
export function previousPending(sessions: Session[], s: Session): string {
  const live = sessions.filter((x) => !x.deleted && x.groupId === s.groupId).sort(bySessionOrder);
  const i = live.findIndex((x) => x.id === s.id);
  return i > 0 ? live[i - 1].pending ?? '' : '';
}
