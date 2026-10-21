import { describe, expect, it } from 'vitest';
import { distribute, holidayItems, monday, parseCalendarText, parseHolidays, plannedSessions, previousPending, schoolDays, schoolYearOf, unitBalance, weekday } from './planning';
import type { LearningUnit, Session } from './model';

describe('fechas', () => {
  it('día de la semana y lunes', () => {
    expect(weekday('2026-10-19')).toBe(1); // lunes
    expect(weekday('2026-10-25')).toBe(7);
    expect(monday('2026-10-22')).toBe('2026-10-19');
    expect(monday('2026-11-01')).toBe('2026-10-26'); // cambio de hora incluido
  });
  it('festivos sueltos e intervalos', () => {
    const h = parseHolidays('2026-10-12\n2026-12-22..2027-01-07, 2026-11-02 – 2026-11-03; basura');
    expect(h.has('2026-10-12')).toBe(true);
    expect(h.has('2026-12-31')).toBe(true);
    expect(h.has('2027-01-07')).toBe(true);
    expect(h.has('2027-01-08')).toBe(false);
    expect(h.has('2026-11-03')).toBe(true);
    expect(h.size).toBe(1 + 17 + 2);
  });
});

describe('schoolDays', () => {
  it('genera las sesiones del horario sin festivos', () => {
    const tt = [{ weekday: 1, slot: '3' }, { weekday: 3, slot: '1' }, { weekday: 3, slot: '2' }];
    const s = schoolDays('2026-10-05', '2026-10-18', tt, parseHolidays('2026-10-12'));
    expect(s.map((x) => `${x.date} h${x.slot}`)).toEqual([
      '2026-10-05 h3', '2026-10-07 h1', '2026-10-07 h2', '2026-10-14 h1', '2026-10-14 h2',
    ]);
    expect(schoolDays('2026-10-18', '2026-10-05', tt, new Set())).toEqual([]);
  });
});

describe('distribute', () => {
  const ses = (id: string, date: string, unitId?: string): Session => ({ id, groupId: 'g', date, slot: '1', unitId, topic: '', updatedAt: 0 });
  const ud = (id: string, n: number): LearningUnit => ({ id, subjectId: 'x', code: id, title: '', termId: 't1', plannedSessions: n, nodeIds: [], updatedAt: 0 });
  it('reparte por orden y descuenta las sesiones ya asignadas', () => {
    const s = [ses('a', '2026-10-01', 'UD1'), ses('b', '2026-10-02'), ses('c', '2026-10-05'), ses('d', '2026-10-06'), ses('e', '2026-10-07'), ses('f', '2026-10-08')];
    const m = distribute(s, [ud('UD1', 2), ud('UD2', 2), ud('UD3', 5)]);
    expect([...m]).toEqual([['b', 'UD1'], ['c', 'UD2'], ['d', 'UD2'], ['e', 'UD3'], ['f', 'UD3']]);
  });
  it('balance de sesiones previstas y programadas', () => {
    const b = unitBalance([ud('UD1', 2), ud('UD2', 3)], [ses('a', '2026-10-01', 'UD1'), ses('b', '2026-10-02', 'UD1'), ses('c', '2026-10-03', 'UD2'), { ...ses('d', '2026-10-04', 'UD2'), deleted: true }]);
    expect(b.map((x) => [x.unit.id, x.planned, x.scheduled])).toEqual([['UD1', 2, 2], ['UD2', 3, 1]]);
  });
});

describe('calendario escolar', () => {
  it('festivos con nombre, formato DD/MM/AAAA y comentarios', () => {
    const t = '2026-10-12 Fiesta Nacional de España\n2026-12-23..2027-01-07 Vacaciones de Navidad\n29/01/2027 San Valero\n# Fuente: BOA\nsin fecha';
    expect(holidayItems(t)).toEqual([
      { from: '2026-10-12', to: '2026-10-12', label: 'Fiesta Nacional de España' },
      { from: '2026-12-23', to: '2027-01-07', label: 'Vacaciones de Navidad' },
      { from: '2027-01-29', to: '2027-01-29', label: 'San Valero' },
    ]);
    expect(parseHolidays('2027-03-22 a 2027-03-26 Semana Santa').size).toBe(5);
  });
  it('curso escolar de una fecha', () => {
    expect(schoolYearOf('2026-10-21')).toBe('2026/27');
    expect(schoolYearOf('2027-06-20')).toBe('2026/27');
    expect(schoolYearOf('2027-09-01')).toBe('2027/28');
  });
  it('lee la respuesta de la IA', () => {
    const r = parseCalendarText([
      '```', '**INICIO:** 2026-09-09', 'FIN: 2027-06-18', 'EVALUACIÓN: 1.ª evaluación | 2026-09-09 | 2026-12-04',
      '- EVALUACION: 2.ª evaluación | 2026-12-09 | 2027-03-12', 'EVALUACION: 3.ª evaluación | |',
      '- 2026-10-12 Fiesta Nacional', 'Texto sin fecha', '```',
    ].join('\n'));
    expect(r.start).toBe('2026-09-09');
    expect(r.end).toBe('2027-06-18');
    expect(r.terms).toEqual([
      { name: '1.ª evaluación', start: '2026-09-09', end: '2026-12-04' },
      { name: '2.ª evaluación', start: '2026-12-09', end: '2027-03-12' },
      { name: '3.ª evaluación', start: '', end: '' },
    ]);
    expect(r.holidays).toBe('2026-10-12 Fiesta Nacional');
  });
  it('sesiones previstas del grupo, en total y por evaluación', () => {
    const cal = { start: '2026-10-05', end: '2026-10-30', holidays: '2026-10-12 Pilar', terms: [{ start: '2026-10-05', end: '2026-10-16' }, { start: '2026-10-19', end: '' }] };
    const tt = [{ weekday: 1, slot: '3' }, { weekday: 3, slot: '1' }];
    expect(plannedSessions(cal, tt, '2026-10-28')).toEqual({ total: 6, byTerm: [3, null] });
    expect(plannedSessions(cal, [])).toBeNull();
  });
  it('pendiente de la sesión anterior del grupo', () => {
    const s = (id: string, date: string, slot: string, pending?: string, groupId = 'g'): Session => ({ id, groupId, date, slot, topic: '', pending, updatedAt: 0 });
    const list = [s('b', '2026-10-07', '1'), s('a', '2026-10-05', '3', 'Acabar bocetos'), s('x', '2026-10-06', '1', 'otro grupo', 'h')];
    expect(previousPending(list, list[0])).toBe('Acabar bocetos');
    expect(previousPending(list, list[1])).toBe('');
  });
});
