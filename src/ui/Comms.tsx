import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { callScript } from '../data/api';
import { useGroups, useNodes } from './hooks';
import { finalResult, indexGrades, noGrades, profile, round } from '../core/evaluation';
import { criteriaText } from '../core/report';
import type { Student, Subject, Template } from '../core/model';

const DEFAULTS: Omit<Template, 'updatedAt'>[] = [
  { id: 'def-falta', name: 'Aviso de falta', subject: 'Aviso de faltas de asistencia – {{materia}}',
    body: 'Hola {{nombre}},\n\nTe escribo porque llevas {{faltas}} faltas de asistencia injustificadas en {{materia}}. Recuerda que superar el 20 % supone la pérdida de la evaluación continua.\n\nSi tienes justificantes, entrégamelos en la próxima clase.\n\nUn saludo.' },
  { id: 'def-entrega', name: 'Entrega pendiente', subject: 'Entrega pendiente – {{materia}}',
    body: 'Hola {{nombre}},\n\nTienes trabajos pendientes de entrega en {{materia}}. Revisa Classroom y entrégalos lo antes posible.\n\nUn saludo.' },
  { id: 'def-eval', name: 'Resultado de evaluación', subject: 'Resultado de evaluación – {{materia}}',
    body: 'Hola {{nombre}},\n\nTu nota actual en {{materia}} es {{nota}}.\n\nCriterios evaluados:\n{{criterio}}\n\nUn saludo.' },
];

const render = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k] ?? '');

export function Comms({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const lkRaw = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const tplRaw = useLiveQuery(() => db.templates.toArray());
  const templates = useMemo(() => (tplRaw ?? []).filter((t) => !t.deleted), [tplRaw]);
  const [tplId, setTplId] = useState('');
  const [kind, setKind] = useState<'mail' | 'announcement'>('mail');
  const [subj, setSubj] = useState('');
  const [body, setBody] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = useMemo(() => (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es')), [stRaw]);
  const attRaw = useLiveQuery(() => (group ? db.attendance.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const acRaw = useLiveQuery(() => (group ? db.activities.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const acts = useMemo(() => (acRaw ?? []).filter((a) => !a.deleted), [acRaw]);
  const key = acts.map((a) => a.id).join(',');
  const grRaw = useLiveQuery(() => (acts.length ? db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : []), [key]);
  const histRaw = useLiveQuery(() => (group ? db.messages.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const history = (histRaw ?? []).filter((m) => !m.deleted).sort((a, b) => b.sentAt - a.sentAt).slice(0, 30);

  useEffect(() => {
    if (tplRaw && tplRaw.length === 0 && !localStorage.getItem('tplSeeded')) {
      localStorage.setItem('tplSeeded', '1');
      db.templates.bulkPut(DEFAULTS.map((t) => ({ ...t, updatedAt: Date.now() }))).catch(console.error);
    }
  }, [tplRaw]);

  const vars = (s: Student): Record<string, string> => {
    const sg = indexGrades((grRaw ?? []).filter((x) => x.studentId === s.id)).get(s.id) ?? noGrades();
    const f = finalResult(subject, acts, sg, { nodes, links: lkRaw ?? [] });
    const prof = profile(subject, nodes, lkRaw ?? [], acts, sg);
    const faltas = (attRaw ?? []).filter((r) => !r.deleted && r.studentId === s.id && r.status === 'A').length;
    return {
      nombre: s.firstName, apellidos: s.lastName, grupo: group?.name ?? '', materia: subject.name,
      nota: f.value == null ? 'sin calificar' : String(round(f.value, subject.config.termDecimals)).replace('.', ','),
      faltas: String(faltas),
      criterio: criteriaText(subject, nodes, prof),
      criterios_pendientes: criteriaText(subject, nodes, prof, true),
    };
  };

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;
  const chosen = students.filter((s) => sel.includes(s.id));
  const first = chosen[0];
  const canAnnounce = !!group.classroomCourseId;

  function pickTemplate(id: string) {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) { setSubj(t.subject); setBody(t.body); }
  }
  async function saveTemplate() {
    const name = prompt('Nombre de la plantilla', templates.find((t) => t.id === tplId)?.name ?? '');
    if (!name?.trim()) return;
    const id = templates.find((t) => t.id === tplId && t.name === name.trim())?.id ?? uid();
    await db.templates.put({ id, name: name.trim(), subject: subj, body, updatedAt: Date.now() });
    setTplId(id);
  }
  async function log(status: 'ok' | 'error', info: string) {
    await db.messages.put({ id: uid(), groupId: group!.id, kind, subject: subj, body, targets: chosen.map((s) => s.id), sentAt: Date.now(), status, info, updatedAt: Date.now() });
  }
  async function send() {
    if (!chosen.length || !body.trim()) return;
    setBusy(true); setMsg('');
    try {
      if (kind === 'mail') {
        const withMail = chosen.filter((s) => s.email);
        if (!withMail.length) throw new Error('Ningún destinatario tiene correo.');
        if (!confirm(`Se enviarán ${withMail.length} correos individuales. ¿Continuar?`)) return;
        const r = await callScript<{ sent: number; remaining: number }>('mail.send', {
          messages: withMail.map((s) => ({ to: s.email, subject: render(subj, vars(s)), body: render(body, vars(s)) })),
        });
        const skipped = chosen.length - withMail.length;
        const info = `${r.sent} enviados, quedan ${r.remaining} hoy` + (skipped ? `; ${skipped} sin correo` : '');
        setMsg(info); await log('ok', info);
      } else {
        if (chosen.length > 1 && /\{\{/.test(subj + body)) throw new Error('Los marcadores {{…}} solo funcionan en correo o con un único alumno.');
        const all = chosen.length === students.length;
        const ids = chosen.map((s) => s.classroomUserId).filter((x): x is string => !!x);
        if (!all && ids.length !== chosen.length) throw new Error('Algún alumno no está enlazado con Classroom (importa los alumnos antes).');
        if (!confirm(all ? 'Se publicará en el tablón para toda la clase. ¿Continuar?' : `Se publicará para ${ids.length} alumnos. ¿Continuar?`)) return;
        const text = render([subj, body].filter(Boolean).join('\n\n'), first ? vars(first) : {});
        await callScript('classroom.announce', { courseId: group!.classroomCourseId, text, ...(all ? {} : { studentIds: ids }) });
        setMsg('Publicado en el tablón.'); await log('ok', 'Publicado en el tablón');
      }
    } catch (e) {
      setMsg('Error: ' + (e as Error).message);
      await log('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <select value={group.id} onChange={(e) => { setGid(e.target.value); setSel([]); }}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className={kind === 'mail' ? 'on' : ''} onClick={() => setKind('mail')}>Correo</button>
        <button className={kind === 'announcement' ? 'on' : ''} disabled={!canAnnounce} onClick={() => setKind('announcement')} title={canAnnounce ? '' : 'Enlaza el grupo con Classroom en Grupos'}>Tablón</button>
      </div>

      <div className="card form">
        <div className="row" style={{ margin: 0 }}>
          <select value={tplId} onChange={(e) => pickTemplate(e.target.value)}>
            <option value="">Mensaje libre</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="small" onClick={saveTemplate}>Guardar plantilla</button>
          {tplId && <button className="small" onClick={() => { const t = templates.find((x) => x.id === tplId); if (t && confirm(`¿Borrar “${t.name}”?`)) { softDelete(db.templates, t); setTplId(''); } }}>Borrar plantilla</button>}
        </div>
        <input placeholder={kind === 'mail' ? 'Asunto' : 'Título (opcional)'} value={subj} onChange={(e) => setSubj(e.target.value)} />
        <textarea rows={6} placeholder="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mute">Marcadores: {'{{nombre}} {{apellidos}} {{grupo}} {{materia}} {{nota}} {{faltas}} {{criterio}} {{criterios_pendientes}}'}</p>
        <p className="mute">{'{{criterio}}'}: una línea por criterio evaluado con su nota (todo el curso). {'{{criterios_pendientes}}'}: solo los que no llegan al aprobado.</p>
      </div>

      <div className="card">
        <div className="sp">
          <b>Destinatarios ({chosen.length}/{students.length})</b>
          <span className="row" style={{ margin: 0 }}>
            <button className="small" onClick={() => setSel(students.map((s) => s.id))}>Todos</button>
            <button className="small" onClick={() => setSel([])}>Ninguno</button>
          </span>
        </div>
        <div className="picker">
          {students.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />
              <span>{s.lastName}, {s.firstName} <span className="mute">{kind === 'mail' ? (s.email ?? 'sin correo') : (s.classroomUserId ? '' : 'sin enlazar')}</span></span>
            </label>
          ))}
        </div>
      </div>

      {first && body && (
        <div className="card">
          <b>Vista previa · {first.firstName}</b>
          {subj && <p><b>{render(subj, vars(first))}</b></p>}
          <pre>{render(body, vars(first))}</pre>
        </div>
      )}

      <div className="row">
        <button className="on" disabled={busy || !chosen.length || !body.trim()} onClick={send}>{kind === 'mail' ? 'Enviar correos' : 'Publicar en el tablón'}</button>
      </div>
      {msg && <p className={msg.startsWith('Error') ? 'warn' : 'mute'}>{msg}</p>}

      <h3>Historial</h3>
      <div className="card">
        {history.length === 0 && <p className="mute">Sin envíos.</p>}
        {history.map((m) => (
          <div className="issue sp" key={m.id}>
            <span>{new Date(m.sentAt).toLocaleString('es-ES')} · {m.kind === 'mail' ? 'Correo' : 'Tablón'} · {m.subject || m.body.slice(0, 40)} <span className="mute">· {m.targets.length} dest.</span></span>
            <span className={m.status === 'ok' ? 'mute' : 'warn'} title={m.info}>{m.status === 'ok' ? 'OK' : 'Error'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
