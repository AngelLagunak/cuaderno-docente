import { finalResult, officialRound } from './evaluation';
import type { Curr, FinalResult, Num, StudentGrades } from './evaluation';
import type { Activity, Attendance, Grade, Student, Subject } from './model';

/** Faltas de un alumno. Base del %: sesiones anuales previstas o, si no hay, sesiones con lista pasada. */
export interface AbsenceSummary { A: number; J: number; R: number; sessions: number; base: number; pct: number; warn: boolean }

export function absenceSummary(subject: Subject, rows: Attendance[], studentId: string): AbsenceSummary {
  const live = rows.filter((r) => !r.deleted);
  const sessions = new Set(live.map((r) => `${r.date}|${r.slot}`)).size;
  const annual = subject.config.annualSessions ?? 0;
  const base = annual > 0 ? annual : sessions;
  const c = { A: 0, J: 0, R: 0 };
  for (const r of live) if (r.studentId === studentId && r.status !== 'P') c[r.status]++;
  const pct = base > 0 ? (c.A / base) * 100 : 0;
  return { ...c, sessions, base, pct, warn: base > 0 && pct >= (subject.config.absenceWarnPct ?? 20) };
}

/** Nota de dos partes ponderadas (vía alternativa o extraordinaria). */
export interface TwoParts { value: Num; rounded: Num; /** Alguna parte no llega al mínimo exigido: no hace media. */ blocked: boolean }

export function twoParts(subject: Subject, a: Num, b: Num, pa: number, pb: number, minEach = 0): TwoParts {
  if (a == null || b == null || pa + pb <= 0) return { value: null, rounded: null, blocked: false };
  const value = (a * pa + b * pb) / (pa + pb);
  const blocked = minEach > 0 && (a < minEach || b < minEach);
  let rounded = officialRound(subject, value);
  // Sin media: suspenso, como mucho el valor inmediatamente inferior al aprobado.
  if (blocked && rounded != null) rounded = Math.min(rounded, subject.config.passMark - 10 ** -subject.config.finalDecimals);
  return { value, rounded, blocked };
}

/** Resultado oficial del alumno: ordinaria (o vía por pérdida de evaluación continua) y, si suspende, extraordinaria. */
export interface Outcome {
  ordinary: FinalResult;
  /** Vía alternativa por pérdida de evaluación continua (solo si el docente la ha marcado). */
  lec: TwoParts | null;
  /** Convocatoria extraordinaria (solo si la ordinaria no está aprobada y hay notas). */
  extra: TwoParts | null;
  official: Num;
  source: 'ordinaria' | 'pérdida de evaluación continua' | 'extraordinaria';
}

export function outcome(subject: Subject, activities: Activity[], grades: StudentGrades, curr: Curr, student: Student): Outcome {
  const cfg = subject.config;
  const ordinary = finalResult(subject, activities, grades, curr);
  const lp = cfg.lec ?? { folderPct: 50, examPct: 50 };
  const lec = student.lec ? twoParts(subject, student.lecGrades?.folder ?? null, student.lecGrades?.exam ?? null, lp.folderPct, lp.examPct) : null;
  const ord = lec ? lec.rounded : ordinary.rounded;
  const ep = cfg.extra ?? { projectsPct: 40, examPct: 60, minEach: 0 };
  const failed = ord == null || ord < cfg.passMark;
  const ex = student.extra && failed ? twoParts(subject, student.extra.projects, student.extra.exam, ep.projectsPct, ep.examPct, ep.minEach) : null;
  const extra = ex && ex.value != null ? ex : null;
  if (extra) return { ordinary, lec, extra, official: extra.rounded, source: 'extraordinaria' };
  return { ordinary, lec, extra: null, official: ord, source: lec ? 'pérdida de evaluación continua' : 'ordinaria' };
}

/** Etiqueta de la escala SS/AP/NT/SB (Modelado y Maquetismo). Vacía si la materia usa escala numérica. */
export function scaleLabel(subject: Subject, v: Num): string {
  if (subject.config.scale !== 'ssapntsb' || v == null) return '';
  return v < 5 ? 'SS' : v < 7 ? 'AP' : v < 9 ? 'NT' : 'SB';
}

/** Una entrega fuera de plazo sin justificar no se puede mejorar si la materia lo indica (Proyectos Artísticos). */
export function canImprove(subject: Subject, overall: Grade | undefined): boolean {
  return !(subject.config.lateNoImprove && overall?.late);
}
