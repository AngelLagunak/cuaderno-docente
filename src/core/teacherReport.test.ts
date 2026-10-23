import { describe, expect, it } from 'vitest';
import { teacherReport } from './teacherReport';
import type { Activity, Attendance, Grade, Group, LearningUnit, Session, Student, Subject } from './model';
import { mm } from '../catalogs/mm';

const S: Subject = { ...mm.subject, config: { ...mm.subject.config, observations: [{ id: 'part', label: 'Participa', sign: 1 }, { id: 'mat', label: 'Sin material', sign: -1 }] } };
const node = mm.nodes[0];
const group: Group = { id: 'g', subjectId: S.id, name: '2ºJ', schoolYear: '2026/27', updatedAt: 0 };
const stu = (id: string, firstName: string): Student => ({ id, groupId: 'g', firstName, lastName: 'X', updatedAt: 0 });
const students = [stu('s1', 'Ana'), stu('s2', 'Luis'), stu('s3', 'Eva')];
const act = (id: string, instrumentId: string, date: string, nodeIds = [node.id]): Activity => ({ id, subjectId: S.id, groupId: 'g', termId: 't1', instrumentId, title: id, weight: 1, nodeIds, date, updatedAt: 0 });
const gr = (s: string, a: string, value: number | null, late = false): Grade => ({ id: `${s}|${a}`, studentId: s, activityId: a, value, late, updatedAt: 0 });
const unit: LearningUnit = { id: 'u1', subjectId: S.id, code: 'UD1', title: 'Cera', termId: 't1', plannedSessions: 2, nodeIds: [node.id], updatedAt: 0 };
const ses = (date: string, done = '', pending = ''): Session => ({ id: date, groupId: 'g', date, slot: '1', unitId: 'u1', topic: '', done, pending, updatedAt: 0 });
const att = (s: string, date: string, status: Attendance['status'], obs: string[] = []): Attendance => ({ id: `${s}|${date}|1`, studentId: s, groupId: 'g', date, slot: '1', status, obs, updatedAt: 0 });

function run(extra: Partial<Parameters<typeof teacherReport>[0]> = {}) {
  const acts = [act('a1', 'prac', '2026-10-01'), act('a2', 'proy', '2026-10-10'), act('a3', 'prac', '2026-12-01')];
  const grades = [gr('s1', 'a1', 8), gr('s2', 'a1', 3, true), gr('s3', 'a1', 9), gr('s1', 'a2', 7), gr('s3', 'a2', 6)];
  const sessions = [ses('2026-10-01', 'Moldes', 'Acabar moldes'), ses('2026-10-08', '', 'Acabar moldes'), ses('2026-10-15')];
  const attendance = [att('s1', '2026-10-01', 'P', ['part']), att('s2', '2026-10-01', 'A'), att('s3', '2026-10-01', 'P', ['part', 'mat']),
    att('s1', '2026-10-08', 'P'), att('s2', '2026-10-08', 'P'), att('s3', '2026-10-08', 'R')];
  return teacherReport({
    subject: S, nodes: mm.nodes, links: [], units: [unit], period: 't1', range: { start: '2026-09-08', end: '2026-12-20' }, today: '2026-10-20',
    groups: [{ group, students, activities: acts, grades, attendance, sessions }], ...extra,
  })[0];
}

describe('teacherReport', () => {
  it('resume notas, entregas y asistencia del periodo', () => {
    const r = run();
    expect(r.n).toBe(3);
    expect(r.summary.n).toBe(3);
    expect(r.failing).toEqual(['Luis X']);
    // a1 y a2 vencidas (a3 aún no): 6 notas posibles, 5 puestas, 1 tardía.
    expect(r.graded).toEqual({ done: 5, total: 6 });
    expect(r.late).toBe(1);
    expect(r.attendancePct).toBeCloseTo((5 / 6) * 100);
    expect(r.obs).toEqual({ pos: 2, neg: 1 });
  });
  it('mide la organización: lista, diario, pendientes y unidades', () => {
    const r = run();
    expect(r.sessions).toMatchObject({ held: 3, withList: 2, documented: 2, pending: 2, topPending: 'Acabar moldes (2 veces)' });
    expect(r.units).toEqual([{ code: 'UD1', title: 'Cera', planned: 2, taught: 3 }]);
    expect(r.unusedInstruments).toEqual(['Exposiciones, memorias y dossier']);
    expect(r.coverage.evaluated).toBe(1);
  });
  it('deduce puntos fuertes y áreas de mejora', () => {
    const r = run();
    expect(r.improvements.join(' ')).toMatch(/Sin lista en 1 de 3/);
    expect(r.improvements.join(' ')).toMatch(/Faltan 1 notas/);
    expect(r.improvements.join(' ')).toMatch(/Acabar moldes/);
    expect(r.improvements.join(' ')).toMatch(/UD1 \(3\/2\)/);
    expect(r.improvements.join(' ')).toMatch(/Exposiciones/);
    expect(r.improvements.join(' ')).toMatch(/Luis X/);
  });
  it('el curso completo usa la nota final y todas las unidades', () => {
    const r = run({ period: 'final', range: undefined });
    expect(r.summary.n).toBe(3);
    expect(r.units).toHaveLength(1);
    expect(r.improvements.join(' ')).toMatch(/Unidades que se alargaron/);
  });
});
