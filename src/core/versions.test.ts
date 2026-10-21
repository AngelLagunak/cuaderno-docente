import { describe, expect, it } from 'vitest';
import { diffCount, restoreChanges, snapshotDiff, takeSnapshot } from './versions';
import type { LearningUnit } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const unit: LearningUnit = { id: 'u1', subjectId: pa.subject.id, code: 'UD1', title: 'Cartel', termId: 't1', plannedSessions: 6, nodeIds: [], updatedAt: 5 };
const base = takeSnapshot(pa.subject, [...pa.nodes, ...mm.nodes], pa.links, [unit], []);

describe('versiones de la programación', () => {
  it('guarda solo lo vivo de la materia', () => {
    const s = takeSnapshot(pa.subject, [...pa.nodes, { ...pa.nodes[0], id: 'borrado', deleted: true }, ...mm.nodes], pa.links, [unit], []);
    expect(s.nodes).toHaveLength(pa.nodes.length);
    expect(s.units).toEqual([unit]);
  });
  it('compara dos versiones', () => {
    const cur = takeSnapshot(
      { ...pa.subject, terms: pa.subject.terms.slice(0, 2) },
      [...pa.nodes.filter((n) => n.code !== 'PART.A.3').map((n) => (n.code === '1.1' ? { ...n, title: 'Nuevo texto' } : n)), { ...pa.nodes[0], id: 'nuevo', code: 'CE.PA.6' }],
      pa.links.slice(1), [{ ...unit, plannedSessions: 8 }], [],
    );
    const d = snapshotDiff(base, cur);
    expect(d.subject).toBe(true);
    expect(d.nodes.added.map((n) => n.code)).toEqual(['CE.PA.6']);
    expect(d.nodes.removed.map((n) => n.code)).toEqual(['PART.A.3']);
    expect(d.nodes.changed.map((c) => [c.before.title.slice(0, 7), c.after.title])).toEqual([['Generar', 'Nuevo texto']]);
    expect(d.links.removed).toHaveLength(1);
    expect(d.units.changed).toHaveLength(1);
    expect(diffCount(d)).toBe(1 + 3 + 1 + 1);
    expect(diffCount(snapshotDiff(base, base))).toBe(0);
  });
  it('volver a una versión: recupera, actualiza y borra', () => {
    const cur = takeSnapshot(pa.subject, [...pa.nodes.slice(1), { ...pa.nodes[0], id: 'nuevo', code: 'X' }], pa.links.slice(1), [], []);
    const r = restoreChanges(base, cur, 99);
    expect(r.nodes.map((n) => n.id)).toEqual([pa.nodes[0].id]);
    expect(r.nodes[0]).toMatchObject({ updatedAt: 99, deleted: false });
    expect(r.removedNodes.map((n) => n.id)).toEqual(['nuevo']);
    expect(r.links).toEqual([{ ...pa.links[0], updatedAt: 99, deleted: false }]);
    expect(r.units).toEqual([{ ...unit, updatedAt: 99, deleted: false }]);
    expect(r.subject.updatedAt).toBe(99);
  });
});
