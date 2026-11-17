import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveNode, saveSubject } from '../data/db';
import { KEY_COMPETENCES, keyCompetence } from '../catalogs/descriptors';
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
          {others.map(({ s, items: xs }) => <button key={s.id} className="small" onClick={() => add(xs.map((n) => ({ code: n.code, text: n.title, keyComps: n.keyComps })))}>{s.name} ({xs.length})</button>)}
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
 * Objetivos de etapa y las competencias clave con las que se vinculan (perfil de salida). La materia contribuye a un
 * objetivo a través de sus competencias específicas: las que tienen descriptores de esas competencias clave.
 */
export function Objectives({ subject, nodes, links }: { subject: Subject; nodes: CNode[]; links: CLink[] }) {
  const objs = nodes.filter((n) => n.level === 'obj');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ces = nodes.filter((n) => n.level === 'ce');
  // Competencias clave de cada competencia específica, a través de sus descriptores.
  const kcOf = (ce: CNode) => new Set(links.filter((l) => !l.deleted && l.fromId === ce.id).map((l) => byId.get(l.toId)).filter((d): d is CNode => d?.level === 'desc').map((d) => d.group ?? keyCompetence(d.code)));
  const toggle = (o: CNode, k: string) => {
    const cur = o.keyComps ?? [];
    saveNode({ ...o, keyComps: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  if (!objs.length) return <div className="card"><b>Objetivos de etapa</b><AddObjectives subject={subject} nodes={nodes} /></div>;
  return (
    <div>
      <p className="mute">Marca las competencias clave con las que se vincula cada objetivo. La materia contribuye a través de las competencias específicas que tienen descriptores de esas competencias clave. No cuentan para la nota.</p>
      {objs.map((o) => {
        const kc = o.keyComps ?? [];
        const via = ces.filter((c) => kc.some((k) => kcOf(c).has(k)));
        return (
          <div className="card" key={o.id}>
            <p><b>{o.code})</b> {o.title}</p>
            <div className="chips">
              {KEY_COMPETENCES.map(([k, name]) => (
                <button key={k} title={name} className={'chip obs' + (kc.includes(k) ? ' pos' : '')} aria-pressed={kc.includes(k)} onClick={() => toggle(o, k)}>{k}</button>
              ))}
            </div>
            {kc.length > 0 && <p className="mute">{via.length ? `Contribuyen: ${via.map((c) => c.code).join(', ')}` : 'Ninguna competencia específica de la materia tiene descriptores de estas competencias clave.'}</p>}
          </div>
        );
      })}
      <details className="card"><summary>Añadir objetivos</summary><AddObjectives subject={subject} nodes={nodes} /></details>
    </div>
  );
}
