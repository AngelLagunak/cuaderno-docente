import { schoolDays } from './planning';
import type { Slot } from './planning';
import type { Attendance, LearningUnit, Session, Term } from './model';
import type { Num } from './evaluation';

export interface UnitProgress { unit: LearningUnit; planned: number; scheduled: number; taught: number }

/**
 * Avance de la programación de un grupo a una fecha. Una sesión cuenta como impartida si su fecha ya ha pasado o es
 * hoy y se ha pasado lista. El desfase de cada evaluación compara las sesiones que aún faltan de sus unidades con las
 * que quedan en el calendario hasta su fin: positivo = vas por detrás.
 */
export function sessionProgress(p: {
  units: LearningUnit[]; sessions: Session[]; attendance: Attendance[]; today: string; terms: Term[];
  calendarTerms?: { start: string; end: string }[]; timetable?: Slot[]; holidays?: Set<string>;
}) {
  const live = p.sessions.filter((s) => !s.deleted);
  const held = new Set(p.attendance.filter((r) => !r.deleted && r.date === p.today).map((r) => `${r.date}|${r.slot}`));
  const isTaught = (s: Session) => s.date < p.today || (s.date === p.today && held.has(`${s.date}|${s.slot}`));
  const taught = live.filter(isTaught);
  const units: UnitProgress[] = p.units.filter((u) => !u.deleted).map((u) => ({
    unit: u, planned: u.plannedSessions,
    scheduled: live.filter((s) => s.unitId === u.id).length,
    taught: taught.filter((s) => s.unitId === u.id).length,
  }));
  const terms = p.terms.map((t, i) => {
    const range = p.calendarTerms?.[i];
    const pendingPlan = units.filter((u) => u.unit.termId === t.id).reduce((n, u) => n + Math.max(0, u.planned - u.taught), 0);
    const left = range?.end && p.timetable?.length
      ? schoolDays(p.today > range.start ? p.today : range.start, range.end, p.timetable, p.holidays ?? new Set()).filter((x) => !(x.date === p.today && held.has(`${x.date}|${x.slot}`))).length
      : null;
    return { term: t, pendingPlan, left, gap: left == null || (range && range.end < p.today) ? null : pendingPlan - left };
  });
  const withPending = taught.filter((s) => s.pending?.trim());
  const freq = new Map<string, { text: string; n: number }>();
  for (const s of withPending) {
    const k = s.pending!.trim().toLowerCase();
    const f = freq.get(k) ?? { text: s.pending!.trim(), n: 0 };
    f.n++; freq.set(k, f);
  }
  const rows = p.attendance.filter((r) => !r.deleted);
  return {
    taught: taught.length, total: live.length, units, terms,
    pending: withPending.length, topPending: [...freq.values()].sort((a, b) => b.n - a.n)[0] ?? null,
    attendancePct: rows.length ? (rows.filter((r) => r.status === 'P' || r.status === 'R').length / rows.length) * 100 : null,
  };
}

export const BUCKETS = ['< 5', '5', '6', '7–8', '9–10'];

/** Resumen de notas de una evaluación: media, aprobados y reparto (las notas se redondean a entero para el reparto). */
export function gradeSummary(values: Num[], pass: number) {
  const v = values.filter((x): x is number => x != null);
  const counts = BUCKETS.map(() => 0);
  for (const x of v) {
    const r = Math.round(x);
    counts[x < pass ? 0 : r <= 5 ? 1 : r === 6 ? 2 : r <= 8 ? 3 : 4]++;
  }
  return { n: v.length, of: values.length, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, passed: v.filter((x) => x >= pass).length, counts };
}
