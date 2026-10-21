import Dexie, { type Table } from 'dexie';
import { linkId } from '../core/model';
import type { Activity, Attendance, Message, Template, CLink, CNode, Grade, Group, LearningUnit, Rubric, Stamp, Student, Subject } from '../core/model';
import { catalogs } from '../catalogs';
import { migrateSubject } from '../core/curriculum';

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
  messages!: Table<Message, string>;
  templates!: Table<Template, string>;
  rubrics!: Table<Rubric, string>;

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
    this.version(4).stores({ messages: 'id, groupId, sentAt', templates: 'id' });
    // v5: rúbricas propias. Las notas por criterio van en `grades` con `nodeId`; las existentes no cambian.
    this.version(5).stores({ rubrics: 'id, subjectId' });
  }
}

export const db = new DB();

/** Carga los catálogos la primera vez. No sobrescribe materias ya existentes. */
export async function seed() {
  for (const s of await db.subjects.toArray()) {
    const m = migrateSubject(s);
    if (m) await saveSubject(m);
  }
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

/** Borra un nodo, sus enlaces y lo quita de unidades, actividades y rúbricas. */
export async function deleteNode(n: CNode) {
  const now = Date.now();
  await db.transaction('rw', [db.nodes, db.links, db.activities, db.units, db.rubrics], async () => {
    await db.nodes.put({ ...n, deleted: true, updatedAt: now });
    const ls = await db.links.where('fromId').equals(n.id).or('toId').equals(n.id).toArray();
    await db.links.bulkPut(ls.map((l) => ({ ...l, deleted: true, updatedAt: now })));
    const acts = await db.activities.where('subjectId').equals(n.subjectId).filter((a) => a.nodeIds.includes(n.id)).toArray();
    await db.activities.bulkPut(acts.map((a) => ({ ...a, nodeIds: a.nodeIds.filter((x) => x !== n.id), updatedAt: now })));
    const us = await db.units.where('subjectId').equals(n.subjectId).filter((u) => u.nodeIds.includes(n.id)).toArray();
    await db.units.bulkPut(us.map((u) => ({ ...u, nodeIds: u.nodeIds.filter((x) => x !== n.id), updatedAt: now })));
    const rs = await db.rubrics.where('subjectId').equals(n.subjectId).filter((r) => r.rows.some((x) => x.nodeId === n.id)).toArray();
    await db.rubrics.bulkPut(rs.map((r) => ({ ...r, rows: r.rows.filter((x) => x.nodeId !== n.id), updatedAt: now })));
  });
}

/** Nota global de una actividad (sin criterio). */
export async function saveGrade(studentId: string, activityId: string, patch: Partial<Grade>) {
  const id = `${studentId}|${activityId}`;
  const cur = await db.grades.get(id);
  await db.grades.put({ id, studentId, activityId, value: null, ...cur, ...patch, updatedAt: Date.now() });
}

/** Nota de un criterio en una actividad. */
export async function saveItemGrade(studentId: string, activityId: string, nodeId: string, patch: Partial<Grade>) {
  const id = `${studentId}|${activityId}|${nodeId}`;
  const cur = await db.grades.get(id);
  await db.grades.put({ id, studentId, activityId, nodeId, value: null, ...cur, ...patch, deleted: false, updatedAt: Date.now() });
}

/** Guarda una rúbrica y recalcula las notas puestas con ella si han cambiado los valores de los niveles. */
export async function saveRubric(r: Rubric) {
  const now = Date.now();
  await db.transaction('rw', db.rubrics, db.activities, db.grades, async () => {
    await db.rubrics.put({ ...r, updatedAt: now });
    const acts = await db.activities.where('subjectId').equals(r.subjectId).filter((a) => a.rubricId === r.id && !a.deleted).toArray();
    if (!acts.length) return;
    const gs = await db.grades.where('activityId').anyOf(acts.map((a) => a.id)).filter((g) => !!g.nodeId && g.level != null).toArray();
    const upd = gs
      .map((g) => ({ g, v: r.levels[g.level!]?.value ?? null }))
      .filter(({ g, v }) => v !== g.value)
      .map(({ g, v }) => ({ ...g, value: v, level: v == null ? undefined : g.level, updatedAt: now }));
    if (upd.length) await db.grades.bulkPut(upd);
  });
}
