import type { Activity, Grade, ID, Team, TeamMark } from './model';

/**
 * Reparte el alumnado en equipos de `size` integrantes como mucho, lo más igualados posible (25 de 4 en 4 →
 * 4·4·4·4·3·3·3). Con `rand` se barajan antes; sin él, por orden de lista.
 */
export function makeTeams(studentIds: ID[], size: number, newId: () => ID, rand?: () => number): Team[] {
  const ids = [...studentIds];
  if (rand) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const n = Math.max(1, Math.ceil(ids.length / Math.max(1, Math.floor(size))));
  const teams: Team[] = Array.from({ length: n }, (_, i) => ({ id: newId(), name: `Equipo ${i + 1}`, studentIds: [] }));
  // Los primeros equipos se llevan un integrante más cuando no salen exactos.
  const base = Math.floor(ids.length / n), extra = ids.length % n;
  let k = 0;
  teams.forEach((t, i) => { const m = base + (i < extra ? 1 : 0); t.studentIds = ids.slice(k, k + m); k += m; });
  return ids.length ? teams : [];
}

/** Copia los equipos de otra actividad con identificadores nuevos y sin notas. Deja fuera a quien ya no esté. */
export function copyTeams(from: Team[], studentIds: ID[], newId: () => ID): Team[] {
  const live = new Set(studentIds);
  return from.map((t) => ({ id: newId(), name: t.name, studentIds: t.studentIds.filter((s) => live.has(s)) })).filter((t) => t.studentIds.length);
}

/** Pasa a un alumno a otro equipo (o a ninguno con `to` vacío). */
export function moveStudent(teams: Team[], studentId: ID, to: ID | ''): Team[] {
  return teams.map((t) => {
    const rest = t.studentIds.filter((s) => s !== studentId);
    return t.id === to ? { ...t, studentIds: [...rest, studentId] } : rest.length === t.studentIds.length ? t : { ...t, studentIds: rest };
  });
}

export const teamOf = (a: Activity, studentId: ID) => a.teams?.find((t) => t.studentIds.includes(studentId));

const same = (g: Pick<Grade, 'value' | 'level'> | undefined, m: TeamMark | undefined) =>
  (g?.value ?? null) === (m?.value ?? null) && (g?.value == null || (g?.level ?? null) === (m?.level ?? null));

/**
 * Integrantes a los que llega una nota nueva del equipo: los que no tienen nota y los que tenían la anterior del
 * equipo. A quien se le ajustó a mano (nota distinta de la del equipo) se le respeta.
 */
export function followers(team: Team, old: TeamMark | undefined, current: (studentId: ID) => Grade | undefined): ID[] {
  return team.studentIds.filter((s) => { const g = current(s); return g?.value == null || same(g, old); });
}

/** La nota del alumno no es la de su equipo (se ajustó a mano). Sin nota de equipo no hay ajuste. */
export const adjusted = (g: Grade | undefined, m: TeamMark | undefined) => m?.value != null && g?.value != null && !same(g, m);
