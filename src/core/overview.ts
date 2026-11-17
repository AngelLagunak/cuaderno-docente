import { assessableNodes, gradedLevels, unitNodeIds } from './curriculum';
import { aggregateTree } from './evaluation';
import type { Activity, CLink, CNode, LearningUnit, Subject } from './model';

/** Cómo va un elemento del currículo: evaluado (con alguna actividad calificable), solo trabajado (formativa) o pendiente. */
export type Status = 'evaluated' | 'worked' | 'missing';

export interface NodeCover { node: CNode; status: Status; units: string[]; graded: number; formative: number }
export interface CompCover extends NodeCover { crits: (NodeCover & { leaves: NodeCover[] })[] }
export interface UnitView { unit: LearningUnit; activities: Activity[]; saberes: CNode[]; criteria: CNode[] }

export interface Overview {
  units: UnitView[];
  /** Actividades sin unidad. */
  loose: Activity[];
  comps: CompCover[];
  saberes: { node: CNode; units: string[] }[];
  totals: { leaves: [number, number]; crits: [number, number]; comps: [number, number]; saberes: [number, number] };
}

/**
 * Visión general de la programación de un grupo: unidades con sus actividades y saberes, y cómo se trabaja cada
 * elemento del currículo (competencia → criterio → concreción). Una actividad que evalúa una concreción cubre
 * también su criterio y su competencia; lo trabajado solo en actividades sin calificación cuenta como «trabajado».
 */
export function overview(subject: Subject, nodes: CNode[], links: CLink[], units: LearningUnit[], activities: Activity[]): Overview {
  const live = nodes.filter((n) => !n.deleted);
  const acts = activities.filter((a) => !a.deleted);
  const us = units.filter((u) => !u.deleted)
    .sort((a, b) => subject.terms.findIndex((t) => t.id === a.termId) - subject.terms.findIndex((t) => t.id === b.termId) || a.code.localeCompare(b.code, 'es', { numeric: true }));
  const byId = new Map(live.map((n) => [n.id, n]));
  const graded = gradedLevels(subject);
  const { children, ancestors } = aggregateTree(subject, links);
  const reach = (ids: string[]) => { const s = new Set(ids); for (const id of ids) ancestors(id).forEach((x) => s.add(x)); return s; };
  const actReach = acts.map((a) => ({ a, r: reach(a.nodeIds) }));
  const unitReach = us.map((u) => ({ u, r: reach(unitNodeIds(u, acts)) }));
  const byOrder = (a: CNode, b: CNode) => a.order - b.order;

  const cover = (n: CNode): NodeCover => {
    const hits = actReach.filter((x) => x.r.has(n.id));
    const g = hits.filter((x) => !x.a.formative).length;
    const f = hits.length - g;
    return { node: n, status: g ? 'evaluated' : f ? 'worked' : 'missing', units: unitReach.filter((x) => x.r.has(n.id)).map((x) => x.u.code), graded: g, formative: f };
  };

  const compLevel = subject.levels.find((l) => l.key === subject.config.gradeLevel) ?? subject.levels.find((l) => l.key === 'ce' || l.key === 'ra');
  const leaves = assessableNodes(subject, live, links);
  const leafIds = new Set(leaves.map((n) => n.id));
  const kids = (id: string) => (children.get(id) ?? []).map((x) => byId.get(x)).filter((n): n is CNode => !!n && graded.has(n.level)).sort(byOrder);
  let comps: CompCover[];
  if (compLevel) {
    comps = live.filter((n) => n.level === compLevel.key).sort(byOrder).map((c) => ({
      ...cover(c),
      crits: kids(c.id).map((k) => ({ ...cover(k), leaves: kids(k.id).filter((x) => leafIds.has(x.id)).map(cover) })),
    }));
  } else {
    // Sin competencias (p. ej. solo «aspectos evaluables»): un único bloque con los elementos evaluables.
    const flat = leaves.map((n) => ({ ...cover(n), leaves: [] }));
    comps = flat.length ? [{ node: { id: '_', subjectId: subject.id, level: '_', code: '', title: 'Elementos evaluables', order: 0, tags: [], updatedAt: 0 }, status: flat.every((x) => x.status === 'evaluated') ? 'evaluated' : 'missing', units: [], graded: 0, formative: 0, crits: flat }] : [];
  }
  const allCrits = comps.flatMap((c) => c.crits);
  const allLeaves = leaves.map(cover);
  const saberes = live.filter((n) => n.level === 'saber').sort(byOrder).map((n) => ({ node: n, units: us.filter((u) => u.nodeIds.includes(n.id)).map((u) => u.code) }));
  const done = (xs: { status: Status }[]): [number, number] => [xs.filter((x) => x.status === 'evaluated').length, xs.length];

  return {
    units: us.map((u) => ({
      unit: u,
      activities: acts.filter((a) => a.unitId === u.id).sort((a, b) => (a.from ?? a.date ?? '9').localeCompare(b.from ?? b.date ?? '9')),
      saberes: u.nodeIds.map((id) => byId.get(id)).filter((n): n is CNode => n?.level === 'saber').sort(byOrder),
      criteria: [...new Set(unitNodeIds(u, acts))].map((id) => byId.get(id)).filter((n): n is CNode => !!n && graded.has(n.level)).sort(byOrder),
    })),
    loose: acts.filter((a) => !a.unitId || !us.some((u) => u.id === a.unitId)),
    comps,
    saberes,
    totals: { leaves: done(allLeaves), crits: done(allCrits), comps: compLevel ? done(comps) : [0, 0], saberes: [saberes.filter((s) => s.units.length).length, saberes.length] },
  };
}
