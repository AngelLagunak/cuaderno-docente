import type { Activity, CLink, CNode, LearningUnit, Subject } from './model';
import { aggregateTree } from './evaluation';

export interface Issue {
  key: string;
  nodeId: string;
  message: string;
}

/** Panel de revisión: nodos sin enlaces que deberían tenerlos. */
export function review(subject: Subject, nodes: CNode[], links: CLink[]): Issue[] {
  const issues: Issue[] = [];
  const plural = (k: string) => subject.levels.find((l) => l.key === k)?.plural.toLowerCase() ?? k;
  for (const r of subject.relations) {
    const live = links.filter((l) => l.relation === r.key && !l.deleted);
    if (r.needFrom) {
      const used = new Set(live.map((l) => l.fromId));
      for (const n of nodes.filter((x) => x.level === r.from && !x.deleted && !used.has(x.id)))
        issues.push({ key: `${r.key}:f:${n.id}`, nodeId: n.id, message: `Sin ${plural(r.to)} vinculados` });
    }
    if (r.needTo) {
      const used = new Set(live.map((l) => l.toId));
      for (const n of nodes.filter((x) => x.level === r.to && !x.deleted && !used.has(x.id)))
        issues.push({ key: `${r.key}:t:${n.id}`, nodeId: n.id, message: `Sin ${plural(r.from)} vinculados` });
    }
  }
  return issues;
}

/**
 * Cambios en materias ya guardadas. Devuelve la materia cambiada o null si no hay nada que hacer.
 * - «Indicador» pasa a «Concreción» (así lo llama la programación), para no confundirlo con los indicadores de logro.
 * - Los ajustes nuevos de cálculo que falten se toman del catálogo (p. ej. nota por competencias en Proyectos
 *   Artísticos, reglas de recuperación y extraordinaria). Lo que el docente ya eligió no se toca.
 */
export function migrateSubject(s: Subject, catalog?: Subject): Subject | null {
  let changed = false;
  let config = s.config;
  if (catalog) {
    for (const [k, v] of Object.entries(catalog.config) as [keyof Subject['config'], unknown][]) {
      if (config[k] === undefined && v !== undefined) {
        config = { ...config, [k]: v };
        changed = true;
      }
    }
  }
  const levels = s.levels.map((l) => {
    if (l.key === 'ind' && l.label === 'Indicador' && l.plural === 'Indicadores') {
      changed = true;
      return { ...l, label: 'Concreción', plural: 'Concreciones' };
    }
    return l;
  });
  return changed ? { ...s, levels, config } : null;
}

/** Niveles que se califican (criterio, concreción, aspecto…). */
export const gradedLevels = (subject: Subject) => new Set(subject.levels.filter((l) => l.graded).map((l) => l.key));

/** Actividades que no evalúan ningún elemento calificable: no aportan al perfil ni admiten nota por criterio. */
export function activitiesWithoutItems(subject: Subject, nodes: CNode[], activities: Activity[]): Activity[] {
  const graded = gradedLevels(subject);
  const ok = new Set(nodes.filter((n) => !n.deleted && graded.has(n.level)).map((n) => n.id));
  return activities.filter((a) => !a.deleted && !a.nodeIds.some((id) => ok.has(id)));
}

export interface CoverageRow {
  node: CNode;
  units: number;
  /** Actividades por instrumento. */
  byInstrument: Record<string, number>;
  total: number;
}

/**
 * Cobertura de cada elemento calificable: unidades que lo incluyen y actividades por instrumento.
 * Una actividad que evalúa una concreción también cubre su criterio.
 */
export function coverage(subject: Subject, nodes: CNode[], links: CLink[], units: LearningUnit[], activities: Activity[]): CoverageRow[] {
  const graded = gradedLevels(subject);
  const { ancestors } = aggregateTree(subject, links);
  const reach = (ids: string[]) => {
    const s = new Set(ids);
    for (const id of ids) for (const p of ancestors(id)) s.add(p);
    return s;
  };
  const ur = units.filter((u) => !u.deleted).map((u) => reach(u.nodeIds));
  const ar = activities.filter((a) => !a.deleted).map((a) => ({ a, r: reach(a.nodeIds) }));
  return nodes
    .filter((n) => !n.deleted && graded.has(n.level))
    .map((node) => {
      const byInstrument: Record<string, number> = {};
      let total = 0;
      for (const { a, r } of ar) {
        if (!r.has(node.id)) continue;
        byInstrument[a.instrumentId] = (byInstrument[a.instrumentId] ?? 0) + 1;
        total++;
      }
      return { node, units: ur.filter((r) => r.has(node.id)).length, byInstrument, total };
    });
}

/**
 * Columnas del mapa de relaciones: cada nivel va a la derecha de los niveles que lo alimentan
 * (concreción → criterio → competencia específica → descriptor). Los niveles sin relaciones van en la primera.
 */
export function levelColumns(subject: Subject): string[][] {
  const depth = new Map(subject.levels.map((l) => [l.key, 0]));
  for (let i = 0; i < subject.levels.length; i++) {
    for (const r of subject.relations) {
      const d = (depth.get(r.from) ?? 0) + 1;
      if (depth.has(r.to) && d > depth.get(r.to)! && d < subject.levels.length) depth.set(r.to, d);
    }
  }
  const cols: string[][] = [];
  for (const l of subject.levels) (cols[depth.get(l.key)!] ??= []).push(l.key);
  return cols.filter(Boolean);
}

/**
 * Cadena completa de un elemento: lo que alimenta (hacia la derecha: criterio → CE → descriptores) y lo que
 * lo alimenta a él (hacia la izquierda: concreciones, saberes). No salta a «hermanos».
 */
export function chainOf(id: string, links: CLink[]): Set<string> {
  const live = links.filter((l) => !l.deleted);
  const out = new Set([id]);
  const walk = (start: string, next: (x: string) => string[]) => {
    const stack = [start];
    while (stack.length) {
      for (const n of next(stack.pop()!)) if (!out.has(n)) { out.add(n); stack.push(n); }
    }
  };
  walk(id, (x) => live.filter((l) => l.fromId === x).map((l) => l.toId));
  walk(id, (x) => live.filter((l) => l.toId === x).map((l) => l.fromId));
  return out;
}

/** Relación con la que se puede unir un elemento del nivel `a` con otro del nivel `b`, en el sentido correcto. */
export function relationFor(subject: Subject, a: string, b: string): { key: string; reversed: boolean } | null {
  const r = subject.relations.find((x) => x.from === a && x.to === b);
  if (r) return { key: r.key, reversed: false };
  const q = subject.relations.find((x) => x.from === b && x.to === a);
  return q ? { key: q.key, reversed: true } : null;
}
