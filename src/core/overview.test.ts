import { describe, expect, it } from 'vitest';
import { overview } from './overview';
import type { Activity, LearningUnit } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const ind = (c: string) => `pa-1bach/ind:${c}`;
const crit = (c: string) => `pa-1bach/crit:${c}`;
const saber = pa.nodes.find((n) => n.level === 'saber')!;
const unit = (id: string, code: string, nodeIds: string[] = []): LearningUnit => ({ id, subjectId: pa.subject.id, code, title: code, termId: 't1', plannedSessions: 4, nodeIds, updatedAt: 0 });
const act = (id: string, p: Partial<Activity>): Activity => ({ id, subjectId: pa.subject.id, groupId: 'g', termId: 't1', instrumentId: 'proy', title: id, weight: 1, nodeIds: [], updatedAt: 0, ...p });

describe('visión general', () => {
  const units = [unit('u1', 'UD1', [saber.id]), unit('u2', 'UD2')];
  const acts = [
    act('cartel', { unitId: 'u1', nodeIds: [ind('1.1.1')], from: '2026-10-05' }),
    act('debate', { unitId: 'u2', nodeIds: [ind('1.1.2')], formative: true }),
    act('suelta', { nodeIds: [crit('3.2')] }),
  ];
  const o = overview(pa.subject, pa.nodes, pa.links, units, acts);
  it('unidades con sus actividades, saberes y criterios (de las actividades)', () => {
    expect(o.units.map((u) => [u.unit.code, u.activities.map((a) => a.id), u.saberes.length, u.criteria.map((n) => n.code)]))
      .toEqual([['UD1', ['cartel'], 1, ['1.1.1']], ['UD2', ['debate'], 0, ['1.1.2']]]);
    expect(o.loose.map((a) => a.id)).toEqual(['suelta']);
  });
  it('estado de cada elemento: evaluado, solo trabajado o pendiente, en cascada', () => {
    const ce1 = o.comps.find((c) => c.node.code === 'CE.PA.1')!;
    const c11 = ce1.crits.find((c) => c.node.code === '1.1')!;
    expect(ce1.status).toBe('evaluated');
    expect(c11.status).toBe('evaluated');
    expect(c11.units).toEqual(['UD1', 'UD2']);
    expect(c11.leaves.map((l) => [l.node.code, l.status])).toEqual([['1.1.1', 'evaluated'], ['1.1.2', 'worked'], ['1.1.3', 'missing'], ['1.1.4', 'missing']]);
    expect(o.comps.find((c) => c.node.code === 'CE.PA.2')!.status).toBe('missing');
    // 3.2 no tiene concreciones: se evalúa directamente y no tiene hojas debajo.
    expect(o.comps.find((c) => c.node.code === 'CE.PA.3')!.crits.find((c) => c.node.code === '3.2')).toMatchObject({ status: 'evaluated', leaves: [] });
  });
  it('totales', () => {
    expect(o.totals.comps).toEqual([2, 5]);
    expect(o.totals.crits[1]).toBe(15);
    expect(o.totals.leaves[0]).toBe(2);
    expect(o.totals.saberes[0]).toBe(1);
  });
  it('materia sin competencias: lista de elementos evaluables', () => {
    const m = overview(mm.subject, mm.nodes, [], [], [act('x', { nodeIds: [mm.nodes[0].id] })]);
    expect(m.comps).toHaveLength(1);
    expect(m.comps[0].crits[0].status).toBe('evaluated');
    expect(m.totals.leaves).toEqual([1, mm.nodes.length]);
  });
});
