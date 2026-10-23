import { useMemo, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { plannedSessions } from '../core/planning';
import type { Group } from '../core/model';

export function useGroups(subjectId: string) {
  const r = useLiveQuery(() => db.groups.where('subjectId').equals(subjectId).toArray(), [subjectId]);
  return useMemo(() => (r ?? []).filter((g) => !g.deleted).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })), [r]);
}

export function useNodes(subjectId: string) {
  const r = useLiveQuery(() => db.nodes.where('subjectId').equals(subjectId).sortBy('order'), [subjectId]);
  return useMemo(() => (r ?? []).filter((n) => !n.deleted), [r]);
}

/** Calendario escolar del curso del grupo (o el último guardado si no hay uno para ese curso). */
export function useSchoolCalendar(schoolYear?: string) {
  return useLiveQuery(async () => {
    const all = (await db.calendars.toArray()).filter((c) => !c.deleted);
    return all.find((c) => c.id === schoolYear) ?? all.sort((a, b) => b.id.localeCompare(a.id))[0];
  }, [schoolYear]);
}

/** Sesiones previstas del grupo en todo el curso (horario × calendario escolar), si se pueden calcular. */
export function usePlannedSessions(group?: Group) {
  const cal = useSchoolCalendar(group?.schoolYear);
  return group ? plannedSessions(cal, group.timetable ?? [], group.holidays)?.total : undefined;
}

// Grupo de trabajo actual: el mismo en todas las pantallas (se elige arriba) y recordado en el dispositivo.
const groupSubs = new Set<() => void>();
const readGroup = () => { try { return localStorage.getItem('groupId') ?? ''; } catch { return ''; } };
let currentGroup = readGroup();
export function setCurrentGroup(id: string) {
  currentGroup = id;
  try { localStorage.setItem('groupId', id); } catch { /* sin almacenamiento: solo en memoria */ }
  groupSubs.forEach((f) => f());
}
export function useCurrentGroupId(): [string, (id: string) => void] {
  const id = useSyncExternalStore((f) => { groupSubs.add(f); return () => { groupSubs.delete(f); }; }, () => currentGroup);
  return [id, setCurrentGroup];
}
