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
    const m = migrateSubject(s, catalogs.find((c) => c.subject.id === s.id)?.subject);
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

// ---------- Deshacer (cambios de notas y alumnos de esta sesión) ----------

type UndoEntry = { table: 'grades' | 'students'; id: string; before: Grade | Student | undefined };
const undoStack: { label: string; entries: UndoEntry[] }[] = [];
let batch: { label: string; entries: UndoEntry[] } | null = null;
const undoSubs = new Set<() => void>();
const notifyUndo = () => undoSubs.forEach((f) => f());
export const subscribeUndo = (f: () => void) => { undoSubs.add(f); return () => { undoSubs.delete(f); }; };
/** Texto de lo último que se puede deshacer, o '' si nada. */
export const lastUndo = () => undoStack[undoStack.length - 1]?.label ?? '';

function remember(table: UndoEntry['table'], id: string, before: UndoEntry['before'], label: string) {
  const e = { table, id, before: before && { ...before } };
  if (batch) { if (!batch.entries.some((x) => x.table === table && x.id === id)) batch.entries.push(e); return; }
  undoStack.push({ label, entries: [e] });
  if (undoStack.length > 50) undoStack.shift();
  notifyUndo();
}

/** Agrupa varios cambios para deshacerlos de una vez (importaciones, Classroom…). */
export async function undoable<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (batch) return fn();
  batch = { label, entries: [] };
  try { return await fn(); }
  finally {
    const b = batch;
    batch = null;
    if (b.entries.length) { undoStack.push(b); if (undoStack.length > 50) undoStack.shift(); notifyUndo(); }
  }
}

/** Deshace el último cambio (o grupo de cambios). Lo que no existía queda borrado. */
export async function undo() {
  const g = undoStack.pop();
  notifyUndo();
  if (!g) return '';
  const now = Date.now();
  for (const e of [...g.entries].reverse()) {
    const t = e.table === 'grades' ? db.grades : db.students;
    if (e.before) await (t as Table<Grade | Student, string>).put({ ...e.before, updatedAt: now });
    else {
      const cur = await t.get(e.id);
      if (cur) await (t as Table<Grade | Student, string>).put({ ...cur, deleted: true, updatedAt: now });
    }
  }
  return g.label;
}

/** Nota global de una actividad (sin criterio). */
export async function saveGrade(studentId: string, activityId: string, patch: Partial<Grade>) {
  const id = `${studentId}|${activityId}`;
  const cur = await db.grades.get(id);
  remember('grades', id, cur, 'nota');
  await db.grades.put({ id, studentId, activityId, value: null, ...cur, ...patch, deleted: false, updatedAt: Date.now() });
}

/** Nota de un criterio en una actividad. */
export async function saveItemGrade(studentId: string, activityId: string, nodeId: string, patch: Partial<Grade>) {
  const id = `${studentId}|${activityId}|${nodeId}`;
  const cur = await db.grades.get(id);
  remember('grades', id, cur, 'nota de criterio');
  await db.grades.put({ id, studentId, activityId, nodeId, value: null, ...cur, ...patch, deleted: false, updatedAt: Date.now() });
}

/** Cambia datos de un alumno (pérdida de evaluación continua, extraordinaria…). */
export async function saveStudent(s: Student, patch: Partial<Student>) {
  const cur = await db.students.get(s.id);
  remember('students', s.id, cur, 'alumno');
  await db.students.put({ ...(cur ?? s), ...patch, updatedAt: Date.now() });
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
