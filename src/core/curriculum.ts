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
 * - Proyectos Artísticos calcula la nota por competencias específicas (si no se ha elegido otra cosa).
 */
export function migrateSubject(s: Subject): Subject | null {
  let changed = false;
  let config = s.config;
  if (s.id === 'pa-1bach' && config.gradeLevel === undefined && s.levels.some((l) => l.key === 'ce')) {
    config = { ...config, gradeLevel: 'ce' };
    changed = true;
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
