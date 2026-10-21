import { useState } from 'react';
import { db, saveSubject } from '../data/db';
import { curriculumPrompt, curriculumRecords, parseCurriculum } from '../core/subjects';
import type { CNode, Subject } from '../core/model';

/** Cargar el currículo de la asignatura con una IA: prompt para copiar, pegar su respuesta (JSON) y añadir. */
export function CurriculumAI({ subject, nodes }: { subject: Subject; nodes: CNode[] }) {
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState<ReturnType<typeof curriculumRecords> | null>(null);
  const prompt = curriculumPrompt(subject.name, subject.course || 'el curso');

  function read() {
    try {
      const r = curriculumRecords(subject, parseCurriculum(answer), nodes);
      setRes(r);
      const by = (l: string) => r.nodes.filter((n) => n.level === l).length;
      setMsg(r.nodes.length || r.links.length
        ? `Nuevos: ${by('ce')} competencias específicas, ${by('crit')} criterios, ${by('desc')} descriptores, ${by('saber')} saberes y ${r.links.length} vínculos. Los que ya existen no se tocan.`
        : 'Todo lo de la respuesta ya está en la asignatura.');
    } catch (e) { setRes(null); setMsg((e as Error).message); }
  }
  async function add() {
    if (!res) return;
    if (JSON.stringify(res.subject.levels) !== JSON.stringify(subject.levels) || JSON.stringify(res.subject.relations) !== JSON.stringify(subject.relations)) await saveSubject(res.subject);
    await db.nodes.bulkPut(res.nodes);
    await db.links.bulkPut(res.links);
    setMsg(`Añadidos ${res.nodes.length} elementos y ${res.links.length} vínculos. Revísalos en Elementos y en Revisión.`);
    setRes(null); setAnswer('');
  }
  return (
    <details className="card">
      <summary>Cargar el currículo con una IA</summary>
      <div className="form">
        <p className="mute">1. Copia este texto en una IA con búsqueda web (Claude, ChatGPT, Gemini…). Adjúntale el PDF del currículo si lo tienes: será más fiable.</p>
        <textarea rows={6} readOnly value={prompt} onFocus={(e) => e.target.select()} />
        <div className="row"><button className="small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setMsg('Prompt copiado.'), () => setMsg('No se pudo copiar: selecciónalo y cópialo a mano.'))}>Copiar prompt</button></div>
        <p className="mute">2. Pega aquí su respuesta (el JSON) y pulsa «Leer». Comprueba los textos con el BOA.</p>
        <textarea rows={6} placeholder='{ "competencias": [ … ] }' value={answer} onChange={(e) => { setAnswer(e.target.value); setRes(null); }} />
        <div className="row">
          <button className="small" disabled={!answer.trim()} onClick={read}>Leer</button>
          {res && (res.nodes.length > 0 || res.links.length > 0) && <button className="on" onClick={add}>Añadir a la asignatura</button>}
        </div>
        {msg && <p className="mute">{msg}</p>}
      </div>
    </details>
  );
}
