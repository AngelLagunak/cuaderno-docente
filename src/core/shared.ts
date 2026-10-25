import type { Activity } from './model';

/**
 * Campos de la programación que comparten todas las copias de una actividad compartida entre grupos. Son de cada
 * grupo: el grupo, la fecha, la tarea de Classroom (y su rúbrica y puntos) y, claro, las notas.
 */
export const SHARED_FIELDS = ['title', 'termId', 'instrumentId', 'weight', 'nodeIds', 'unitId', 'rubricId', 'fromObs', 'formative'] as const;
type SharedKey = (typeof SHARED_FIELDS)[number];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Copia de una actividad para otro grupo: misma programación, sin tarea de Classroom ni notas. */
export function copyFor(a: Activity, groupId: string, id: string, shareId: string, now: number): Activity {
  const out: Activity = { id, subjectId: a.subjectId, groupId, termId: a.termId, instrumentId: a.instrumentId, title: a.title, weight: a.weight, nodeIds: [...a.nodeIds], shareId, updatedAt: now };
  for (const k of SHARED_FIELDS) if (a[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = structuredClone(a[k]);
  if (a.date) out.date = a.date;
  return out;
}

/** Las copias de los demás grupos que cambian para igualar la programación de `src`. */
export function propagate(src: Activity, siblings: Activity[], now: number): Activity[] {
  const out: Activity[] = [];
  for (const s of siblings) {
    if (s.id === src.id || s.deleted || s.shareId !== src.shareId) continue;
    const diff = SHARED_FIELDS.filter((k: SharedKey) => !same(s[k], src[k]));
    if (!diff.length) continue;
    const next = { ...s, updatedAt: now } as unknown as Record<string, unknown>;
    for (const k of diff) next[k] = src[k] === undefined ? undefined : structuredClone(src[k]);
    out.push(next as unknown as Activity);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Tarea de Classroom de otro curso con el mismo título (sin distinguir mayúsculas, tildes ni espacios). */
export function matchWork<W extends { id: string; title: string }>(title: string, works: W[], taken: Set<string> = new Set()): W | undefined {
  const t = norm(title);
  return works.find((w) => !taken.has(w.id) && norm(w.title) === t);
}
