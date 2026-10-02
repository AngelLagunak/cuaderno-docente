import type { Activity, CLink, CNode, Grade, Subject } from './model';

export type Num = number | null;

export function wmean(items: Array<[Num, number]>): Num {
  let s = 0;
  let w = 0;
  for (const [v, wt] of items) {
    if (v != null && wt > 0) {
      s += v * wt;
      w += wt;
    }
  }
  return w > 0 ? s / w : null;
}

export function round(v: Num, decimals: number): Num {
  if (v == null) return null;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Valor de una calificación con penalización por entrega tardía. */
export function effectiveValue(g: Grade | undefined, subject: Subject): Num {
  if (!g || g.value == null) return null;
  const p = g.late ? subject.config.latePenaltyPct : 0;
  return g.value * (1 - p / 100);
}

export interface InstrumentResult { id: string; name: string; weight: number; value: Num }
export interface TermResult {
  value: Num;
  byInstrument: InstrumentResult[];
  /** Fracción (0–1) del peso de instrumentos con datos. */
  coverage: number;
  /** Instrumentos con nota < passMark (solo si minPerInstrument). */
  belowMin: string[];
}

export function termResult(
  subject: Subject,
  activities: Activity[],
  grades: Map<string, Grade>,
  termId: string
): TermResult {
  const acts = activities.filter((a) => a.termId === termId);
  const byInstrument: InstrumentResult[] = subject.instruments.map((i) => ({
    id: i.id,
    name: i.name,
    weight: i.weight,
    value: wmean(
      acts
        .filter((a) => a.instrumentId === i.id)
        .map((a): [Num, number] => [effectiveValue(grades.get(a.id), subject), a.weight])
    ),
  }));
  const value = wmean(byInstrument.map((i): [Num, number] => [i.value, i.weight]));
  const total = byInstrument.reduce((s, i) => s + i.weight, 0);
  const covered = byInstrument.reduce((s, i) => s + (i.value != null ? i.weight : 0), 0);
  const belowMin = subject.config.minPerInstrument
    ? byInstrument.filter((i) => i.value != null && i.value < subject.config.passMark).map((i) => i.name)
    : [];
  return { value, byInstrument, coverage: total > 0 ? covered / total : 0, belowMin };
}

export interface FinalResult {
  value: Num;
  rounded: Num;
  terms: { id: string; name: string; weight: number; result: TermResult }[];
  coverage: number;
  /** Algún trimestre con instrumento bajo mínimo. */
  belowMin: boolean;
}

export function finalResult(
  subject: Subject,
  activities: Activity[],
  grades: Map<string, Grade>
): FinalResult {
  const terms = subject.terms.map((t) => ({
    id: t.id,
    name: t.name,
    weight: t.weight,
    result: termResult(subject, activities, grades, t.id),
  }));
  const value = wmean(terms.map((t): [Num, number] => [t.result.value, t.weight]));
  const total = terms.reduce((s, t) => s + t.weight, 0);
  const covered = terms.reduce((s, t) => s + (t.result.value != null ? t.weight : 0), 0);
  return {
    value,
    rounded: round(value, subject.config.finalDecimals),
    terms,
    coverage: total > 0 ? covered / total : 0,
    belowMin: terms.some((t) => t.result.belowMin.length > 0),
  };
}

export interface Profile {
  /** Valor por nodo curricular (criterio, CE, descriptor…). null = sin datos. */
  nodes: Map<string, Num>;
  /** Valor por grupo de descriptores (competencias clave). */
  groups: Map<string, Num>;
}

/**
 * Perfil competencial. Cada actividad con nodos vinculados aporta su nota a esos nodos.
 * Los valores suben por las relaciones `aggregate`. Lo no evaluado se ignora (no cuenta como 0).
 * Todos los elementos del mismo nivel pesan igual.
 */
export function profile(
  subject: Subject,
  nodes: CNode[],
  links: CLink[],
  activities: Activity[],
  grades: Map<string, Grade>,
  termId?: string
): Profile {
  const direct = new Map<string, Array<[Num, number]>>();
  for (const a of activities) {
    if (termId && a.termId !== termId) continue;
    const v = effectiveValue(grades.get(a.id), subject);
    if (v == null) continue;
    for (const id of a.nodeIds) {
      if (!direct.has(id)) direct.set(id, []);
      direct.get(id)!.push([v, a.weight]);
    }
  }

  const children = new Map<string, string[]>();
  for (const r of subject.relations.filter((x) => x.aggregate)) {
    for (const l of links) {
      if (l.relation !== r.key || l.deleted) continue;
      if (!children.has(l.toId)) children.set(l.toId, []);
      children.get(l.toId)!.push(l.fromId);
    }
  }

  const memo = new Map<string, Num>();
  const val = (id: string): Num => {
    if (memo.has(id)) return memo.get(id)!;
    memo.set(id, null); // protección ante ciclos
    const parts: Array<[Num, number]> = [];
    const d = wmean(direct.get(id) ?? []);
    if (d != null) parts.push([d, 1]);
    for (const c of children.get(id) ?? []) {
      const cv = val(c);
      if (cv != null) parts.push([cv, 1]);
    }
    const r = wmean(parts);
    memo.set(id, r);
    return r;
  };

  const out: Profile = { nodes: new Map(), groups: new Map() };
  const acc = new Map<string, Array<[Num, number]>>();
  for (const n of nodes) {
    const v = val(n.id);
    out.nodes.set(n.id, v);
    if (n.group) {
      if (!acc.has(n.group)) acc.set(n.group, []);
      acc.get(n.group)!.push([v, 1]);
    }
  }
  for (const [g, items] of acc) out.groups.set(g, wmean(items));
  return out;
}
