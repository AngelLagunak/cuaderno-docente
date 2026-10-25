import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { useCurrentGroupId, useGroups } from './hooks';
import { callScript } from '../data/api';
import type { CCourse, CStudent } from '../data/api';
import type { Group, Student, Subject } from '../core/model';

type Row = { lastName: string; firstName: string; email?: string; nia?: string };

export function parseStudents(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[;\t,]/).map((x) => x.trim()))
    .filter((c, i) => !(i === 0 && /apellid/i.test(c[0])))
    .filter((c) => c[0] || c[1])
    .map((c) => ({ lastName: c[0] ?? '', firstName: c[1] ?? '', email: c[2] || undefined, nia: c[3] || undefined }));
}

function StudentRow({ s }: { s: Student }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState(s);
  if (!edit)
    return (
      <div className="issue sp">
        <span><b>{s.lastName}</b>, {s.firstName}<span className="mute sub">{[s.nia, s.email].filter(Boolean).join(' · ')}</span></span>
        <span className="row" style={{ margin: 0 }}>
          <button className="small" onClick={() => { setD(s); setEdit(true); }}>Editar</button>
          <button className="small" onClick={() => confirm(`¿Borrar a ${s.firstName} ${s.lastName}?`) && softDelete(db.students, s)}>×</button>
        </span>
      </div>
    );
  return (
    <div className="form">
      <input placeholder="Apellidos" value={d.lastName} onChange={(e) => setD({ ...d, lastName: e.target.value })} />
      <input placeholder="Nombre" value={d.firstName} onChange={(e) => setD({ ...d, firstName: e.target.value })} />
      <input placeholder="Correo" value={d.email ?? ''} onChange={(e) => setD({ ...d, email: e.target.value || undefined })} />
      <input placeholder="NIA" value={d.nia ?? ''} onChange={(e) => setD({ ...d, nia: e.target.value || undefined })} />
      <div className="row">
        <button className="on" onClick={async () => { await db.students.put({ ...d, updatedAt: Date.now() }); setEdit(false); }}>Guardar</button>
        <button onClick={() => setEdit(false)}>Cancelar</button>
      </div>
    </div>
  );
}


function ClassroomImport({ group, students }: { group: Group; students: Student[] }) {
  const [courses, setCourses] = useState<CCourse[] | null>(null);
  const [courseId, setCourseId] = useState(group.classroomCourseId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run(f: () => Promise<void>) {
    setBusy(true); setMsg('');
    try { await f(); } catch (e) { setMsg('Error: ' + (e as Error).message); } finally { setBusy(false); }
  }
  const loadCourses = () => run(async () => {
    const c = await callScript<CCourse[]>('classroom.courses');
    setCourses(c);
    if (!courseId && c[0]) setCourseId(c[0].id);
  });
  const importStudents = () => run(async () => {
    const list = await callScript<CStudent[]>('classroom.students', { courseId });
    const now = Date.now();
    const name = (a: string, b: string) => (a + b).toLowerCase();
    const byUser = new Map(students.filter((s) => s.classroomUserId).map((s) => [s.classroomUserId!, s]));
    const byMail = new Map(students.filter((s) => s.email).map((s) => [s.email!.toLowerCase(), s]));
    const byName = new Map(students.map((s) => [name(s.lastName, s.firstName), s]));
    let added = 0, linked = 0;
    const puts: Student[] = [];
    for (const c of list) {
      const last = c.familyName || c.fullName, first = c.givenName;
      const ex = byUser.get(c.userId) ?? (c.email ? byMail.get(c.email.toLowerCase()) : undefined) ?? byName.get(name(last, first));
      if (ex) {
        if (ex.classroomUserId !== c.userId || (!ex.email && c.email)) {
          puts.push({ ...ex, classroomUserId: c.userId, email: ex.email || c.email || undefined, updatedAt: now });
          linked++;
        }
      } else {
        puts.push({ id: uid(), groupId: group.id, lastName: last, firstName: first, email: c.email || undefined, classroomUserId: c.userId, updatedAt: now });
        added++;
      }
    }
    await db.students.bulkPut(puts);
    await db.groups.put({ ...group, classroomCourseId: courseId, updatedAt: now });
    setMsg(`${list.length} alumnos en Classroom: ${added} nuevos, ${linked} enlazados o actualizados.`);
  });

  return (
    <div className="card">
      <b>Classroom</b>
      <p className="mute">{group.classroomCourseId ? 'Grupo enlazado a un curso de Classroom.' : 'Enlaza el grupo con un curso para importar alumnos, tareas y notas.'}</p>
      <div className="row">
        <button onClick={loadCourses} disabled={busy}>{courses ? 'Recargar cursos' : 'Cargar mis cursos'}</button>
        {courses && (
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` · ${c.section}` : ''}</option>)}
          </select>
        )}
        {courses && <button className="on" onClick={importStudents} disabled={busy || !courseId}>Importar alumnos</button>}
      </div>
      {msg && <p className="mute">{msg}</p>}
    </div>
  );
}

export function Groups({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const [gid, setGid] = useCurrentGroupId();
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const all = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = (all ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es'));
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');

  async function newGroup() {
    const name = prompt('Nombre del grupo (ej.: 1.º Bach. A)');
    if (!name?.trim()) return;
    const schoolYear = prompt('Curso escolar', '2026/27') || '2026/27';
    const id = uid();
    await db.groups.put({ id, subjectId: subject.id, name: name.trim(), schoolYear, updatedAt: Date.now() });
    setGid(id);
  }
  async function renameGroup() {
    const name = prompt('Nuevo nombre', group!.name);
    if (name?.trim()) await db.groups.put({ ...group!, name: name.trim(), updatedAt: Date.now() });
  }
  async function delGroup() {
    if (!confirm(`¿Borrar el grupo ${group!.name} con sus alumnos y actividades?`)) return;
    const now = Date.now();
    await db.transaction('rw', db.groups, db.students, db.activities, async () => {
      await db.groups.put({ ...group!, deleted: true, updatedAt: now });
      const st = await db.students.where('groupId').equals(group!.id).toArray();
      await db.students.bulkPut(st.map((s) => ({ ...s, deleted: true, updatedAt: now })));
      const ac = await db.activities.where('groupId').equals(group!.id).toArray();
      await db.activities.bulkPut(ac.map((a) => ({ ...a, deleted: true, updatedAt: now })));
    });
    setGid('');
  }
  async function importRows(text: string) {
    if (!group) return;
    const rows = parseStudents(text);
    const key = (r: Row) => (r.nia ? 'n' + r.nia : (r.lastName + r.firstName).toLowerCase());
    const have = new Set(students.map((s) => key(s)));
    const add = rows.filter((r) => !have.has(key(r)));
    const now = Date.now();
    await db.students.bulkPut(add.map((r) => ({ id: uid(), groupId: group.id, ...r, updatedAt: now })));
    setMsg(`${add.length} alumnos añadidos, ${rows.length - add.length} ya existían.`);
    setPaste('');
  }

  return (
    <div>
      <div className="row">
        <button onClick={newGroup}>+ Grupo</button>
        {group && <button className="small" onClick={renameGroup}>Renombrar</button>}
        {group && <button className="small" onClick={delGroup}>Borrar</button>}
      </div>
      {!group && <p className="mute">Crea un grupo para empezar.</p>}
      {group && (
        <>
          <div className="card">
            <b>{students.length} alumnos</b>
            {students.length === 0 && <p className="mute">Aún no hay alumnos: impórtalos de una lista, de un CSV o de Classroom.</p>}
            {students.map((s) => <StudentRow key={s.id + s.updatedAt} s={s} />)}
            <button className="small" onClick={() => db.students.put({ id: uid(), groupId: group.id, firstName: 'Nombre', lastName: 'Apellidos', updatedAt: Date.now() })}>+ Alumno</button>
          </div>
          <details className="card sect" open={students.length === 0}>
            <summary>Importar alumnos de una lista o CSV</summary>
            <div className="inner form">
              <p className="mute">Una línea por alumno: Apellidos, Nombre, correo, NIA (separadores coma, punto y coma o tabulador). Pega la lista o sube un CSV.</p>
              <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="García López, Ana, ana@correo.es, 123456" />
              <div className="row">
                <button className="on" disabled={!paste.trim()} onClick={() => importRows(paste)}>Importar</button>
                <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPaste(await f.text()); }} />
              </div>
              {msg && <p className="mute">{msg}</p>}
            </div>
          </details>
          <ClassroomImport key={group.id + (group.classroomCourseId ?? '')} group={group} students={students} />
        </>
      )}
    </div>
  );
}
