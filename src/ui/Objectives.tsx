import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSubject, setLink } from '../data/db';
import { objectivesPrompt, objectivesRecords, parseObjectives } from '../core/subjects';
import type { CLink, CNode, Subject } from '../core/model';

/** Pegar los objetivos (de la IA o del BOA) o copiarlos de otra asignatura de la misma etapa. */
function AddObjectives({ subject, nodes }: { subject: Subject; nodes: CNode[] }) {
  const stage = subject.kind === 'eso' ? 'ESO' : subject.kind === 'fp' ? 'Formación Profesional' : 'Bachillerato';
  const others = useLiveQuery(async () => {
    const os = (await db.nodes.where('level').equals('obj').toArray()).filter((n) => !n.deleted && n.subjectId !== subject.id);
    const subs = await db.subjects.toArray();
    return subs.filter((s) => !s.deleted && os.some((n) => n.subjectId === s.id)).map((s) => ({ s, items: os.filter((n) => n.subjectId === s.id).sort((a, b) => a.order - b.order) }));
  }, [subject.id]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const prompt = objectivesPrompt(stage);
  const items = parseObjectives(text);

  async function add(list: { code: string; text: string }[]) {
    const r = objectivesRecords(subject, list, nodes);
    if (JSON.stringify(r.subject.levels) !== JSON.stringify(subject.levels) || JSON.stringify(r.subject.relations) !== JSON.stringify(subject.relations)) await saveSubject(r.subject);
    await db.nodes.bulkPut(r.nodes);
    setMsg(`Añadidos ${r.nodes.length} objetivos.`);
    setText('');
  }
  return (
    <div className="form">
      {others && others.length > 0 && (
        <div className="row">
          <span className="mute">Copiar de:</span>
          {others.map(({ s, items: xs }) => <button key={s.id} className="small" onClick={() => add(xs.map((n) => ({ code: n.code, text: n.title })))}>{s.name} ({xs.length})</button>)}
        </div>
      )}
      <p className="mute">O pega la lista del BOA (una línea por objetivo: «a) …»). Si no la tienes a mano, copia este prompt en una IA:</p>
      <textarea rows={3} readOnly value={prompt} onFocus={(e) => e.target.select()} />
      <div className="row"><button className="small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setMsg('Prompt copiado.'), () => setMsg('No se pudo copiar.'))}>Copiar prompt</button></div>
      <textarea rows={6} placeholder={'a) Ejercer la ciudadanía democrática…\nb) …'} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button className="on" disabled={!items.length} onClick={() => add(items)}>Añadir {items.length || ''} objetivos</button>
        {msg && <span className="mute">{msg}</span>}
      </div>
      <p className="mute">Compara el texto con el BOA: la IA puede equivocarse.</p>
    </div>
  );
}

/**
 * Objetivos de etapa: el texto de cada uno y las competencias específicas de la materia que contribuyen a él
 * (un toque en cada competencia lo vincula o lo desvincula). No se evalúan.
 */
export function Objectives({ subject, nodes, links }: { subject: Subject; nodes: CNode[]; links: CLink[] }) {
  const rel = subject.relations.find((r) => r.to === 'obj');
  const objs = nodes.filter((n) => n.level === 'obj');
  const from = rel ? nodes.filter((n) => n.level === rel.from) : [];
  const on = (o: CNode, c: CNode) => links.some((l) => !l.deleted && l.relation === rel?.key && l.fromId === c.id && l.toId === o.id);
  if (!objs.length) return <div className="card"><b>Objetivos de etapa</b><AddObjectives subject={subject} nodes={nodes} /></div>;
  return (
    <div>
      <p className="mute">Marca qué {subject.levels.find((l) => l.key === rel?.from)?.plural.toLowerCase() ?? 'elementos'} contribuyen a cada objetivo. No cuentan para la nota.</p>
      {objs.map((o) => (
        <div className="card" key={o.id}>
          <p><b>{o.code})</b> {o.title}</p>
          <div className="chips">
            {from.map((c) => (
              <button key={c.id} title={c.title} className={'chip obs' + (on(o, c) ? ' pos' : '')} aria-pressed={on(o, c)} onClick={() => rel && setLink(subject.id, rel.key, c.id, o.id, !on(o, c))}>{c.code}</button>
            ))}
          </div>
        </div>
      ))}
      <details className="card"><summary>Añadir objetivos</summary><AddObjectives subject={subject} nodes={nodes} /></details>
    </div>
  );
}
