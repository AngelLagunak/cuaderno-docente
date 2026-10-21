import { officialRound } from './evaluation';
import { norm } from './io';
import type { Outcome } from './rules';
import type { Student, Subject } from './model';
import type { XCell } from './xls';

export interface SigadPlan {
  headerRow: number;
  /** Columna donde se escribe la nota («Calificación»). */
  gradeCol: number;
  rows: { row: number; label: string; studentId: string | null }[];
}

/**
 * Listado de SIGAD: cabecera Apellido1, Apellido2, Nombre, Calificación. Empareja cada fila con un alumno por
 * apellidos y nombre (sin tildes ni mayúsculas). Devuelve null si no tiene ese formato.
 */
export function planSigad(table: XCell[][], students: Student[]): SigadPlan | null {
  const text = table.map((r) => r.map((c) => (c == null ? '' : String(c).trim())));
  const headerRow = text.findIndex((r) => r.some((c) => /^calificaci/.test(norm(c))));
  if (headerRow < 0) return null;
  const h = text[headerRow].map(norm);
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const gradeCol = col(/^calificaci/), a1 = col(/^apellido ?1|^primer apellido/), a2 = col(/^apellido ?2|^segundo apellido/), nm = col(/^nombre$/);
  const ap = col(/^apellidos$/);
  const key = (last: string, first: string) => norm(`${last} ${first}`);
  const byName = new Map<string, string>();
  for (const s of students.filter((x) => !x.deleted)) byName.set(key(s.lastName, s.firstName), s.id);
  const rows = text.slice(headerRow + 1).map((r, i) => {
    const last = ap >= 0 ? r[ap] : [a1 >= 0 ? r[a1] : '', a2 >= 0 ? r[a2] : ''].filter(Boolean).join(' ');
    const first = nm >= 0 ? r[nm] : '';
    return { row: headerRow + 1 + i, label: [last, first].filter(Boolean).join(', '), studentId: byName.get(key(last, first)) ?? null };
  }).filter((r) => r.label);
  return { headerRow, gradeCol, rows };
}

export type SigadWhat = { kind: 'term'; termId: string } | { kind: 'ordinary' } | { kind: 'extra' };

/** Nota que va a SIGAD: evaluación, final ordinaria (o vía por pérdida de evaluación continua) o extraordinaria. */
export function sigadValue(subject: Subject, o: Outcome, what: SigadWhat): number | null {
  if (what.kind === 'term') return officialRound(subject, o.ordinary.terms.find((t) => t.id === what.termId)?.result.value ?? null);
  if (what.kind === 'ordinary') return o.lec ? o.lec.rounded : o.ordinary.rounded;
  return o.extra?.rounded ?? null;
}
