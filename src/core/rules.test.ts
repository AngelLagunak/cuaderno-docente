import { describe, expect, it } from 'vitest';
import { absenceSummary, canImprove, obsGrade, outcome, scaleLabel, twoParts } from './rules';
import { indexGrades, noGrades } from './evaluation';
import type { Activity, Attendance, Grade, Student } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const PA = pa.subject;
const MM = mm.subject;
const C = { nodes: pa.nodes, links: pa.links };
const att = (studentId: string, date: string, status: Attendance['status']): Attendance =>
  ({ id: `${studentId}|${date}|1`, studentId, groupId: 'g', date, slot: '1', status, updatedAt: 0 });

describe('absenceSummary (pérdida de evaluación continua: solo aviso)', () => {
  const rows = [
    ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((d) => att('b', `2026-10-${d}`, 'P')),
    att('a', '2026-10-01', 'A'), att('a', '2026-10-02', 'A'), att('a', '2026-10-03', 'J'), att('a', '2026-10-04', 'R'),
  ];
  it('avisa al llegar al 20 % de faltas injustificadas sobre las sesiones pasadas', () => {
    const s = absenceSummary({ ...PA, config: { ...PA.config, annualSessions: 0 } }, rows, 'a');
    expect(s).toMatchObject({ A: 2, J: 1, R: 1, sessions: 10, base: 10, warn: true });
    expect(s.pct).toBe(20);
    expect(absenceSummary(PA, rows.filter((r) => r.date !== '2026-10-02' || r.studentId !== 'a'), 'a').warn).toBe(false);
  });
  it('usa las sesiones anuales previstas si están configuradas (Modelado: 54)', () => {
    const s = absenceSummary(MM, rows, 'a');
    expect(s.base).toBe(54);
    expect(s.pct).toBeCloseTo((2 / 54) * 100);
    expect(s.warn).toBe(false);
  });
  it('ignora las faltas borradas', () => {
    expect(absenceSummary(PA, rows.map((r) => (r.studentId === 'a' && r.status === 'A' ? { ...r, deleted: true } : r)), 'a').A).toBe(0);
  });
});

describe('twoParts', () => {
  it('extraordinaria de Proyectos Artísticos: 40 % proyectos + 60 % examen, entera', () => {
    expect(twoParts(PA, 6, 7, 40, 60, 5)).toEqual({ value: 6.6, rounded: 7, blocked: false });
  });
  it('sin un 5 en ambas partes no hace media: suspenso (4 como máximo)', () => {
    const r = twoParts(PA, 9, 4, 40, 60, 5);
    expect(r.value).toBeCloseTo(6);
    expect(r.blocked).toBe(true);
    expect(r.rounded).toBe(4);
    expect(twoParts(PA, 1, 2, 40, 60, 5).rounded).toBe(2);
  });
  it('en Modelado (1 decimal) el tope sin media es 4,9', () => {
    expect(twoParts(MM, 9, 4, 40, 60, 5).rounded).toBe(4.9);
  });
  it('falta una parte: sin nota', () => {
    expect(twoParts(PA, 6, null, 40, 60).value).toBeNull();
  });
});

describe('outcome', () => {
  let n = 0;
  const act = (p: Partial<Activity> = {}): Activity => ({
    id: `x${n++}`, subjectId: PA.id, groupId: 'g', termId: 't1', instrumentId: 'proy', title: '', weight: 1, nodeIds: ['pa-1bach/crit:3.2'], updatedAt: 0, ...p,
  });
  const a1 = act({ termId: 't1' });
  const a3 = act({ termId: 't3' });
  const sg = (v1: number, v3: number) => indexGrades([
    { id: `s|${a1.id}`, studentId: 's', activityId: a1.id, value: v1, updatedAt: 0 },
    { id: `s|${a3.id}`, studentId: 's', activityId: a3.id, value: v3, updatedAt: 0 },
  ]).get('s')!;
  const st = (p: Partial<Student> = {}): Student => ({ id: 's', groupId: 'g', firstName: 'A', lastName: 'B', updatedAt: 0, ...p });

  it('ordinaria por defecto', () => {
    const o = outcome(PA, [a1, a3], sg(6, 7), C, st());
    expect(o).toMatchObject({ official: 7, source: 'ordinaria', lec: null, extra: null });
  });
  it('pérdida de evaluación continua marcada: carpeta 50 % + examen global 50 %', () => {
    const o = outcome(PA, [a1, a3], sg(6, 7), C, st({ lec: true, lecGrades: { folder: 4, exam: 7 } }));
    expect(o.source).toBe('pérdida de evaluación continua');
    expect(o.official).toBe(6); // 5,5 → 6
    expect(outcome(PA, [a1, a3], sg(6, 7), C, st({ lec: true })).official).toBeNull(); // falta la nota de la vía alternativa
  });
  it('Modelado: pérdida de evaluación continua 40 % dossier + 60 % prueba', () => {
    const o = outcome(MM, [], noGrades(), { nodes: mm.nodes, links: [] }, st({ lec: true, lecGrades: { folder: 5, exam: 8 } }));
    expect(o.official).toBe(6.8);
  });
  it('extraordinaria solo si suspende la ordinaria', () => {
    const extra = { projects: 6, exam: 7 };
    expect(outcome(PA, [a1, a3], sg(3, 4), C, st({ extra })).official).toBe(7);
    expect(outcome(PA, [a1, a3], sg(3, 4), C, st({ extra })).source).toBe('extraordinaria');
    expect(outcome(PA, [a1, a3], sg(6, 7), C, st({ extra })).source).toBe('ordinaria');
    expect(outcome(PA, [a1, a3], sg(3, 4), C, st({ extra: { projects: 6, exam: null } })).source).toBe('ordinaria');
  });
});

describe('scaleLabel (Modelado y Maquetismo)', () => {
  it('SS < 5 ≤ AP < 7 ≤ NT < 9 ≤ SB', () => {
    expect([4.9, 5, 6.9, 7, 8.9, 9, 10].map((v) => scaleLabel(MM, v))).toEqual(['SS', 'AP', 'AP', 'NT', 'NT', 'SB', 'SB']);
    expect(scaleLabel(MM, null)).toBe('');
    expect(scaleLabel(PA, 8)).toBe('');
  });
});

describe('canImprove (Proyectos Artísticos: fuera de plazo no mejorable)', () => {
  const g = (late: boolean): Grade => ({ id: 's|a', studentId: 's', activityId: 'a', value: 6, late, updatedAt: 0 });
  it('una entrega tardía no se puede recuperar en PA, sí en Modelado', () => {
    expect(canImprove(PA, g(true))).toBe(false);
    expect(canImprove(PA, g(false))).toBe(true);
    expect(canImprove(PA, undefined)).toBe(true);
    expect(canImprove(MM, g(true))).toBe(true);
  });
});

describe('obsGrade', () => {
  const at = (date: string, obs: string[], studentId = 's1'): Attendance => ({ id: `${studentId}|${date}|1`, studentId, groupId: 'g', date, slot: '1', status: 'P', obs, updatedAt: 0 });
  const rows = [at('2026-10-05', ['part']), at('2026-10-07', ['part', 'grupo']), at('2026-10-14', ['mat']), at('2026-12-20', ['comp', 'comp']), at('2026-10-05', ['comp'], 's2')];
  it('base 6 ± 0,5 por marca, por fechas y por alumno', () => {
    expect(obsGrade(pa.subject, rows, 's1', '2026-09-01', '2026-12-04')).toEqual({ value: 7, pos: 3, neg: 1, counts: { part: 2, grupo: 1, mat: 1 } });
    expect(obsGrade(pa.subject, rows, 's1').value).toBe(6); // + 3 − 3
    expect(obsGrade(pa.subject, rows, 's2').value).toBe(5.5);
    expect(obsGrade(pa.subject, [], 's3').value).toBe(6);
  });
  it('aspectos, base y paso de la materia; entre 0 y 10', () => {
    const s = { ...pa.subject, config: { ...pa.subject.config, observations: [{ id: 'x', label: 'X', sign: -1 as const }], obsBase: 1, obsStep: 2 } };
    expect(obsGrade(s, [at('2026-10-05', ['x', 'part'])], 's1')).toMatchObject({ value: 0, neg: 1, pos: 0 });
  });
});
