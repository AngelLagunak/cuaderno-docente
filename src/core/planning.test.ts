import { describe, expect, it } from 'vitest';
import { distribute, monday, parseHolidays, schoolDays, unitBalance, weekday } from './planning';
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
