import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';

export function useGroups(subjectId: string) {
  const r = useLiveQuery(() => db.groups.where('subjectId').equals(subjectId).toArray(), [subjectId]);
  return useMemo(() => (r ?? []).filter((g) => !g.deleted), [r]);
}

export function useNodes(subjectId: string) {
  const r = useLiveQuery(() => db.nodes.where('subjectId').equals(subjectId).sortBy('order'), [subjectId]);
  return useMemo(() => (r ?? []).filter((n) => !n.deleted), [r]);
}
