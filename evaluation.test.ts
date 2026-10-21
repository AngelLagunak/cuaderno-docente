import { describe, expect, it } from 'vitest';
import { effectiveValue, finalResult, profile, round, termResult, wmean } from './evaluation';
import type { Activity, Grade, Subject } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const PA = pa.subject;
const crit = (c: string) => `pa-1bach/crit:${c}`;
const ind = (c: string) => `pa-1bach/ind:${c}`;
const ce = (n: number) => `pa-1bach/ce:CE.PA.${n}`;

let n = 0;
const act = (p: Partial<Activity> = {}): Activity => ({
  id: `a${n++}`, subjectId: PA.id, groupId: 'g', termId: 't1', instrumentId: 'proy',
  title: '', weight: 1, nodeIds: [], updatedAt: 0, ...p,
});
/** Notas de un alumno: [actividad, valor, tardía?]. */
const grades = (rows: [Activity, number | null, boolean?][]) =>
  new Map<string, Grade>(rows.map(([a, value, late]) => [a.id, { id: `s|${a.id}`, studentId: 's', activityId: a.id, value, late, updatedAt: 0 }]));
const withCfg = (s: Subject, c: Partial<Subject['config']>): Subject => ({ ...s, config: { ...s.config, ...c } });

describe('wmean y round', () => {
  it('ignora nulos y pesos 0', () => {
    expect(wmean([[8, 1], [null, 5], [2, 0], [6, 3]])).toBe(6.5);
    expect(wmean([[null, 1]])).toBeNull();
    expect(wmean([])).toBeNull();
  });
  it('redondea a 0, 1 y 2 decimales', () => {
    expect(round(4.5, 0)).toBe(5);
    expect(round(4.49, 0)).toBe(4);
    expect(round(6.75, 1)).toBe(6.8);
    expect(round(7.375, 2)).toBe(7.38);
    expect(round(null, 2)).toBeNull();
  });
});

describe('effectiveValue', () => {
  it('aplica la penalización por entrega tardía de MM (30 %)', () => {
    const a = act();
    const g = grades([[a, 8, true]]).get(a.id);
    expect(effectiveValue(g, mm.subject)).toBeCloseTo(5.6);
    expect(effectiveValue({ ...g!, late: false }, mm.subject)).toBe(8);
    expect(effectiveValue(undefined, mm.subject)).toBeNull();
  });
});

describe('termResult (PA 45/25/15/15)', () => {
  it('pondera instrumentos e ignora los que no tienen datos', () => {
    const p1 = act({ instrumentId: 'proy', weight: 2 });
    const p2 = act({ instrumentId: 'proy', weight: 1 });
    const c1 = act({ instrumentId: 'cuad' });
    const r = termResult(PA, [p1, p2, c1], grades([[p1, 9], [p2, 6], [c1, 5]]), 't1');
    expect(r.byInstrument.find((i) => i.id === 'proy')!.value).toBe(8);
    expect(r.value).toBeCloseTo((8 * 45 + 5 * 25) / 70);
    expect(r.coverage).toBeCloseTo(70 / 100);
  });
  it('marca instrumentos bajo el aprobado con minPerInstrument', () => {
    const p = act({ instrumentId: 'proy' });
    const e = act({ instrumentId: 'exam' });
    const r = termResult(PA, [p, e], grades([[p, 9], [e, 3]]), 't1');
    expect(r.belowMin).toEqual(['Exámenes teórico-prácticos']);
    expect(termResult(withCfg(PA, { minPerInstrument: false }), [p, e], grades([[p, 9], [e, 3]]), 't1').belowMin).toEqual([]);
  });
  it('solo usa las actividades del trimestre pedido', () => {
    const a1 = act({ termId: 't1' });
    const a2 = act({ termId: 't2' });
    expect(termResult(PA, [a1, a2], grades([[a1, 4], [a2, 10]]), 't1').value).toBe(4);
  });
});

describe('finalResult (30/30/40)', () => {
  const t1 = act({ termId: 't1' });
  const t2 = act({ termId: 't2' });
  const t3 = act({ termId: 't3' });
  it('pondera trimestres y redondea a entero', () => {
    const f = finalResult(PA, [t1, t2, t3], grades([[t1, 5], [t2, 6], [t3, 8]]));
    expect(f.value).toBeCloseTo(6.5);
    expect(f.rounded).toBe(7);
    expect(f.coverage).toBe(1);
  });
  it('ignora el trimestre vacío y marca la cobertura', () => {
    const f = finalResult(PA, [t1, t2, t3], grades([[t1, 5], [t2, 7]]));
    expect(f.value).toBe(6);
    expect(f.coverage).toBeCloseTo(0.6);
  });
  it('la nota final redondeada nunca baja de 1 (SIGAD)', () => {
    const f = finalResult(PA, [t1], grades([[t1, 0.3]]));
    expect(f.value).toBeCloseTo(0.3);
    expect(f.rounded).toBe(1);
    expect(finalResult(withCfg(PA, { minGrade: 0 }), [t1], grades([[t1, 0.3]])).rounded).toBe(0);
    expect(finalResult(mm.subject, [{ ...t1, subjectId: mm.subject.id, instrumentId: 'prac' }], grades([[t1, 0]])).rounded).toBe(1);
  });
  it('sin notas no hay nota final', () => {
    expect(finalResult(PA, [t1], grades([])).rounded).toBeNull();
  });
});

describe('profile (PA)', () => {
  const prof = (acts: Activity[], g: Map<string, Grade>, termId?: string) =>
    profile(PA, pa.nodes, pa.links, acts, g, termId);

  it('reproduce el ejemplo del documento de arquitectura (§7.2)', () => {
    // Criterios sin indicadores en el catálogo (3.4 sí los tiene): se califican sus indicadores.
    const a = [
      act({ nodeIds: [ind('1.1.1')] }), act({ nodeIds: [ind('1.1.1')] }), // 1.1: 7 y 8
      act({ nodeIds: [ind('1.2.1')] }), // 1.2: 6
      act({ nodeIds: [ind('3.1.1')] }), // 3.1: 8
      act({ nodeIds: [crit('3.3')] }), // 3.3: 6
      act({ nodeIds: [ind('3.4.1')] }), // 3.4: 10
    ];
    const p = prof(a, grades([[a[0], 7], [a[1], 8], [a[2], 6], [a[3], 8], [a[4], 6], [a[5], 10]]));
    expect(p.nodes.get(crit('1.1'))).toBe(7.5);
    expect(p.nodes.get(ce(1))).toBe(6.75);
    expect(p.nodes.get(ce(3))).toBe(8);
    expect(p.nodes.get(ce(2))).toBeNull();
    expect(p.nodes.get(ce(5))).toBeNull();
    expect(p.nodes.get(crit('5.4'))).toBeNull();
  });

  it('agrupa descriptores por competencia clave', () => {
    const a = act({ nodeIds: [crit('3.2')] });
    const p = prof([a], grades([[a, 8]]));
    // CE.PA.3 vincula CCL1 y CCL3; CCL2 no tiene datos y se ignora.
    expect(p.nodes.get('pa-1bach/desc:CCL1')).toBe(8);
    expect(p.groups.get('CCL')).toBe(8);
    expect(p.groups.get('STEM')).toBeDefined();
  });

  it('no cuenta dos veces una nota que evalúa criterio e indicador a la vez', () => {
    const a = act({ nodeIds: [crit('1.1'), ind('1.1.1')] });
    const b = act({ nodeIds: [ind('1.1.2')] });
    const p = prof([a, b], grades([[a, 4], [b, 10]]));
    expect(p.nodes.get(ind('1.1.1'))).toBe(4);
    expect(p.nodes.get(crit('1.1'))).toBe(7); // (4 + 10) / 2, no (4 + 4 + 10) / 3
  });

  it('una nota directa al criterio cuenta como un indicador más si viene de otra actividad', () => {
    const a = act({ nodeIds: [crit('1.1')] });
    const b = act({ nodeIds: [ind('1.1.1')] });
    expect(prof([a, b], grades([[a, 4], [b, 10]])).nodes.get(crit('1.1'))).toBe(7);
  });

  it('respeta el peso del instrumento al combinar actividades', () => {
    const p = act({ instrumentId: 'proy', nodeIds: [crit('3.2')] });
    const e = act({ instrumentId: 'exam', nodeIds: [crit('3.2')] });
    // Proyectos 45 %, Exámenes 15 %: (9·45 + 3·15) / 60 = 7,5 (no 6).
    expect(prof([p, e], grades([[p, 9], [e, 3]])).nodes.get(crit('3.2'))).toBe(7.5);
  });

  it('reparte el peso del instrumento entre sus actividades calificadas', () => {
    const p1 = act({ instrumentId: 'proy', weight: 3, nodeIds: [crit('3.2')] });
    const p2 = act({ instrumentId: 'proy', weight: 1, nodeIds: [crit('4.2')] });
    const p3 = act({ instrumentId: 'proy', weight: 5 }); // sin calificar: no cuenta
    const e = act({ instrumentId: 'exam', nodeIds: [crit('3.2')] });
    // p1 = 45·3/4 = 33,75; e = 15 → (8·33,75 + 2·15) / 48,75
    const r = prof([p1, p2, p3, e], grades([[p1, 8], [p2, 4], [e, 2]])).nodes.get(crit('3.2'));
    expect(r).toBeCloseTo((8 * 33.75 + 2 * 15) / 48.75);
  });

  it('pondera trimestres en el perfil acumulado y filtra por trimestre', () => {
    const a1 = act({ termId: 't1', nodeIds: [crit('3.2')] });
    const a3 = act({ termId: 't3', nodeIds: [crit('3.2')] });
    const g = grades([[a1, 4], [a3, 9]]);
    expect(prof([a1, a3], g).nodes.get(crit('3.2'))).toBeCloseTo((4 * 30 + 9 * 40) / 70);
    expect(prof([a1, a3], g, 't3').nodes.get(crit('3.2'))).toBe(9);
  });

  it('aplica la penalización por entrega tardía', () => {
    const a = act({ subjectId: mm.subject.id, instrumentId: 'prac', nodeIds: ['mm-2joy/aspecto:UD1.1'] });
    const p = profile(mm.subject, mm.nodes, [], [a], grades([[a, 10, true]]));
    expect(p.nodes.get('mm-2joy/aspecto:UD1.1')).toBeCloseTo(7);
  });
});
