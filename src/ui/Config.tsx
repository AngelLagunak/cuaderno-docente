import { useState } from 'react';
import { db, saveSubject } from '../data/db';
import type { Subject } from '../core/model';

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nivel';
const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

export function Config({ subject }: { subject: Subject }) {
  const [d, setD] = useState<Subject>(() => JSON.parse(JSON.stringify(subject)));
  const [saved, setSaved] = useState(false);
  const [rf, setRf] = useState(subject.levels[0]?.key ?? '');
  const [rt, setRt] = useState(subject.levels[1]?.key ?? subject.levels[0]?.key ?? '');
  const set = (p: Partial<Subject>) => { setD((x) => ({ ...x, ...p })); setSaved(false); };
  const cfg = (p: Partial<Subject['config']>) => set({ config: { ...d.config, ...p } });
  const sum = (a: { weight: number }[]) => a.reduce((s, x) => s + x.weight, 0);
  const lbl = (k: string) => d.levels.find((l) => l.key === k)?.label ?? k;

  async function delInstrument(id: string) {
    const n = await db.activities.where('subjectId').equals(d.id).filter((a) => !a.deleted && a.instrumentId === id).count();
    if (n) return alert(`Hay ${n} actividades con este instrumento. Cámbialas antes.`);
    set({ instruments: d.instruments.filter((i) => i.id !== id) });
  }
  async function delTerm(id: string) {
    const n = await db.activities.where('subjectId').equals(d.id).filter((a) => !a.deleted && a.termId === id).count();
    if (n) return alert(`Hay ${n} actividades en esta evaluación. Cámbialas antes.`);
    set({ terms: d.terms.filter((t) => t.id !== id) });
  }
  async function delLevel(key: string) {
    const n = await db.nodes.where('subjectId').equals(d.id).filter((x) => !x.deleted && x.level === key).count();
    if (n) return alert(`Hay ${n} elementos en este nivel. Bórralos antes.`);
    set({ levels: d.levels.filter((l) => l.key !== key), relations: d.relations.filter((r) => r.from !== key && r.to !== key) });
  }
  function addLevel() {
    const label = prompt('Nombre del nivel (ej.: Criterio de evaluación)');
    if (!label?.trim()) return;
    const plural = prompt('Nombre en plural', label.trim() + 's') || label.trim();
    let key = slug(label);
    while (d.levels.some((l) => l.key === key)) key += '-2';
    set({ levels: [...d.levels, { key, label: label.trim(), plural: plural.trim() }] });
  }
  function addRelation() {
    const key = `${rf}-${rt}`;
    if (!rf || !rt || rf === rt || d.relations.some((r) => r.key === key)) return alert('Relación no válida o repetida.');
    set({ relations: [...d.relations, { key, from: rf, to: rt }] });
  }
  const updLevel = (i: number, p: object) => set({ levels: d.levels.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const updRel = (i: number, p: object) => set({ relations: d.relations.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  return (
    <div>
      <div className="card form">
        <label>Nombre<input className="full" value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>Curso<input className="full" value={d.course} onChange={(e) => set({ course: e.target.value })} /></label>
      </div>

      <h3>Instrumentos de evaluación <span className="mute">(suma {sum(d.instruments)})</span></h3>
      <div className="card">
        {d.instruments.map((i, k) => (
          <div className="grid2" key={i.id}>
            <input value={i.name} onChange={(e) => set({ instruments: d.instruments.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
            <input type="number" min={0} value={i.weight} onChange={(e) => set({ instruments: d.instruments.map((x, j) => (j === k ? { ...x, weight: num(e.target.value) } : x)) })} />
            <button className="small" onClick={() => delInstrument(i.id)}>×</button>
          </div>
        ))}
        <button className="small" onClick={() => set({ instruments: [...d.instruments, { id: 'i' + Date.now().toString(36), name: 'Nuevo instrumento', weight: 0 }] })}>+ Instrumento</button>
        <p className="mute">Los pesos son relativos: no hace falta que sumen 100.</p>
      </div>

      <h3>Evaluaciones <span className="mute">(suma {sum(d.terms)})</span></h3>
      <div className="card">
        {d.terms.map((t, k) => (
          <div className="grid2" key={t.id}>
            <input value={t.name} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
            <input type="number" min={0} value={t.weight} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === k ? { ...x, weight: num(e.target.value) } : x)) })} />
            <button className="small" onClick={() => delTerm(t.id)}>×</button>
          </div>
        ))}
        <button className="small" onClick={() => set({ terms: [...d.terms, { id: 't' + Date.now().toString(36), name: 'Nueva evaluación', weight: 0 }] })}>+ Evaluación</button>
      </div>

      <h3>Cálculo</h3>
      <div className="card form">
        <label>Nota de aprobado <input className="num" type="number" step="0.5" value={d.config.passMark} onChange={(e) => cfg({ passMark: num(e.target.value, 5) })} /></label>
        <label>Decimales en evaluaciones <input className="num" type="number" min={0} max={3} value={d.config.termDecimals} onChange={(e) => cfg({ termDecimals: num(e.target.value) })} /></label>
        <label>Decimales en la nota final <input className="num" type="number" min={0} max={3} value={d.config.finalDecimals} onChange={(e) => cfg({ finalDecimals: num(e.target.value) })} /></label>
        <label><input type="checkbox" style={{ width: 'auto' }} checked={d.config.minPerInstrument} onChange={(e) => cfg({ minPerInstrument: e.target.checked })} /> Cada instrumento debe llegar al aprobado</label>
        <label>Penalización por entrega tardía (%) <input className="num" type="number" min={0} max={100} value={d.config.latePenaltyPct} onChange={(e) => cfg({ latePenaltyPct: num(e.target.value) })} /></label>
      </div>

      <h3>Estructura curricular</h3>
      <div className="card">
        <b className="mute">Niveles</b>
        {d.levels.map((l, i) => (
          <div className="form" key={l.key} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <input value={l.label} onChange={(e) => updLevel(i, { label: e.target.value })} />
            <input value={l.plural} onChange={(e) => updLevel(i, { plural: e.target.value })} />
            <div className="row" style={{ margin: 0 }}>
              <label><input type="checkbox" style={{ width: 'auto' }} checked={!!l.graded} onChange={(e) => updLevel(i, { graded: e.target.checked })} /> Evaluable</label>
              <button className="small" onClick={() => delLevel(l.key)}>Quitar</button>
            </div>
          </div>
        ))}
        <button className="small" onClick={addLevel}>+ Nivel</button>

        <p><b className="mute">Relaciones</b></p>
        {d.relations.map((r, i) => (
          <div className="form" key={r.key} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <b>{lbl(r.from)} → {lbl(r.to)}</b>
            <label><input type="checkbox" style={{ width: 'auto' }} checked={!!r.aggregate} onChange={(e) => updRel(i, { aggregate: e.target.checked })} /> El valor sube a {lbl(r.to).toLowerCase()} (radar)</label>
            <label><input type="checkbox" style={{ width: 'auto' }} checked={!!r.needFrom} onChange={(e) => updRel(i, { needFrom: e.target.checked })} /> Avisar si {lbl(r.from).toLowerCase()} sin enlace</label>
            <label><input type="checkbox" style={{ width: 'auto' }} checked={!!r.needTo} onChange={(e) => updRel(i, { needTo: e.target.checked })} /> Avisar si {lbl(r.to).toLowerCase()} sin enlace</label>
            <button className="small" onClick={() => set({ relations: d.relations.filter((_, j) => j !== i) })}>Quitar relación</button>
          </div>
        ))}
        <div className="row">
          <select value={rf} onChange={(e) => setRf(e.target.value)}>{d.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          →
          <select value={rt} onChange={(e) => setRt(e.target.value)}>{d.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <button className="small" onClick={addRelation}>+ Relación</button>
        </div>
      </div>

      <div className="row">
        <button className="on" onClick={async () => { await saveSubject(d); setSaved(true); }}>Guardar configuración</button>
        {saved && <span className="mute">Guardado</span>}
      </div>
    </div>
  );
}
