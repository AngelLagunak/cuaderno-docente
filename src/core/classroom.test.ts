import { describe, expect, it } from 'vitest';
import { autoMap, classify, pointsValue, rubricItems, rubricValue } from './classroom';
import { assessableNodes, gradedLevels } from './curriculum';
import { indexGrades, noGrades } from './evaluation';
import type { Activity, Grade, RubricDef } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const lv = (pts: number[]) => pts.map((p, i) => ({ id: `l${i}`, title: `N${i}`, points: p }));
const rubric: RubricDef = {
  id: 'r',
  criteria: [
    { id: 'c1', title: '3.2 Explica la intención', levels: lv([0, 1, 2, 4]) },
    { id: 'c2', title: '1.1.3: bocetos y maquetas', levels: lv([0, 5, 10]) },
    { id: 'c3', title: 'Presentación y limpieza', levels: lv([0, 2]) },
    { id: 'c4', title: '9.9 No existe', levels: lv([0, 2]) },
  ],
};

describe('autoMap', () => {
  it('empareja filas cuyo título empieza por el código de un criterio o concreción', () => {
    expect(autoMap(rubric, pa.nodes, gradedLevels(pa.subject))).toEqual({ c1: ['pa-1bach/crit:3.2'], c2: ['pa-1bach/ind:1.1.3'] });
  });
  it('respeta lo ya emparejado a mano', () => {
    expect(autoMap(rubric, pa.nodes, gradedLevels(pa.subject), { c1: 'pa-1bach/crit:4.2', c3: ['pa-1bach/crit:5.4', 'pa-1bach/crit:5.3'] }))
      .toEqual({ c1: ['pa-1bach/crit:4.2'], c2: ['pa-1bach/ind:1.1.3'], c3: ['pa-1bach/crit:5.4', 'pa-1bach/crit:5.3'] });
  });
  it('funciona con los aspectos de Modelado (UD1.2)', () => {
    const r: RubricDef = { id: 'r', criteria: [{ id: 'x', title: 'UD1.2 Moldes sin oclusiones', levels: lv([0, 3]) }] };
    expect(autoMap(r, mm.nodes, gradedLevels(mm.subject))).toEqual({ x: ['mm-2joy/aspecto:UD1.2'] });
  });
});

describe('rubricValue y pointsValue', () => {
  it('convierte puntos de la fila a nota sobre 10', () => {
    expect(rubricValue(rubric.criteria[0], { criterionId: 'c1', levelId: 'l2', points: 2 })).toBe(5);
    expect(rubricValue(rubric.criteria[0], { criterionId: 'c1', levelId: 'l3' })).toBe(10); // sin puntos: los del nivel
    expect(rubricValue(rubric.criteria[0], { criterionId: 'c1' })).toBeNull();
  });
  it('convierte la nota global de Classroom', () => {
    expect(pointsValue(7, 10)).toBe(7);
    expect(pointsValue(33, 40)).toBe(8.25);
    expect(pointsValue(null, 10)).toBeNull();
    expect(pointsValue(5, null)).toBeNull();
  });
});

describe('classify (Classroom manda salvo que cambies la nota en la app)', () => {
  const g = (value: number | null, cls?: number | null): Grade => ({ id: 'x', studentId: 's', activityId: 'a', value, cls, updatedAt: 0 });
  it('aplica si no hay nota, si está vacía o si sigue igual que lo último traído de Classroom', () => {
    expect(classify(undefined, 7)).toBe('apply');
    expect(classify(g(null), 7)).toBe('apply');
    expect(classify(g(5, 5), 7)).toBe('apply');
  });
  it('conflicto si la nota se cambió en la app', () => {
    expect(classify(g(6, 5), 7)).toBe('conflict');
    expect(classify(g(6), 7)).toBe('conflict'); // puesta a mano antes de vincular
  });
  it('nada que hacer si ya coincide', () => {
    expect(classify(g(7, 5), 7)).toBe('same');
  });
});

describe('rubricItems', () => {
  const a: Activity = {
    id: 'a', subjectId: pa.subject.id, groupId: 'g', termId: 't1', instrumentId: 'proy', title: 'Cartel', weight: 1,
    nodeIds: ['pa-1bach/crit:3.2'], rubric, classroomRubricMap: { c1: 'pa-1bach/crit:3.2' }, updatedAt: 0,
  };
  const idx = indexGrades([{ id: 's|a', studentId: 's', activityId: 'a', value: 8, updatedAt: 0, rubric: [
    { criterionId: 'c1', levelId: 'l3', points: 4 }, { criterionId: 'c3', levelId: 'l1', points: 2 },
  ] }]);
  const sgOf = (id: string) => idx.get(id) ?? noGrades();
  it('convierte solo las filas emparejadas', () => {
    expect(rubricItems(a, ['s', 't'], sgOf)).toEqual([{ studentId: 's', nodeId: 'pa-1bach/crit:3.2', value: 10 }]);
  });
  it('sin rúbrica o sin emparejar, nada', () => {
    expect(rubricItems({ ...a, classroomRubricMap: undefined }, ['s'], sgOf)).toEqual([]);
  });
});

describe('rúbrica de Classroom con varias concreciones por fila', () => {
  it('una fila alimenta varias concreciones y una concreción hace la media de sus filas', () => {
    const a: Activity = {
      id: 'a', subjectId: 'pa-1bach', groupId: 'g', termId: 't1', instrumentId: 'proy', title: '', weight: 1, nodeIds: [], rubric,
      classroomRubricMap: { c1: ['n1', 'n2'], c2: 'n2' }, updatedAt: 0,
    };
    const sg = indexGrades([{ id: 's|a', studentId: 's', activityId: 'a', value: 7, updatedAt: 0,
      rubric: [{ criterionId: 'c1', levelId: 'l3', points: 4 }, { criterionId: 'c2', levelId: 'l1', points: 5 }] }]).get('s')!;
    expect(rubricItems(a, ['s'], () => sg)).toEqual([{ studentId: 's', nodeId: 'n1', value: 10 }, { studentId: 's', nodeId: 'n2', value: 7.5 }]);
  });
});

describe('concreciones evaluables', () => {
  it('son las concreciones y los criterios sin concreciones', () => {
    const ids = assessableNodes(pa.subject, pa.nodes, pa.links).map((n) => n.code);
    expect(ids).toContain('1.1.1');
    expect(ids).not.toContain('1.1');
    expect(ids).toContain('3.2');
    expect(ids.every((c) => !c.startsWith('CE'))).toBe(true);
  });
});
