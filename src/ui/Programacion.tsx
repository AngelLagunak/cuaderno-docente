import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSubject } from '../data/db';
import { PD_SECTIONS, defaultNorm, parsePdTexts, pdBase, pdDocument, pdHtml, pdIssues, pdPrompt } from '../core/pd';
import type { PdData } from '../core/pd';
import { plannedSessions } from '../core/planning';
import type { PdInfo, Subject } from '../core/model';
import { useCurrentGroupId, useGroups, useNodes, useSchoolCalendar } from './hooks';

/**
 * Programación didáctica lista para entregar: los apartados de currículo, unidades, instrumentos y calificación salen
 * de los datos de la app; el resto se redacta aquí (con texto base o con una IA). Se imprime o se descarga para Word.
 */
export function Programacion({ subject }: { subject: Subject }) {
  const nodes = useNodes(subject.id);
  const groups = useGroups(subject.id);
  const [gid] = useCurrentGroupId();
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const cal = useSchoolCalendar(group?.schoolYear);
  const [info, setInfo] = useState<PdInfo>(() => ({ norm: defaultNorm(subject), year: '', ...subject.pd, texts: { ...subject.pd?.texts } }));
  const [tab, setTab] = useState<'edit' | 'doc'>('edit');
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState('');
  const saved = useRef(JSON.stringify(subject.pd ?? {}));

  const raw = useLiveQuery(async () => {
    const [links, units, activities, rubrics, sessions] = await Promise.all([
      db.links.where('subjectId').equals(subject.id).toArray(), db.units.where('subjectId').equals(subject.id).toArray(),
      db.activities.where('subjectId').equals(subject.id).toArray(), db.rubrics.where('subjectId').equals(subject.id).toArray(),
      group ? db.sessions.where('groupId').equals(group.id).toArray() : Promise.resolve([]),
    ]);
    return { links, units, activities, rubrics, sessions };
  }, [subject.id, group?.id]);

  // Guardado automático (medio segundo después de escribir).
  useEffect(() => {
    const json = JSON.stringify(info);
    if (json === saved.current) return;
    const t = setTimeout(() => { saved.current = json; saveSubject({ ...subject, pd: info }); }, 500);
    return () => clearTimeout(t);
  }, [info, subject]);

  if (!raw) return null;
  const planned = group ? plannedSessions(cal, group.timetable ?? [], group.holidays) : null;
  const d: PdData = { subject, nodes, ...raw, planned: planned?.byTerm.map((x) => x ?? 0) };
  const issues = pdIssues(d, info);
  const set = (k: keyof PdInfo, v: string) => setInfo({ ...info, [k]: v });
  const setText = (k: string, v: string) => setInfo({ ...info, texts: { ...info.texts, [k]: v } });

  function fillBase() {
    const base = pdBase(subject);
    const texts = { ...info.texts };
    let n = 0;
    for (const [k, v] of Object.entries(base)) if (!texts[k]?.trim()) { texts[k] = v; n++; }
    setInfo({ ...info, texts });
    setMsg(n ? `Texto base puesto en ${n} apartados vacíos. Revísalo y adáptalo.` : 'Todos los apartados ya tienen texto.');
  }
  function readAI() {
    try {
      const r = parsePdTexts(answer);
      setInfo({ ...info, texts: { ...info.texts, ...r } });
      setMsg(`Puestos ${Object.keys(r).length} apartados. Revísalos antes de entregar.`); setAnswer('');
    } catch (e) { setMsg((e as Error).message); }
  }
  function download() {
    const blob = new Blob(['﻿', pdDocument(d, info)], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Programación ${subject.name} ${info.year || ''}`.trim().replace(/[\\/:*?"<>|]/g, '-') + '.doc';
    a.click();
  }
  const prompt = pdPrompt(d, info);

  return (
    <div className="pd">
      <div className="row noprint">
        <div className="seg" role="group" aria-label="Vista">
          <button aria-pressed={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Redactar</button>
          <button aria-pressed={tab === 'doc'} className={tab === 'doc' ? 'on' : ''} onClick={() => setTab('doc')}>Documento</button>
        </div>
        <button className="small" onClick={() => { setTab('doc'); setTimeout(() => window.print(), 100); }}>Imprimir / PDF</button>
        <button className="small" onClick={download}>Descargar para Word</button>
      </div>

      <section className={'card noprint ' + (issues.length ? 'warnbox' : 'okbox')}>
        <b>{issues.length ? (issues.length === 1 ? 'Falta 1 cosa para entregarla' : `Faltan ${issues.length} cosas para entregarla`) : 'Lista para entregar'}</b>
        {issues.length > 0 && <ul>{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
        <p className="mute">Apartados según las órdenes de currículo de Aragón (ESO y Bachillerato). Comprueba con tu centro si pide algún formato o apartado más.</p>
      </section>

      {tab === 'edit' ? (
        <div className="form">
          <details className="card sect" open={!info.centre || !info.teacher}>
            <summary>Datos de la portada</summary>
            <div className="pdHead">
              <label>Centro<input value={info.centre ?? ''} onChange={(e) => set('centre', e.target.value)} /></label>
              <label>Departamento<input value={info.department ?? ''} onChange={(e) => set('department', e.target.value)} /></label>
              <label>Profesor/a<input value={info.teacher ?? ''} onChange={(e) => set('teacher', e.target.value)} /></label>
              <label>Curso escolar<input placeholder={cal?.id ?? '2026/27'} value={info.year ?? ''} onChange={(e) => set('year', e.target.value)} /></label>
            </div>
            <label>Normativa<input value={info.norm ?? ''} onChange={(e) => set('norm', e.target.value)} /></label>
          </details>

          <details className="card sect">
            <summary>Redactar con ayuda</summary>
            <p className="mute">Rápido: pon un texto base en los apartados vacíos y adáptalo.</p>
            <div className="row"><button className="small" onClick={fillBase}>Poner texto base</button></div>
            <p className="mute">Mejor: copia este texto en una IA (Claude, ChatGPT, Gemini…), pega aquí su respuesta y pulsa «Leer». Sustituye los apartados que traiga.</p>
            <textarea rows={5} readOnly value={prompt} onFocus={(e) => e.target.select()} />
            <div className="row"><button className="small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setMsg('Prompt copiado.'), () => setMsg('No se pudo copiar: selecciónalo y cópialo a mano.'))}>Copiar prompt</button></div>
            <textarea rows={4} placeholder='{ "e": "…", "f": "…" }' value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <div className="row"><button className="small" disabled={!answer.trim()} onClick={readAI}>Leer</button></div>
          </details>
          {msg && <p className="mute">{msg}</p>}

          {PD_SECTIONS.map((sec) => (
            <section key={sec.key} className="card">
              <h2 className="h2">{sec.key}) {sec.title}</h2>
              <p className="mute">{sec.auto ? `${sec.hint} Puedes añadir texto debajo.` : sec.hint}</p>
              <textarea rows={sec.auto ? 2 : 5} placeholder={sec.auto ? 'Texto adicional (opcional)' : 'Redacta este apartado'} value={info.texts?.[sec.key] ?? ''} onChange={(e) => setText(sec.key, e.target.value)} />
            </section>
          ))}
        </div>
      ) : (
        <article className="card pdDoc" dangerouslySetInnerHTML={{ __html: pdHtml(d, info) }} />
      )}
    </div>
  );
}
