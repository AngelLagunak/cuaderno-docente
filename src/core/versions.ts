import type { CLink, CNode, LearningUnit, Rubric, SnapshotData, Stamp, Subject } from './model';

const live = <T extends Stamp>(xs: T[]) => xs.filter((x) => !x.deleted);
const clean = <T extends Stamp>(x: T): T => { const { deleted: _d, deviceId: _v, ...r } = x; return r as T; };

/** Programación actual de una materia (sin alumnado ni notas), para guardarla como versión. */
export function takeSnapshot(subject: Subject, nodes: CNode[], links: CLink[], units: LearningUnit[], rubrics: Rubric[]): SnapshotData {
  const mine = <T extends Stamp & { subjectId: string }>(xs: T[]) => live(xs).filter((x) => x.subjectId === subject.id).map(clean);
  return { subject: clean(subject), nodes: mine(nodes), links: mine(links), units: mine(units), rubrics: mine(rubrics) };
}

type Keyed = { id: string };
function diffBy<T extends Keyed>(before: T[], after: T[], same: (a: T, b: T) => boolean) {
  const a = new Map(before.map((x) => [x.id, x])), b = new Map(after.map((x) => [x.id, x]));
  return {
    added: after.filter((x) => !a.has(x.id)),
    removed: before.filter((x) => !b.has(x.id)),
    changed: after.filter((x) => a.has(x.id) && !same(a.get(x.id)!, x)).map((x) => ({ before: a.get(x.id)!, after: x })),
  };
}
const json = (x: unknown) => JSON.stringify(x);

/** Diferencias entre una versión guardada (`before`) y otra (o la actual, `after`). */
export function snapshotDiff(before: SnapshotData, after: SnapshotData) {
  const pick = (s: Subject) => json([s.name, s.course, s.levels, s.relations, s.instruments, s.terms, s.config]);
  return {
    subject: pick(before.subject) !== pick(after.subject),
    nodes: diffBy(before.nodes, after.nodes, (a, b) => json([a.level, a.code, a.title, a.tags, a.group ?? null]) === json([b.level, b.code, b.title, b.tags, b.group ?? null])),
    links: diffBy(before.links, after.links, () => true),
    units: diffBy(before.units, after.units, (a, b) => json([a.code, a.title, a.termId, a.plannedSessions, a.nodeIds]) === json([b.code, b.title, b.termId, b.plannedSessions, b.nodeIds])),
    rubrics: diffBy(before.rubrics, after.rubrics, (a, b) => json([a.name, a.levels, a.rows]) === json([b.name, b.levels, b.rows])),
  };
}
export type SnapshotDiff = ReturnType<typeof snapshotDiff>;
export const diffCount = (d: SnapshotDiff) =>
  (d.subject ? 1 : 0) + [d.nodes, d.links, d.units, d.rubrics].reduce((s, x) => s + x.added.length + x.removed.length + x.changed.length, 0);

/**
 * Cambios para volver a una versión: lo de la versión se guarda de nuevo (fecha actual, para que se sincronice) y lo
 * que no estaba en ella se borra. Los elementos curriculares borrados se devuelven aparte para quitarlos también de
 * actividades y unidades.
 */
export function restoreChanges(snap: SnapshotData, cur: SnapshotData, now: number) {
  const d = snapshotDiff(cur, snap);
  const put = <T extends Stamp>(xs: T[]) => xs.map((x) => ({ ...x, deleted: false, updatedAt: now }));
  const del = <T extends Stamp>(xs: T[]) => xs.map((x) => ({ ...x, deleted: true, updatedAt: now }));
  return {
    subject: { ...snap.subject, updatedAt: now },
    nodes: put([...d.nodes.added, ...d.nodes.changed.map((c) => c.after)]),
    removedNodes: d.nodes.removed,
    links: [...put(d.links.added), ...del(d.links.removed)],
    units: [...put([...d.units.added, ...d.units.changed.map((c) => c.after)]), ...del(d.units.removed)],
    rubrics: [...put([...d.rubrics.added, ...d.rubrics.changed.map((c) => c.after)]), ...del(d.rubrics.removed)],
  };
}
