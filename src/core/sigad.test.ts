import { describe, expect, it } from 'vitest';
import { planSigad, sigadValue } from './sigad';
import type { Outcome } from './rules';
import type { Student } from './model';
import { pa } from '../catalogs/pa';

const st = (id: string, lastName: string, firstName: string): Student => ({ id, groupId: 'g', firstName, lastName, updatedAt: 0 });
const students = [st('s1', 'Prueba García', 'Ana'), st('s2', 'Suspenso Íñiguez', 'Luis Ángel'), st('s3', 'de la Fuente Martín', 'María José')];

describe('planSigad', () => {
  it('empareja por apellidos y nombre sin tildes ni mayúsculas', () => {
    const p = planSigad([
      ['Apellido1', 'Apellido2', 'Nombre', 'Calificación'],
      ['PRUEBA', 'GARCIA', 'ANA', null],
      ['De la Fuente', 'Martín', 'Maria Jose', null],
      ['Nuevo', 'Alumno', 'X', null],
      [null, null, null, null],
    ], students)!;
    expect(p.gradeCol).toBe(3);
    expect(p.rows).toEqual([
      { row: 1, label: 'PRUEBA GARCIA, ANA', studentId: 's1' },
      { row: 2, label: 'De la Fuente Martín, Maria Jose', studentId: 's3' },
      { row: 3, label: 'Nuevo Alumno, X', studentId: null },
    ]);
  });
  it('no es un listado de SIGAD sin columna de calificación', () => {
    expect(planSigad([['Apellidos', 'Nombre']], students)).toBeNull();
  });
});

describe('sigadValue', () => {
  const o = (term: number | null, ord: number | null, extra: number | null, lec: number | null = null) => ({
    ordinary: { value: ord, rounded: ord, terms: [{ id: 't1', name: '', weight: 30, result: { value: term } }], coverage: 1, belowMin: false },
    lec: lec == null ? null : { value: lec, rounded: lec, blocked: false },
    extra: extra == null ? null : { value: extra, rounded: extra, blocked: false },
  }) as unknown as Outcome;
  it('evaluación redondeada como nota oficial (entera y mínimo 1 en Proyectos Artísticos)', () => {
    expect(sigadValue(pa.subject, o(6.5, null, null), { kind: 'term', termId: 't1' })).toBe(7);
    expect(sigadValue(pa.subject, o(0.2, null, null), { kind: 'term', termId: 't1' })).toBe(1);
    expect(sigadValue(pa.subject, o(null, null, null), { kind: 'term', termId: 't1' })).toBeNull();
  });
  it('ordinaria (o vía alternativa) y extraordinaria', () => {
    expect(sigadValue(pa.subject, o(5, 6, null), { kind: 'ordinary' })).toBe(6);
    expect(sigadValue(pa.subject, o(5, 6, null, 4), { kind: 'ordinary' })).toBe(4);
    expect(sigadValue(pa.subject, o(3, 3, 5), { kind: 'extra' })).toBe(5);
    expect(sigadValue(pa.subject, o(7, 7, null), { kind: 'extra' })).toBeNull();
  });
});
