import { describe, expect, it } from 'vitest';
import { cellValue, importChanges, parseBackup, parseCsv, planImport, restorePlan, shouldPurge } from './io';
import type { Activity, Grade, Student } from './model';
import { pa } from '../catalogs/pa';

const st = (id: string, lastName: string, firstName: string, extra: Partial<Student> = {}): Student =>
  ({ id, groupId: 'g', firstName, lastName, updatedAt: 0, ...extra });
const students = [st('s1', 'Prueba García', 'Ana', { nia: '1234', email: 'ana@educa.es' }), st('s2', 'Suspenso', 'Luis')];
const act = (id: string, title: string, termId = 't1'): Activity =>
  ({ id, subjectId: pa.subject.id, groupId: 'g', termId, instrumentId: 'proy', title, weight: 1, nodeIds: [], updatedAt: 0 });
const acts = [act('a1', 'Cartel'), act('a2', 'Fanzine', 't1'), act('a3', 'Fanzine', 't2'), act('a4', 'Examen UD1')];

describe('parseCsv', () => {
  it('detecta el separador y respeta comillas, BOM y saltos de línea', () => {
    expect(parseCsv('﻿"Apellidos";"Nombre";"Nota"\r\n"Prueba; García";"Ana";"7,5"\r\n\r\n')).toEqual([
      ['Apellidos', 'Nombre', 'Nota'], ['Prueba; García', 'Ana', '7,5'],
    ]);
    expect(parseCsv('a,b\n"x ""y""",2')).toEqual([['a', 'b'], ['x "y"', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('cellValue', () => {
  it('acepta números y coma decimal; vacía = null; fuera de rango = no válida', () => {
    expect([7, '7,5', ' 8.25 ', '', null, 'NP', 11, -1].map(cellValue)).toEqual([7, 7.5, 8.25, null, null, undefined, undefined, undefined]);
  });
});

describe('planImport', () => {
  it('reconoce el formato que exporta la app (apellidos, nombre, «Título (evaluación)»)', () => {
    const t = [
      ['Apellidos', 'Nombre', 'Cartel (1.ª evaluación)', 'Fanzine (2.ª evaluación)', '1.ª evaluación', 'Ordinaria', 'Oficial'],
      ['Prueba García', 'Ana', '7,5', '6', '7', '7', '7'],
      ['Suspenso', 'Luis', '', '4', '', '', ''],
      ['Desconocido', 'X', '5', '', '', '', ''],
    ];
    const p = planImport(t, students, acts, pa.subject.terms);
    expect(p.by).toBe('name');
    expect(p.columns.map((c) => c.activityId)).toEqual([null, null, 'a1', 'a3', null, null, null]);
    expect(p.columns.filter((c) => !c.skip).map((c) => c.header)).toEqual(['Cartel (1.ª evaluación)', 'Fanzine (2.ª evaluación)']);
    expect(p.rows.map((r) => r.studentId)).toEqual(['s1', 's2', null]);
    const { changes, invalid } = importChanges(p, t, (s, a) => (s === 's2' && a === 'a3' ? ({ value: 4 } as Grade) : undefined));
    expect(invalid).toBe(0);
    expect(changes).toEqual([
      { studentId: 's1', activityId: 'a1', value: 7.5, current: null },
      { studentId: 's1', activityId: 'a3', value: 6, current: null },
    ]);
  });
  it('usa NIA o correo si están, salta filas de título y deja sin emparejar títulos ambiguos', () => {
    const t = [
      ['Notas 1.º BA', null, null, null],
      ['NIA', 'Correo', 'fanzine', 'EXAMEN ud1'],
      [1234, '', 'NP', 9],
      ['', 'ANA@educa.es', 3, ''],
    ];
    const p = planImport(t, students, acts, pa.subject.terms);
    expect(p.headerRow).toBe(1);
    expect(p.by).toBe('nia');
    expect(p.columns.map((c) => c.activityId)).toEqual([null, null, null, 'a4']); // «Fanzine» está en dos evaluaciones
    expect(p.rows.map((r) => r.studentId)).toEqual(['s1', 's1']);
    const r = importChanges({ ...p, columns: p.columns.map((c) => (c.index === 2 ? { ...c, activityId: 'a2' } : c)) }, t, () => undefined);
    expect(r.invalid).toBe(1); // «NP»
    expect(r.changes.map((c) => [c.activityId, c.value])).toEqual([['a4', 9], ['a2', 3]]);
  });
});

describe('shouldPurge', () => {
  const day = 24 * 3600 * 1000, now = 1000 * day;
  it('elimina borrados de hace más de 60 días ya enviados al servidor', () => {
    expect(shouldPurge({ deleted: true, updatedAt: now - 61 * day }, now, now)).toBe(true);
    expect(shouldPurge({ deleted: true, updatedAt: now - 59 * day }, now, now)).toBe(false);
    expect(shouldPurge({ updatedAt: now - 99 * day }, now, now)).toBe(false);
    expect(shouldPurge({ deleted: true, updatedAt: now - 61 * day }, now, now - 62 * day)).toBe(false); // aún sin enviar
  });
});

describe('copias de seguridad', () => {
  const r = (id: string, updatedAt: number, deleted?: boolean) => ({ id, updatedAt, ...(deleted ? { deleted } : {}) });
  it('lee la exportación de la app y el db.json de Drive', () => {
    expect(parseBackup('{"app":"cuaderno-docente","exportedAt":"2026-10-21","tables":{"grades":[{"id":"a","updatedAt":1}]}}')).toEqual({ exportedAt: '2026-10-21', tables: { grades: [r('a', 1)] } });
    expect(parseBackup('{"version":3,"tables":{"grades":{"a":{"id":"a","updatedAt":1,"_v":3}}}}').tables.grades).toEqual([r('a', 1)]);
    expect(() => parseBackup('hola')).toThrow(/no es una copia/);
    expect(() => parseBackup('{"a":1}')).toThrow(/no es una copia/);
  });
  it('combinar: solo entra lo más reciente de la copia', () => {
    const cur = { grades: [r('a', 5), r('b', 1), r('c', 9)], students: [] };
    const bk = { grades: [r('a', 3), r('b', 4), r('d', 2)], students: [] };
    expect(restorePlan(cur, bk, 'merge', 100)).toEqual({ grades: [r('b', 4), r('d', 2)] });
  });
  it('volver a la copia: todo como en la copia y lo nuevo, borrado', () => {
    const cur = { grades: [r('a', 5), r('c', 9), r('x', 1, true)] };
    const bk = { grades: [r('a', 3), r('d', 2, true)] };
    expect(restorePlan(cur, bk, 'replace', 100)).toEqual({ grades: [{ ...r('a', 100), deleted: false }, r('d', 100, true), r('c', 100, true)] });
  });
});
