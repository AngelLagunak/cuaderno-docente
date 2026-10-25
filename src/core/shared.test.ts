import { describe, expect, it } from 'vitest';
import { copyFor, matchWork, propagate } from './shared';
import type { Activity } from './model';

const base: Activity = {
  id: 'a1', subjectId: 's', groupId: 'g1', termId: 't1', instrumentId: 'proy', title: 'Cartel', weight: 2, nodeIds: ['c1'], unitId: 'u1',
  shareId: 'sh', date: '2026-10-20', classroomWorkId: 'w1', maxPoints: 10, formative: true, updatedAt: 1,
};

describe('actividades compartidas entre grupos', () => {
  it('la copia lleva la programación, no la tarea de Classroom', () => {
    const c = copyFor(base, 'g2', 'a2', 'sh', 5);
    expect(c).toMatchObject({ id: 'a2', groupId: 'g2', title: 'Cartel', weight: 2, nodeIds: ['c1'], unitId: 'u1', formative: true, shareId: 'sh', date: '2026-10-20' });
    expect(c.classroomWorkId).toBeUndefined();
    expect(c.maxPoints).toBeUndefined();
    c.nodeIds.push('x');
    expect(base.nodeIds).toEqual(['c1']);
  });
  it('propaga criterios y campos de programación; respeta lo de cada grupo', () => {
    const sib: Activity = { ...copyFor(base, 'g2', 'a2', 'sh', 1), classroomWorkId: 'w9', date: '2026-10-22' };
    const other: Activity = { ...sib, id: 'a3', shareId: 'otra' };
    const src: Activity = { ...base, nodeIds: ['c1', 'c2'], title: 'Cartel final', formative: undefined };
    const out = propagate(src, [src, sib, other], 9);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a2', title: 'Cartel final', nodeIds: ['c1', 'c2'], classroomWorkId: 'w9', date: '2026-10-22', updatedAt: 9 });
    expect(out[0].formative).toBeUndefined();
    expect(propagate(src, out, 10)).toEqual([]);
  });
  it('empareja tareas de Classroom por título', () => {
    const works = [{ id: 'x', title: 'Diseño de Cartel ' }, { id: 'y', title: 'Maqueta' }];
    expect(matchWork('diseño de  cártel', works)?.id).toBe('x');
    expect(matchWork('Diseño de cartel', works, new Set(['x']))).toBeUndefined();
  });
});
