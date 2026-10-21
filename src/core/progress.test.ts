import { describe, expect, it } from 'vitest';
import { gradeSummary, sessionProgress } from './progress';
import type { Attendance, LearningUnit, Session } from './model';
import { pa } from '../catalogs/pa';

const u = (id: string, termId: string, planned: number): LearningUnit => ({ id, subjectId: 's', code: id, title: id, termId, plannedSessions: planned, nodeIds: [], updatedAt: 0 });
const s = (id: string, date: string, unitId?: string, pending?: string): Session => ({ id, groupId: 'g', date, slot: '1', unitId, topic: '', pending, updatedAt: 0 });

describe('avance de la programación', () => {
  const units = [u('UD1', 't1', 2), u('UD2', 't1', 4), u('UD3', 't2', 3)];
  const sessions = [s('a', '2026-10-05', 'UD1'), s('b', '2026-10-07', 'UD1', 'Terminar bocetos'), s('c', '2026-10-12', 'UD2', 'terminar bocetos '),
    s('d', '2026-10-14', 'UD2'), s('e', '2026-10-19', 'UD2'), s('f', '2026-10-21', 'UD2')];
  const att: Attendance[] = [{ id: 'x', studentId: 'x', groupId: 'g', date: '2026-10-19', slot: '1', status: 'A', updatedAt: 0 }, { id: 'y', studentId: 'y', groupId: 'g', date: '2026-10-19', slot: '1', status: 'P', updatedAt: 0 }];
  it('impartidas, por unidad, pendientes y asistencia', () => {
    const r = sessionProgress({ units, sessions, attendance: att, today: '2026-10-19', terms: pa.subject.terms });
    expect([r.taught, r.total]).toEqual([5, 6]); // hoy no cuenta sin lista… salvo que se haya pasado (la del 19 sí)
    expect(r.units.map((x) => [x.unit.id, x.taught, x.scheduled, x.planned])).toEqual([['UD1', 2, 2, 2], ['UD2', 3, 4, 4], ['UD3', 0, 0, 3]]);
    expect(r.pending).toBe(2);
    expect(r.topPending).toEqual({ text: 'Terminar bocetos', n: 2 });
    expect(r.attendancePct).toBe(50);
  });
  it('desfase de la evaluación: sesiones que faltan de sus unidades frente a las que quedan en el calendario', () => {
    const tt = [{ weekday: 1, slot: '1' }, { weekday: 3, slot: '1' }];
    const r = sessionProgress({ units, sessions, attendance: att, today: '2026-10-19', terms: pa.subject.terms, timetable: tt, holidays: new Set(['2026-10-21']),
      calendarTerms: [{ start: '2026-09-09', end: '2026-10-26' }, { start: '2026-10-27', end: '2026-12-20' }] });
    // 1.ª: falta 1 sesión de UD2; quedan 19-oct (lista ya pasada: no cuenta), 26-oct → 1 → al día
    expect(r.terms[0]).toMatchObject({ pendingPlan: 1, left: 1, gap: 0 });
    expect(r.terms[1].pendingPlan).toBe(3);
  });
});

describe('resumen de notas', () => {
  it('media, aprobados y reparto', () => {
    expect(gradeSummary([4.6, 5.2, 6.4, 7.1, 8.6, 9.5, null], 5)).toEqual({ n: 6, of: 7, mean: (4.6 + 5.2 + 6.4 + 7.1 + 8.6 + 9.5) / 6, passed: 5, counts: [1, 1, 1, 1, 2] }); // 8,6 redondea a 9
    expect(gradeSummary([], 5).mean).toBeNull();
  });
});
