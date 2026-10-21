import type { LearningUnit, Session } from './model';

/** Fecha AAAA-MM-DD de un Date en hora local. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
/** Día de la semana: 1 = lunes … 7 = domingo. */
export const weekday = (s: string) => ((parse(s).getDay() + 6) % 7) + 1;
/** Lunes de la semana de una fecha. */
export const monday = (s: string) => addDays(s, 1 - weekday(s));

/** Festivos y vacaciones: una fecha o un intervalo «inicio..fin» por línea o separados por comas. */
export function parseHolidays(text: string): Set<string> {
  const out = new Set<string>();
  for (const part of text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:\s*(?:\.\.|–|-{1,2}>?|a)\s*(\d{4}-\d{2}-\d{2}))?$/.exec(part);
    if (!m) continue;
    let d = m[1];
    const end = m[2] ?? m[1];
    for (let i = 0; d <= end && i < 400; i++, d = addDays(d, 1)) out.add(d);
  }
  return out;
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
