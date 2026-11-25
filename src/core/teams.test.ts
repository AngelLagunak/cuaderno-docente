import { describe, expect, it } from 'vitest';
import { adjusted, copyTeams, followers, makeTeams, moveStudent } from './teams';
import type { Grade } from './model';

let n = 0;
const id = () => 't' + ++n;
const ids = (k: number) => Array.from({ length: k }, (_, i) => 's' + (i + 1));

describe('equipos', () => {
  it('reparte lo más igualado posible sin pasar del tamaño', () => {
    const t = makeTeams(ids(25), 4, id);
    expect(t.map((x) => x.studentIds.length)).toEqual([4, 4, 4, 4, 3, 3, 3]);
    expect(new Set(t.flatMap((x) => x.studentIds)).size).toBe(25);
    expect(makeTeams(ids(6), 3, id).map((x) => x.studentIds)).toEqual([['s1', 's2', 's3'], ['s4', 's5', 's6']]);
    expect(makeTeams([], 3, id)).toEqual([]);
  });
  it('al azar mezcla, pero no pierde a nadie', () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const t = makeTeams(ids(10), 3, id, rand);
    expect(t.flatMap((x) => x.studentIds).sort()).toEqual(ids(10).sort());
    expect(t.map((x) => x.studentIds.length)).toEqual([3, 3, 2, 2]);
  });
  it('mueve y copia', () => {
    const t = makeTeams(ids(4), 2, id);
    const m = moveStudent(t, 's1', t[1].id);
    expect(m[0].studentIds).toEqual(['s2']);
    expect(m[1].studentIds).toEqual(['s3', 's4', 's1']);
    expect(moveStudent(t, 's1', '')[0].studentIds).toEqual(['s2']);
    const c = copyTeams([{ ...t[0], mark: { value: 7 } }, { ...t[1], studentIds: ['s9'] }], ['s1', 's2'], id);
    expect(c).toHaveLength(1);
    expect(c[0].mark).toBeUndefined();
    expect(c[0].id).not.toBe(t[0].id);
  });
  it('la nota del equipo llega a quien no tiene nota o tenía la del equipo, no a quien se ajustó', () => {
    const g = (value: number | null, level?: number) => ({ value, level }) as Grade;
    const team = { id: 'e', name: 'E', studentIds: ['a', 'b', 'c', 'd'] };
    const cur: Record<string, Grade | undefined> = { a: g(6, 2), b: g(8, 3), c: undefined, d: g(null) };
    expect(followers(team, { value: 6, level: 2 }, (s) => cur[s])).toEqual(['a', 'c', 'd']);
    expect(followers(team, undefined, (s) => cur[s])).toEqual(['c', 'd']);
    expect(adjusted(cur.b, { value: 6, level: 2 })).toBe(true);
    expect(adjusted(cur.a, { value: 6, level: 2 })).toBe(false);
    expect(adjusted(cur.c, { value: 6 })).toBe(false);
  });
});
