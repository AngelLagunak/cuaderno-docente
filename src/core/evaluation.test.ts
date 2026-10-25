import { describe, expect, it } from 'vitest';
import { activityBase, activityValue, effectiveValue, finalResult, indexGrades, itemGrades, noGrades, profile, round, termResult, wmean } from './evaluation';
import type { StudentGrades } from './evaluation';
import type { Activity, Grade, Subject } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const PA = pa.subject;
/** Proyectos Artísticos con la nota por instrumentos (modo antiguo) para probar ese cálculo. */
const PAI: Subject = { ...PA, config: { ...PA.config, gradeLevel: null } };
const C = { nodes: pa.nodes, links: pa.links };
const CM = { nodes: mm.nodes, links: [] };
const crit = (c: string) => `pa-1bach/crit:${c}`;
const ind = (c: string) => `pa-1bach/ind:${c}`;
const ce = (n: number) => `pa-1bach/ce:CE.PA.${n}`;

let n = 0;
const act = (p: Partial<Activity> = {}): Activity => ({
  id: `a${n++}`, subjectId: PA.id, groupId: 'g', termId: 't1', instrumentId: 'proy',
  title: '', weight: 1, nodeIds: [], updatedAt: 0, ...p,
});
/** Notas de un alumno: globales [actividad, valor, tardía?] y por criterio [actividad, nodo, valor]. */
const grades = (rows: [Activity, number | null, boolean?][], items: [Activity, string, number | null][] = []): StudentGrades =>
  indexGrades([
    ...rows.map(([a, value, late]): Grade => ({ id: `s|${a.id}`, studentId: 's', activityId: a.id, value, late, updatedAt: 0 })),
    ...items.map(([a, nodeId, value]): Grade => ({ id: `s|${a.id}|${nodeId}`, studentId: 's', activityId: a.id, nodeId, value, updatedAt: 0 })),
  ]).get('s') ?? noGrades();
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
    const g = grades([[a, 8, true]]).byActivity.get(a.id);
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
    const r = termResult(PAI, [p1, p2, c1], grades([[p1, 9], [p2, 6], [c1, 5]]), 't1', C);
    expect(r.byInstrument.find((i) => i.id === 'proy')!.value).toBe(8);
    expect(r.value).toBeCloseTo((8 * 45 + 5 * 25) / 70);
    expect(r.coverage).toBeCloseTo(70 / 100);
  });
  it('marca instrumentos bajo el aprobado con minPerInstrument', () => {
    const p = act({ instrumentId: 'proy' });
    const e = act({ instrumentId: 'exam' });
    const r = termResult(PAI, [p, e], grades([[p, 9], [e, 3]]), 't1', C);
    expect(r.belowMin).toEqual(['Exámenes teórico-prácticos']);
    expect(termResult(withCfg(PAI, { minPerInstrument: false }), [p, e], grades([[p, 9], [e, 3]]), 't1', C).belowMin).toEqual([]);
  });
  it('solo usa las actividades del trimestre pedido', () => {
    const a1 = act({ termId: 't1' });
    const a2 = act({ termId: 't2' });
    expect(termResult(PAI, [a1, a2], grades([[a1, 4], [a2, 10]]), 't1', C).value).toBe(4);
  });
});

describe('finalResult (30/30/40)', () => {
  const t1 = act({ termId: 't1' });
  const t2 = act({ termId: 't2' });
  const t3 = act({ termId: 't3' });
  it('pondera trimestres y redondea a entero', () => {
    const f = finalResult(PAI, [t1, t2, t3], grades([[t1, 5], [t2, 6], [t3, 8]]), C);
    expect(f.value).toBeCloseTo(6.5);
    expect(f.rounded).toBe(7);
    expect(f.coverage).toBe(1);
  });
  it('ignora el trimestre vacío y marca la cobertura', () => {
    const f = finalResult(PAI, [t1, t2, t3], grades([[t1, 5], [t2, 7]]), C);
    expect(f.value).toBe(6);
    expect(f.coverage).toBeCloseTo(0.6);
  });
  it('la nota final redondeada nunca baja de 1 (SIGAD)', () => {
    const f = finalResult(PAI, [t1], grades([[t1, 0.3]]), C);
    expect(f.value).toBeCloseTo(0.3);
    expect(f.rounded).toBe(1);
    expect(finalResult(withCfg(PAI, { minGrade: 0 }), [t1], grades([[t1, 0.3]]), C).rounded).toBe(0);
    expect(finalResult(mm.subject, [{ ...t1, subjectId: mm.subject.id, instrumentId: 'prac' }], grades([[t1, 0]]), CM).rounded).toBe(1);
  });
  it('sin notas no hay nota final', () => {
    expect(finalResult(PAI, [t1], grades([]), C).rounded).toBeNull();
  });
});

describe('profile (PA)', () => {
  const prof = (acts: Activity[], g: StudentGrades, termId?: string) =>
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

  it('dentro de un criterio, cada instrumento que lo mide pesa según su porcentaje', () => {
    const p1 = act({ instrumentId: 'proy', weight: 3, nodeIds: [crit('3.2')] });
    const p2 = act({ instrumentId: 'proy', weight: 1, nodeIds: [crit('3.2')] });
    const p3 = act({ instrumentId: 'proy', weight: 5, nodeIds: [crit('4.2')] }); // otro criterio: no influye en 3.2
    const p4 = act({ instrumentId: 'proy', weight: 5, nodeIds: [crit('3.2')] }); // sin calificar: no cuenta
    const e = act({ instrumentId: 'exam', nodeIds: [crit('3.2')] });
    // Proyectos en 3.2 = (8·3 + 4·1) / 4 = 7; examen = 2 → (7·45 + 2·15) / 60 = 5,75
    const r = prof([p1, p2, p3, p4, e], grades([[p1, 8], [p2, 4], [p3, 10], [e, 2]])).nodes.get(crit('3.2'));
    expect(r).toBeCloseTo(5.75);
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

describe('notas por criterio', () => {
  it('indexGrades separa la nota global de las notas por criterio e ignora las borradas', () => {
    const a = act({ nodeIds: [ind('1.1.1')] });
    const idx = indexGrades([
      { id: `s|${a.id}`, studentId: 's', activityId: a.id, value: 6, updatedAt: 0 },
      { id: `s|${a.id}|x`, studentId: 's', activityId: a.id, nodeId: ind('1.1.1'), value: 9, updatedAt: 0 },
      { id: `t|${a.id}`, studentId: 't', activityId: a.id, value: 3, updatedAt: 0, deleted: true },
    ]);
    expect(idx.get('s')!.byActivity.get(a.id)!.value).toBe(6);
    expect(idx.get('s')!.byItem.get(a.id)!.get(ind('1.1.1'))!.value).toBe(9);
    expect(idx.has('t')).toBe(false);
  });

  it('la nota de la actividad es la media de sus criterios y se impone a la global', () => {
    const a = act({ nodeIds: [ind('1.1.1'), ind('1.1.2'), ind('1.1.3')] });
    const sg = grades([[a, 2]], [[a, ind('1.1.1'), 6], [a, ind('1.1.2'), 9], [a, ind('1.1.3'), null]]);
    expect(itemGrades(a, sg).length).toBe(2);
    expect(activityBase(a, sg)).toBe(7.5);
    expect(activityBase(a, grades([[a, 2]]))).toBe(2);
  });

  it('ignora notas de criterios que la actividad ya no evalúa', () => {
    const a = act({ nodeIds: [ind('1.1.1')] });
    const sg = grades([[a, 5]], [[a, ind('1.1.2'), 10]]);
    expect(activityBase(a, sg)).toBe(5);
  });

  it('aplica la entrega tardía (marcada en la nota global) a la media de criterios', () => {
    const a = act({ subjectId: mm.subject.id, instrumentId: 'prac', nodeIds: ['mm-2joy/aspecto:UD1.1', 'mm-2joy/aspecto:UD1.2'] });
    const sg = grades([[a, null, true]], [[a, 'mm-2joy/aspecto:UD1.1', 10], [a, 'mm-2joy/aspecto:UD1.2', 6]]);
    expect(activityValue(a, sg, mm.subject)).toBeCloseTo(5.6);
    const p = profile(mm.subject, mm.nodes, [], [a], sg);
    expect(p.nodes.get('mm-2joy/aspecto:UD1.1')).toBeCloseTo(7);
    expect(p.nodes.get('mm-2joy/aspecto:UD1.2')).toBeCloseTo(4.2);
  });

  it('la nota oficial usa la media de criterios', () => {
    const p = act({ instrumentId: 'proy', nodeIds: [crit('3.2'), crit('4.2')] });
    const e = act({ instrumentId: 'exam' });
    const r = termResult(PAI, [p, e], grades([[e, 4]], [[p, crit('3.2'), 10], [p, crit('4.2'), 6]]), 't1', C);
    expect(r.byInstrument.find((i) => i.id === 'proy')!.value).toBe(8);
    expect(r.value).toBeCloseTo((8 * 45 + 4 * 15) / 60);
  });

  it('en el perfil cada criterio recibe su propia nota, no la media de la actividad', () => {
    const a = act({ nodeIds: [crit('3.2'), crit('4.2'), crit('5.2')] });
    const pr = profile(PA, pa.nodes, pa.links, [a], grades([], [[a, crit('3.2'), 9], [a, crit('4.2'), 5]]));
    expect(pr.nodes.get(crit('3.2'))).toBe(9);
    expect(pr.nodes.get(crit('4.2'))).toBe(5);
    expect(pr.nodes.get(crit('5.2'))).toBeNull(); // sin nota por criterio: no evaluado
  });

  it('no cuenta dos veces criterio e indicador calificados en la misma actividad', () => {
    const a = act({ nodeIds: [crit('1.1'), ind('1.1.1'), ind('1.1.2')] });
    const pr = profile(PA, pa.nodes, pa.links, [a], grades([], [[a, crit('1.1'), 2], [a, ind('1.1.1'), 6], [a, ind('1.1.2'), 8]]));
    expect(pr.nodes.get(crit('1.1'))).toBe(7);
  });
});

describe('nota por competencias específicas (Proyectos Artísticos, normativa LOMLOE Aragón)', () => {
  it('la materia viene configurada para calcular por competencias específicas', () => {
    expect(PA.config.gradeLevel).toBe('ce');
    expect(mm.subject.config.gradeLevel).toBeNull();
  });

  it('cada evaluación es la media de las CE evaluadas; cada CE, la media de sus criterios', () => {
    // CE.PA.1: 1.1 (vía concreciones 1.1.1 = 6 y 1.1.2 = 8 → 7) y 1.2 (5) → 6. CE.PA.3: 3.2 = 9 → 9.
    const a = act({ nodeIds: [ind('1.1.1'), ind('1.1.2'), crit('1.2'), crit('3.2')] });
    const sg = grades([], [[a, ind('1.1.1'), 6], [a, ind('1.1.2'), 8], [a, crit('1.2'), 5], [a, crit('3.2'), 9]]);
    const r = termResult(PA, [a], sg, 't1', C);
    expect(r.parts.map((p) => p.name)).toEqual(['CE.PA.1', 'CE.PA.2', 'CE.PA.3', 'CE.PA.4', 'CE.PA.5']);
    expect(r.parts.map((p) => p.value)).toEqual([6, null, 9, null, null]);
    expect(r.value).toBe(7.5); // (6 + 9) / 2: lo no evaluado no cuenta
    expect(r.coverage).toBeCloseTo(2 / 5);
    expect(r.belowMin).toEqual([]);
  });

  it('CE.PA.3 con 4 criterios pesa lo mismo que CE.PA.2 con 2', () => {
    const a = act({ nodeIds: [crit('2.1'), crit('2.2'), crit('3.1'), crit('3.2'), crit('3.3'), crit('3.4')] });
    const sg = grades([], [[a, crit('2.1'), 4], [a, crit('2.2'), 6], [a, crit('3.1'), 10], [a, crit('3.2'), 10], [a, crit('3.3'), 10], [a, crit('3.4'), 10]]);
    // CE.PA.2 = 5, CE.PA.3 = 10 → 7,5 (con media de los 6 criterios saldría 8,33)
    expect(termResult(PA, [a], sg, 't1', C).value).toBe(7.5);
  });

  it('los instrumentos ponderan las medidas de cada criterio (45/25/15/15)', () => {
    const p = act({ instrumentId: 'proy', nodeIds: [crit('3.2')] });
    const c = act({ instrumentId: 'cuad', nodeIds: [crit('3.2')] });
    const e = act({ instrumentId: 'exam', nodeIds: [crit('4.2')] });
    // 3.2 = (8·45 + 4·25) / 70 = 6,571…; 4.2 = 7 (solo examen) → CE.PA.3 = 6,571…, CE.PA.4 = 7
    const r = termResult(PA, [p, c, e], grades([[p, 8], [c, 4], [e, 7]]), 't1', C);
    expect(r.parts[2].value).toBeCloseTo(460 / 70);
    expect(r.parts[3].value).toBe(7);
    expect(r.value).toBeCloseTo((460 / 70 + 7) / 2);
  });

  it('avisa de las CE por debajo de 5', () => {
    const a = act({ nodeIds: [crit('1.2'), crit('3.2')] });
    const r = termResult(PA, [a], grades([], [[a, crit('1.2'), 3], [a, crit('3.2'), 9]]), 't1', C);
    expect(r.belowMin).toEqual(['CE.PA.1']);
  });

  it('final ordinaria: 30/30/40 de las evaluaciones, entera y mínimo 1', () => {
    const a1 = act({ termId: 't1', nodeIds: [crit('3.2')] });
    const a2 = act({ termId: 't2', nodeIds: [crit('3.2')] });
    const a3 = act({ termId: 't3', nodeIds: [crit('4.2')] });
    const f = finalResult(PA, [a1, a2, a3], grades([[a1, 5], [a2, 6], [a3, 8]]), C);
    expect(f.terms.map((t) => t.result.value)).toEqual([5, 6, 8]);
    expect(f.value).toBeCloseTo(6.5);
    expect(f.rounded).toBe(7);
  });

  it('una actividad sin criterios no cuenta en la nota por competencias', () => {
    const a = act({ nodeIds: [crit('3.2')] });
    const b = act({ instrumentId: 'exam', nodeIds: [] });
    expect(termResult(PA, [a, b], grades([[a, 8], [b, 2]]), 't1', C).value).toBe(8);
  });
});

describe('actividades sin calificación', () => {
  it('no cuentan en la nota de la evaluación ni en el perfil', () => {
    const a = act({ nodeIds: [crit('1.1')] }), f = act({ nodeIds: [crit('1.1')], formative: true });
    const g = grades([[a, 6], [f, 10]]);
    expect(termResult(PAI, [a, f], g, 't1', C).value).toBe(6);
    expect(profile(PA, C.nodes, C.links, [a, f], g).nodes.get(crit('1.1'))).toBe(6);
  });
});
