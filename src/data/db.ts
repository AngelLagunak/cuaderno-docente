import Dexie, { type Table } from 'dexie';
import { linkId } from '../core/model';
import type { Activity, Attendance, CLink, CNode, Grade, Group, LearningUnit, Stamp, Student, Subject } from '../core/model';
import { catalogs } from '../catalogs';

class DB extends Dexie {
  subjects!: Table<Subject, string>;
  nodes!: Table<CNode, string>;
  links!: Table<CLink, string>;
  groups!: Table<Group, string>;
  students!: Table<Student, string>;
  activities!: Table<Activity, string>;
  grades!: Table<Grade, string>;
  units!: Table<LearningUnit, string>;
  attendance!: Table<Attendance, string>;

  constructor() {
    super('cuaderno-docente');
    this.version(1).stores({
      subjects: 'id',
      nodes: 'id, subjectId, level',
      links: 'id, subjectId, relation, fromId, toId',
      groups: 'id, subjectId',
      students: 'id, groupId',
      activities: 'id, subjectId, groupId, termId',
      grades: 'id, studentId, activityId',
    });
    this.version(2).stores({ units: 'id, subjectId' });
    this.version(3).stores({ attendance: 'id, groupId, studentId, date' });
  }
}

export const db = new DB();

/** Carga los catálogos la primera vez. No sobrescribe materias ya existentes. */
export async function seed() {
  for (const c of catalogs) {
    if (await db.subjects.get(c.subject.id)) continue;
    await db.transaction('rw', db.subjects, db.nodes, db.links, async () => {
      await db.subjects.put(c.subject);
      await db.nodes.bulkPut(c.nodes);
      await db.links.bulkPut(c.links);
    });
  }
}

/** Crea o quita un enlace (borrado lógico para poder sincronizar). */
export async function setLink(subjectId: string, relation: string, fromId: string, toId: string, on: boolean) {
  await db.links.put({
    id: linkId(subjectId, relation, fromId, toId),
    subjectId, relation, fromId, toId,
    deleted: !on,
    updatedAt: Date.now(),
  });
}

export const uid = () => crypto.randomUUID();

export async function saveSubject(s: Subject) {
  await db.subjects.put({ ...s, updatedAt: Date.now() });
}

export async function saveNode(n: CNode) {
  await db.nodes.put({ ...n, updatedAt: Date.now() });
}

export async function softDelete<T extends Stamp & { id: string }>(table: Table<T, string>, row: T) {
  await table.put({ ...row, deleted: true, updatedAt: Date.now() } as T);
}

/** Borra un nodo, sus enlaces y lo quita de unidades y actividades. */
export async function deleteNode(n: CNode) {
  const now = Date.now();
  await db.transaction('rw', db.nodes, db.links, db.activities, db.units, async () => {
    await db.nodes.put({ ...n, deleted: true, updatedAt: now });
    const ls = await db.links.where('fromId').equals(n.id).or('toId').equals(n.id).toArray();
    await db.links.bulkPut(ls.map((l) => ({ ...l, deleted: true, updatedAt: now })));
    const acts = await db.activities.where('subjectId').equals(n.subjectId).filter((a) => a.nodeIds.includes(n.id)).toArray();
    await db.activities.bulkPut(acts.map((a) => ({ ...a, nodeIds: a.nodeIds.filter((x) => x !== n.id), updatedAt: now })));
    const us = await db.units.where('subjectId').equals(n.subjectId).filter((u) => u.nodeIds.includes(n.id)).toArray();
    await db.units.bulkPut(us.map((u) => ({ ...u, nodeIds: u.nodeIds.filter((x) => x !== n.id), updatedAt: now })));
  });
}
