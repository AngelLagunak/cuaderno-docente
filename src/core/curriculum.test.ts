import { describe, expect, it } from 'vitest';
import { activitiesWithoutItems, chainOf, coverage, levelColumns, relationFor, review } from './curriculum';
import type { Activity, LearningUnit } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const count = (level: string) => pa.nodes.filter((x) => x.level === level).length;

describe('catálogo de Proyectos Artísticos', () => {
  it('tiene 5 CE, 15 criterios y 29 indicadores', () => {
    expect(count('ce')).toBe(5);
    expect(count('crit')).toBe(15);
    expect(count('ind')).toBe(29);
  });
  it('enlaza cada indicador con su criterio', () => {
    for (const n of pa.nodes.filter((x) => x.level === 'ind')) {
      const l = pa.links.filter((k) => k.relation === 'ind-crit' && k.fromId === n.id);
      expect(l.map((k) => k.toId)).toEqual([`pa-1bach/crit:${n.code.slice(0, 3)}`]);
    }
  });
  it('todos los enlaces apuntan a nodos existentes', () => {
    const ids = new Set(pa.nodes.map((x) => x.id));
    for (const l of pa.links) {
      expect(ids.has(l.fromId)).toBe(true);
      expect(ids.has(l.toId)).toBe(true);
    }
  });
  it('no genera avisos en el panel de revisión', () => {
    expect(review(pa.subject, pa.nodes, pa.links)).toEqual([]);
  });
});

describe('review', () => {
  it('avisa de un criterio sin competencia específica', () => {
    const links = pa.links.filter((l) => !(l.relation === 'crit-ce' && l.fromId === 'pa-1bach/crit:5.4'));
    const issues = review(pa.subject, pa.nodes, links);
    expect(issues.map((i) => i.nodeId)).toEqual(['pa-1bach/crit:5.4']);
  });
  it('ignora los enlaces borrados', () => {
    const links = pa.links.map((l) => (l.fromId === 'pa-1bach/ind:1.1.1' ? { ...l, deleted: true } : l));
    expect(review(pa.subject, pa.nodes, links).map((i) => i.nodeId)).toEqual(['pa-1bach/ind:1.1.1']);
  });
  it('Modelado y Maquetismo no tiene relaciones que revisar', () => {
    expect(review(mm.subject, mm.nodes, [])).toEqual([]);
  });
});

const act = (id: string, instrumentId: string, nodeIds: string[]): Activity => ({
  id, subjectId: pa.subject.id, groupId: 'g', termId: 't1', instrumentId, title: id, weight: 1, nodeIds, updatedAt: 0,
});

describe('activitiesWithoutItems', () => {
  it('avisa de actividades sin criterio ni indicador (saberes y CE no cuentan)', () => {
    const acts = [
      act('a', 'proy', ['pa-1bach/crit:1.1']),
      act('b', 'proy', ['pa-1bach/saber:PART.A.1', 'pa-1bach/ce:CE.PA.1']),
      act('c', 'exam', []),
      { ...act('d', 'exam', []), deleted: true },
    ];
    expect(activitiesWithoutItems(pa.subject, pa.nodes, acts).map((a) => a.id)).toEqual(['b', 'c']);
  });
});

describe('coverage', () => {
  const units: LearningUnit[] = [{ id: 'u1', subjectId: pa.subject.id, code: 'UD1', title: '', termId: 't1', plannedSessions: 0, nodeIds: ['pa-1bach/crit:1.1', 'pa-1bach/crit:3.2'], updatedAt: 0 }];
  const acts = [
    act('a', 'proy', ['pa-1bach/ind:1.1.1']),
    act('b', 'proy', ['pa-1bach/crit:1.1', 'pa-1bach/ind:1.1.2']),
    act('c', 'exam', ['pa-1bach/crit:3.2']),
  ];
  const rows = new Map(coverage(pa.subject, pa.nodes, pa.links, units, acts).map((r) => [r.node.code, r]));
  it('cuenta actividades por instrumento y sube de indicador a criterio', () => {
    expect(rows.get('1.1')).toMatchObject({ units: 1, total: 2, byInstrument: { proy: 2 } });
    expect(rows.get('1.1.1')).toMatchObject({ units: 0, total: 1 });
    expect(rows.get('3.2')).toMatchObject({ units: 1, total: 1, byInstrument: { exam: 1 } });
  });
  it('lista solo elementos calificables y marca los que no se evalúan', () => {
    expect(rows.has('CE.PA.1')).toBe(false);
    expect(rows.get('5.4')!.total).toBe(0);
    expect(rows.size).toBe(15 + 29);
  });
});

describe('mapa de relaciones', () => {
  it('ordena los niveles en columnas según la cadena', () => {
    expect(levelColumns(pa.subject)).toEqual([['ind', 'saber'], ['crit'], ['ce'], ['desc']]);
    expect(levelColumns(mm.subject)).toEqual([['aspecto']]);
  });
  it('la cadena de un criterio llega a sus concreciones, saberes, CE y descriptores, sin hermanos', () => {
    const c = chainOf('pa-1bach/crit:1.1', pa.links);
    for (const id of ['pa-1bach/ind:1.1.1', 'pa-1bach/saber:PART.A.1', 'pa-1bach/ce:CE.PA.1', 'pa-1bach/desc:CCL1']) expect(c.has(id)).toBe(true);
    expect(c.has('pa-1bach/crit:1.2')).toBe(false); // hermano (misma CE)
    expect(c.has('pa-1bach/ind:1.2.1')).toBe(false);
  });
  it('ignora enlaces borrados', () => {
    const links = pa.links.map((l) => (l.relation === 'crit-ce' && l.fromId === 'pa-1bach/crit:1.1' ? { ...l, deleted: true } : l));
    expect(chainOf('pa-1bach/crit:1.1', links).has('pa-1bach/ce:CE.PA.1')).toBe(false);
  });
  it('encuentra la relación para unir dos niveles en cualquier orden', () => {
    expect(relationFor(pa.subject, 'crit', 'ce')).toEqual({ key: 'crit-ce', reversed: false });
    expect(relationFor(pa.subject, 'ce', 'crit')).toEqual({ key: 'crit-ce', reversed: true });
    expect(relationFor(pa.subject, 'ind', 'desc')).toBeNull();
  });
});
