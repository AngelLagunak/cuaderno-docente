import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { useGroups } from './hooks';
import type { Student, Subject } from '../core/model';

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
        <span><b>{s.lastName}</b>, {s.firstName} <span className="mute">{[s.nia, s.email].filter(Boolean).join(' · ')}</span></span>
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

export function Groups({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const [gid, setGid] = useState('');
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
        <select value={group?.id ?? ''} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button onClick={newGroup}>+ Grupo</button>
        {group && <button className="small" onClick={renameGroup}>Renombrar</button>}
        {group && <button className="small" onClick={delGroup}>Borrar</button>}
      </div>
      {!group && <p className="mute">Crea un grupo para empezar.</p>}
      {group && (
        <>
          <div className="card">
            <b>Importar alumnos</b>
            <p className="mute">Una línea por alumno: Apellidos, Nombre, correo, NIA (separadores coma, punto y coma o tabulador). Pega la lista o sube un CSV.</p>
            <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="García López, Ana, ana@correo.es, 123456" />
            <div className="row">
              <button className="on" disabled={!paste.trim()} onClick={() => importRows(paste)}>Importar</button>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPaste(await f.text()); }} />
            </div>
            {msg && <p className="mute">{msg}</p>}
          </div>
          <div className="card">
            <b>{students.length} alumnos</b>
            {students.map((s) => <StudentRow key={s.id + s.updatedAt} s={s} />)}
            <button className="small" onClick={() => db.students.put({ id: uid(), groupId: group.id, firstName: 'Nombre', lastName: 'Apellidos', updatedAt: Date.now() })}>+ Alumno</button>
          </div>
        </>
      )}
    </div>
  );
}
