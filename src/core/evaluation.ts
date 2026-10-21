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

/** Notas de un alumno: global por actividad y por criterio (actividad → nodo → nota). */
export interface StudentGrades {
  byActivity: Map<string, Grade>;
  byItem: Map<string, Map<string, Grade>>;
}

export const noGrades = (): StudentGrades => ({ byActivity: new Map(), byItem: new Map() });

/** Agrupa las notas por alumno. Ignora las borradas. */
export function indexGrades(rows: Grade[]): Map<string, StudentGrades> {
  const out = new Map<string, StudentGrades>();
  for (const g of rows) {
    if (g.deleted) continue;
    if (!out.has(g.studentId)) out.set(g.studentId, noGrades());
    const sg = out.get(g.studentId)!;
    if (!g.nodeId) sg.byActivity.set(g.activityId, g);
    else {
      if (!sg.byItem.has(g.activityId)) sg.byItem.set(g.activityId, new Map());
      sg.byItem.get(g.activityId)!.set(g.nodeId, g);
    }
  }
  return out;
}

/** Notas por criterio con valor, solo de nodos que la actividad sigue evaluando. */
export function itemGrades(a: Activity, sg: StudentGrades): Grade[] {
  const m = sg.byItem.get(a.id);
  if (!m) return [];
  return a.nodeIds.map((id) => m.get(id)).filter((g): g is Grade => g != null && g.value != null);
}

/** Nota de la actividad sin penalización: media de sus criterios si los hay; si no, la nota global. */
export function activityBase(a: Activity, sg: StudentGrades): Num {
  const items = itemGrades(a, sg);
  if (items.length) return wmean(items.map((g): [Num, number] => [g.value, 1]));
  return sg.byActivity.get(a.id)?.value ?? null;
}

/** Nota de la actividad con la penalización por entrega tardía (marcada en la nota global). */
export function activityValue(a: Activity, sg: StudentGrades, subject: Subject): Num {
  const v = activityBase(a, sg);
  return v == null ? null : penalize(v, a, sg, subject);
}

function penalize(v: number, a: Activity, sg: StudentGrades, subject: Subject): number {
  const p = sg.byActivity.get(a.id)?.late ? subject.config.latePenaltyPct : 0;
  return v * (1 - p / 100);
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
  grades: StudentGrades,
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
        .map((a): [Num, number] => [activityValue(a, grades, subject), a.weight])
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
  grades: StudentGrades
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
  const r = round(value, subject.config.finalDecimals);
  return {
    value,
    rounded: r == null ? null : Math.max(subject.config.minGrade ?? 1, r),
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
 * Peso de cada actividad calificada en la nota final: peso del trimestre × peso del instrumento ×
 * su parte dentro de las actividades calificadas de ese trimestre e instrumento.
 */
function activityShares(subject: Subject, activities: Activity[], grades: StudentGrades): Map<string, number> {
  const graded = activities.filter((a) => activityBase(a, grades) != null);
  const sums = new Map<string, number>();
  for (const a of graded) {
    const k = `${a.termId}|${a.instrumentId}`;
    sums.set(k, (sums.get(k) ?? 0) + Math.max(a.weight, 0));
  }
  const out = new Map<string, number>();
  for (const a of graded) {
    const tw = subject.terms.find((t) => t.id === a.termId)?.weight ?? 0;
    const iw = subject.instruments.find((i) => i.id === a.instrumentId)?.weight ?? 0;
    const sum = sums.get(`${a.termId}|${a.instrumentId}`)!;
    out.set(a.id, sum > 0 ? (tw * iw * Math.max(a.weight, 0)) / sum : 0);
  }
  return out;
}

/** Hijos de cada nodo según las relaciones `aggregate` (el valor del hijo sube al padre). */
export function aggregateTree(subject: Subject, links: CLink[]) {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const r of subject.relations.filter((x) => x.aggregate)) {
    for (const l of links) {
      if (l.relation !== r.key || l.deleted) continue;
      if (!children.has(l.toId)) children.set(l.toId, []);
      children.get(l.toId)!.push(l.fromId);
      if (!parents.has(l.fromId)) parents.set(l.fromId, []);
      parents.get(l.fromId)!.push(l.toId);
    }
  }
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of parents.get(id) ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      ancestors(p, seen);
    }
    return seen;
  };
  return { children, ancestors };
}

/**
 * Perfil competencial. Cada actividad aporta a sus nodos con el mismo peso que tiene en la nota final:
 * la nota de cada criterio calificado o, si no hay notas por criterio, la nota global a todos sus nodos.
 * Los valores suben por las relaciones `aggregate`. Lo no evaluado se ignora (no cuenta como 0).
 * Todos los elementos del mismo nivel pesan igual.
 */
export function profile(
  subject: Subject,
  nodes: CNode[],
  links: CLink[],
  activities: Activity[],
  grades: StudentGrades,
  termId?: string
): Profile {
  const { children, ancestors } = aggregateTree(subject, links);
  const acts = activities.filter((a) => !termId || a.termId === termId);
  const shares = activityShares(subject, acts, grades);
  const direct = new Map<string, Array<[Num, number]>>();
  for (const a of acts) {
    const items = itemGrades(a, grades);
    const base = activityBase(a, grades);
    if (base == null) continue;
    const vals: [string, number][] = items.length
      ? items.map((g) => [g.nodeId!, penalize(g.value!, a, grades, subject)])
      : a.nodeIds.map((id) => [id, penalize(base, a, grades, subject)]);
    // Si la actividad evalúa un nodo y también a uno de sus descendientes, gana el más específico:
    // la nota ya sube al ancestro por la agregación y no debe contarse dos veces.
    const covered = new Set<string>();
    for (const [id] of vals) for (const p of ancestors(id)) covered.add(p);
    for (const [id, v] of vals) {
      if (covered.has(id)) continue;
      if (!direct.has(id)) direct.set(id, []);
      direct.get(id)!.push([v, shares.get(a.id) ?? 0]);
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
