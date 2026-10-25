import { describe, expect, it } from 'vitest';
import { classesOfDay, pendingBefore, toGrade } from './today';
import type { Activity, Attendance, Grade, Group, Session, Student } from './model';

const g = (id: string, name: string, timetable: Group['timetable'] = []): Group => ({ id, subjectId: 's', name, schoolYear: '2026/27', timetable, updatedAt: 0 });
const ses = (id: string, groupId: string, date: string, slot: string, pending?: string): Session => ({ id, groupId, date, slot, topic: '', pending, updatedAt: 0 });
const att = (groupId: string, date: string, slot: string): Attendance => ({ id: `x|${date}|${slot}`, studentId: 'x', groupId, date, slot, status: 'P', updatedAt: 0 });
const ba = g('ba', '1.º BA', [{ weekday: 3, slot: '3' }]), jo = g('jo', '2.º Joyería', [{ weekday: 3, slot: '5' }, { weekday: 3, slot: '1' }]);

describe('clases del día', () => {
  it('sesiones y horario, por hora; pasada, siguiente y más tarde', () => {
    const c = classesOfDay('2026-10-21', '2026-10-21', [ba, jo], [ses('a', 'ba', '2026-10-21', '3')], [att('jo', '2026-10-21', '1')], new Set());
    expect(c.map((x) => [x.slot, x.group.id, !!x.session, x.state])).toEqual([['1', 'jo', false, 'past'], ['3', 'ba', true, 'next'], ['5', 'jo', false, 'later']]);
  });
  it('con las horas del centro manda el reloj', () => {
    const times = [{ slot: '1', start: '08:30', end: '09:25' }, { slot: '3', start: '10:20', end: '11:15' }, { slot: '5', start: '12:25', end: '13:20' }];
    const at = (now: string) => classesOfDay('2026-10-21', '2026-10-21', [ba, jo], [], [], new Set(), times, now).map((x) => x.state);
    expect(at('10:40')).toEqual(['past', 'now', 'later']);
    expect(at('11:20')).toEqual(['past', 'past', 'next']);
    expect(at('08:00')).toEqual(['next', 'later', 'later']);
    expect(classesOfDay('2026-10-21', '2026-10-21', [ba], [], [], new Set(), times, '10:40')[0].time).toEqual(times[1]);
  });
  it('días pasados y festivos', () => {
    expect(classesOfDay('2026-10-14', '2026-10-21', [ba], [], [], new Set()).map((x) => x.state)).toEqual(['past']);
    expect(classesOfDay('2026-10-28', '2026-10-21', [ba], [], [], new Set(['2026-10-28']))).toEqual([]);
  });
  it('lo pendiente de la sesión anterior', () => {
    const s = [ses('a', 'ba', '2026-10-19', '3', 'Bocetos'), ses('b', 'ba', '2026-10-21', '1', 'Maqueta'), ses('c', 'jo', '2026-10-20', '1', 'Otro grupo')];
    expect(pendingBefore(s, 'ba', '2026-10-21', '3')).toBe('Maqueta');
    expect(pendingBefore(s, 'ba', '2026-10-21', '1')).toBe('Bocetos');
    expect(pendingBefore(s, 'ba', '2026-10-19', '3')).toBe('');
  });
});

describe('por corregir', () => {
  const st = (id: string, groupId = 'ba'): Student => ({ id, groupId, firstName: id, lastName: id, updatedAt: 0 });
  const act = (id: string, date?: string): Activity => ({ id, subjectId: 's', groupId: 'ba', termId: 't1', instrumentId: 'i', title: id, weight: 1, nodeIds: [], date, updatedAt: 0 });
  const gr = (studentId: string, activityId: string, value: number | null, nodeId?: string): Grade => ({ id: `${studentId}|${activityId}${nodeId ? '|' + nodeId : ''}`, studentId, activityId, nodeId, value, updatedAt: 0 });
  it('actividades con fecha pasada y alumnos sin nota (global o por criterio)', () => {
    const r = toGrade([act('cartel', '2026-10-19'), act('fanzine', '2026-10-20'), act('futura', '2026-11-02'), act('sinfecha')],
      [st('a'), st('b'), st('c'), st('z', 'otro')], [gr('a', 'cartel', 7), gr('b', 'cartel', null), gr('a', 'fanzine', 5, 'n1'), gr('b', 'fanzine', 6), gr('c', 'fanzine', 8)], '2026-10-21');
    expect(r.map((x) => [x.activity.id, x.missing, x.total])).toEqual([['cartel', 2, 3]]);
  });
  it('las actividades sin calificación nunca quedan por corregir', () => {
    expect(toGrade([{ ...act('debate', '2026-10-19'), formative: true }], [st('a')], [], '2026-10-21')).toEqual([]);
  });
});
