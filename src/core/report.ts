import type { Profile } from './evaluation';
import type { CNode, Subject } from './model';

const num = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/** Primer nivel calificable de la materia: criterios en Bachillerato, aspectos en FP. */
export function criterionLevel(subject: Subject): string | undefined {
  return subject.levels.find((l) => l.graded)?.key;
}

/**
 * Texto para los marcadores de criterio de las plantillas: una línea por criterio evaluado con su nota.
 * `pending`: solo los que no llegan al aprobado. Lo no evaluado no aparece.
 */
export function criteriaText(subject: Subject, nodes: CNode[], prof: Profile, pending = false): string {
  const level = criterionLevel(subject);
  const lines = nodes
    .filter((n) => n.level === level && !n.deleted)
    .map((n) => ({ n, v: prof.nodes.get(n.id) ?? null }))
    .filter((x): x is { n: CNode; v: number } => x.v != null && (!pending || x.v < subject.config.passMark))
    .map(({ n, v }) => `- ${n.code} ${cut(n.title, 90)}: ${num(v)}`);
  if (lines.length) return lines.join('\n');
  return pending ? '(ninguno)' : '(sin criterios evaluados)';
}
