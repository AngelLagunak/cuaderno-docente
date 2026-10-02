import Dexie, { type Table } from 'dexie';
import { linkId } from '../core/model';
import type { Activity, CLink, CNode, Grade, Group, Student, Subject } from '../core/model';
import { catalogs } from '../catalogs';

class DB extends Dexie {
  subjects!: Table<Subject, string>;
  nodes!: Table<CNode, string>;
  links!: Table<CLink, string>;
  groups!: Table<Group, string>;
  students!: Table<Student, string>;
  activities!: Table<Activity, string>;
  grades!: Table<Grade, string>;

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
