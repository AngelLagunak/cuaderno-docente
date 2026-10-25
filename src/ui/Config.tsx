import { useState } from 'react';
import { db, saveSubject, softDelete } from '../data/db';
import { defaultObservations } from '../core/model';
import type { ObsAspect, Subject } from '../core/model';
import { useSchoolCalendar } from './hooks';

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
  const obs = d.config.observations ?? defaultObservations();
  const setObs = (o: ObsAspect[]) => cfg({ observations: o });
  const cal = useSchoolCalendar();
  const ownDates = d.terms.some((t) => t.start || t.end);
  const [showDates, setShowDates] = useState(ownDates);
  const setTerm = (k: number, p: Partial<Subject['terms'][number]>) => set({ terms: d.terms.map((x, j) => (j === k ? { ...x, ...p } : x)) });

  async function removeSubject() {
    const n = await db.groups.where('subjectId').equals(d.id).filter((g) => !g.deleted).count();
    if (n) return alert(`La asignatura tiene ${n} grupos. Bórralos antes en la pestaña Grupos.`);
    if (!confirm(`¿Borrar la asignatura «${subject.name}» con su currículo y su configuración?`)) return;
    await softDelete(db.subjects, subject);
  }
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
      <details className="card sect" open><summary>Asignatura</summary>
      <div className="inner form">
        <label>Nombre<input className="full" value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>Curso<input className="full" value={d.course} onChange={(e) => set({ course: e.target.value })} /></label>
      </div></details>

      <details className="card sect"><summary>Instrumentos de evaluación <span className="mute">(suma {sum(d.instruments)})</span></summary>
      <div className="inner">
        {d.instruments.map((i, k) => (
          <div className="grid2" key={i.id}>
            <input value={i.name} onChange={(e) => set({ instruments: d.instruments.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
            <input type="number" min={0} value={i.weight} onChange={(e) => set({ instruments: d.instruments.map((x, j) => (j === k ? { ...x, weight: num(e.target.value) } : x)) })} />
            <button className="small" onClick={() => delInstrument(i.id)}>×</button>
          </div>
        ))}
        <button className="small" onClick={() => set({ instruments: [...d.instruments, { id: 'i' + Date.now().toString(36), name: 'Nuevo instrumento', weight: 0 }] })}>+ Instrumento</button>
        <p className="mute">Los pesos son relativos: no hace falta que sumen 100.</p>
      </div></details>

      <details className="card sect"><summary>Evaluaciones <span className="mute">(suma {sum(d.terms)})</span></summary>
      <div className="inner">
        {d.terms.map((t, k) => (
          <div className="grid2" key={t.id}>
            <input value={t.name} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
            <input type="number" min={0} value={t.weight} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === k ? { ...x, weight: num(e.target.value) } : x)) })} />
            <button className="small" onClick={() => delTerm(t.id)}>×</button>
          </div>
        ))}
        <button className="small" onClick={() => set({ terms: [...d.terms, { id: 't' + Date.now().toString(36), name: 'Nueva evaluación', weight: 0 }] })}>+ Evaluación</button>
        <label className="row"><input type="checkbox" checked={showDates} onChange={(e) => {
          setShowDates(e.target.checked);
          if (!e.target.checked) set({ terms: d.terms.map(({ start: _s, end: _e, ...x }) => x) });
          else if (!ownDates && cal && cal.terms.length === d.terms.length) set({ terms: d.terms.map((x, i) => ({ ...x, start: cal.terms[i].start || undefined, end: cal.terms[i].end || undefined })) });
        }} /> Fechas propias: esta asignatura no sigue las evaluaciones del calendario escolar (otro número de evaluaciones u otro final de curso)</label>
        {!showDates && cal && cal.terms.length !== d.terms.length && (
          <p className="warn">El calendario escolar tiene {cal.terms.length} evaluaciones y esta asignatura {d.terms.length}: marca «Fechas propias» y pon sus fechas para calcular bien las sesiones de cada evaluación.</p>
        )}
        {showDates && d.terms.map((t, k) => (
          <div className="row" key={t.id}>
            <b style={{ minWidth: 110 }}>{t.name}</b>
            <label>Del <input type="date" value={t.start ?? ''} onChange={(e) => setTerm(k, { start: e.target.value || undefined })} /></label>
            <label>al <input type="date" value={t.end ?? ''} onChange={(e) => setTerm(k, { end: e.target.value || undefined })} /></label>
          </div>
        ))}
        {showDates && <p className="mute">Las sesiones previstas, el seguimiento y el informe usan estas fechas; los días no lectivos siguen siendo los del calendario escolar. El curso de la asignatura termina el último día de su última evaluación.</p>}
      </div></details>

      <details className="card sect"><summary>Cálculo de la nota, recuperaciones y extraordinaria</summary>
      <div className="inner form">
        <label>Nota de aprobado <input className="num" type="number" step="0.5" value={d.config.passMark} onChange={(e) => cfg({ passMark: num(e.target.value, 5) })} /></label>
        <label>Decimales en evaluaciones <input className="num" type="number" min={0} max={3} value={d.config.termDecimals} onChange={(e) => cfg({ termDecimals: num(e.target.value) })} /></label>
        <label>Decimales en la nota final <input className="num" type="number" min={0} max={3} value={d.config.finalDecimals} onChange={(e) => cfg({ finalDecimals: num(e.target.value) })} /></label>
        <label>Nota final mínima (SIGAD no admite 0) <input className="num" type="number" min={0} max={10} value={d.config.minGrade ?? 1} onChange={(e) => cfg({ minGrade: num(e.target.value, 1) })} /></label>
        <label>Nota de cada evaluación
          <select value={d.config.gradeLevel ?? ''} onChange={(e) => cfg({ gradeLevel: e.target.value || null })}>
            <option value="">Media ponderada de instrumentos</option>
            {d.levels.map((l) => <option key={l.key} value={l.key}>Media de {l.plural.toLowerCase()} (los instrumentos ponderan las medidas de cada criterio)</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={d.config.minPerInstrument} onChange={(e) => cfg({ minPerInstrument: e.target.checked })} /> Avisar si alguna parte ({d.config.gradeLevel ? d.levels.find((l) => l.key === d.config.gradeLevel)?.plural.toLowerCase() : 'instrumentos'}) no llega al aprobado</label>
        <label>Penalización por entrega tardía (%) <input className="num" type="number" min={0} max={100} value={d.config.latePenaltyPct} onChange={(e) => cfg({ latePenaltyPct: num(e.target.value) })} /></label>
        <label>Aviso de faltas injustificadas (%) <input className="num" type="number" min={0} max={100} value={d.config.absenceWarnPct ?? 20} onChange={(e) => cfg({ absenceWarnPct: num(e.target.value, 20) })} /></label>
        <label>Escala de la nota final
          <select value={d.config.scale ?? 'num'} onChange={(e) => cfg({ scale: e.target.value as 'num' | 'ssapntsb' })}>
            <option value="num">Numérica</option>
            <option value="ssapntsb">Numérica + SS / AP / NT / SB</option>
          </select>
        </label>
        <label><input type="checkbox" checked={!!d.config.lateNoImprove} onChange={(e) => cfg({ lateNoImprove: e.target.checked })} /> Una entrega fuera de plazo sin justificar no se puede recuperar</label>
        <label>Pérdida de evaluación continua: carpeta % <input className="num" type="number" min={0} max={100} value={d.config.lec?.folderPct ?? 50} onChange={(e) => cfg({ lec: { folderPct: num(e.target.value), examPct: d.config.lec?.examPct ?? 50 } })} /></label>
        <label>Pérdida de evaluación continua: examen global % <input className="num" type="number" min={0} max={100} value={d.config.lec?.examPct ?? 50} onChange={(e) => cfg({ lec: { folderPct: d.config.lec?.folderPct ?? 50, examPct: num(e.target.value) } })} /></label>
        <label>Extraordinaria: proyectos % <input className="num" type="number" min={0} max={100} value={d.config.extra?.projectsPct ?? 40} onChange={(e) => cfg({ extra: { ...(d.config.extra ?? { projectsPct: 40, examPct: 60, minEach: 0 }), projectsPct: num(e.target.value) } })} /></label>
        <label>Extraordinaria: examen % <input className="num" type="number" min={0} max={100} value={d.config.extra?.examPct ?? 60} onChange={(e) => cfg({ extra: { ...(d.config.extra ?? { projectsPct: 40, examPct: 60, minEach: 0 }), examPct: num(e.target.value) } })} /></label>
        <label>Extraordinaria: nota mínima en cada parte para hacer media (0 = sin mínimo) <input className="num" type="number" min={0} max={10} step="0.5" value={d.config.extra?.minEach ?? 0} onChange={(e) => cfg({ extra: { ...(d.config.extra ?? { projectsPct: 40, examPct: 60, minEach: 0 }), minEach: num(e.target.value) } })} /></label>
        <label>Sesiones anuales previstas (0 = las del calendario escolar y el horario del grupo) <input className="num" type="number" min={0} value={d.config.annualSessions ?? 0} onChange={(e) => cfg({ annualSessions: num(e.target.value) })} /></label>
      </div></details>

      <details className="card sect"><summary>Observaciones del aula</summary>
      <div className="inner form">
        <p className="mute">Se marcan al pasar lista (Asistencia) y dan la nota de las actividades «Nota desde las observaciones del aula»: base + paso por cada marca positiva − paso por cada negativa.</p>
        {obs.map((o, k) => (
          <div className="row" key={o.id}>
            <select value={o.sign} onChange={(e) => setObs(obs.map((x, j) => (j === k ? { ...x, sign: Number(e.target.value) as 1 | -1 } : x)))}>
              <option value={1}>+ suma</option>
              <option value={-1}>− resta</option>
            </select>
            <input value={o.label} onChange={(e) => setObs(obs.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} />
            <button className="small" onClick={() => setObs(obs.filter((_, j) => j !== k))}>×</button>
          </div>
        ))}
        <div className="row"><button className="small" onClick={() => setObs([...obs, { id: 'o' + Date.now().toString(36), label: 'Nueva observación', sign: 1 }])}>+ Observación</button></div>
        <label>Nota base (sin marcas) <input className="num" type="number" min={0} max={10} step="0.5" value={d.config.obsBase ?? 6} onChange={(e) => cfg({ obsBase: num(e.target.value, 6) })} /></label>
        <label>Paso por marca <input className="num" type="number" min={0} max={10} step="0.25" value={d.config.obsStep ?? 0.5} onChange={(e) => cfg({ obsStep: num(e.target.value, 0.5) })} /></label>
      </div></details>

      <details className="card sect"><summary>Estructura curricular (avanzado)</summary>
      <div className="inner">
        <b className="mute">Niveles</b>
        {d.levels.map((l, i) => (
          <div className="form" key={l.key} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <input value={l.label} onChange={(e) => updLevel(i, { label: e.target.value })} />
            <input value={l.plural} onChange={(e) => updLevel(i, { plural: e.target.value })} />
            <div className="row" style={{ margin: 0 }}>
              <label><input type="checkbox" checked={!!l.graded} onChange={(e) => updLevel(i, { graded: e.target.checked })} /> Evaluable</label>
              <button className="small" onClick={() => delLevel(l.key)}>Quitar</button>
            </div>
          </div>
        ))}
        <button className="small" onClick={addLevel}>+ Nivel</button>

        <p><b className="mute">Relaciones</b></p>
        {d.relations.map((r, i) => (
          <div className="form" key={r.key} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <b>{lbl(r.from)} → {lbl(r.to)}</b>
            <label><input type="checkbox" checked={!!r.aggregate} onChange={(e) => updRel(i, { aggregate: e.target.checked })} /> El valor sube a {lbl(r.to).toLowerCase()} (radar)</label>
            <label><input type="checkbox" checked={!!r.needFrom} onChange={(e) => updRel(i, { needFrom: e.target.checked })} /> Avisar si {lbl(r.from).toLowerCase()} sin enlace</label>
            <label><input type="checkbox" checked={!!r.needTo} onChange={(e) => updRel(i, { needTo: e.target.checked })} /> Avisar si {lbl(r.to).toLowerCase()} sin enlace</label>
            <button className="small" onClick={() => set({ relations: d.relations.filter((_, j) => j !== i) })}>Quitar relación</button>
          </div>
        ))}
        <div className="row">
          <select value={rf} onChange={(e) => setRf(e.target.value)}>{d.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          →
          <select value={rt} onChange={(e) => setRt(e.target.value)}>{d.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <button className="small" onClick={addRelation}>+ Relación</button>
        </div>
      </div></details>

      <div className="row savebar">
        <button className="on" onClick={async () => { await saveSubject(d); setSaved(true); }}>Guardar configuración</button>
        {saved ? <span className="mute">Guardado</span> : JSON.stringify(d) !== JSON.stringify(subject) && <span className="warn">Cambios sin guardar</span>}
        <button className="small" onClick={removeSubject}>Borrar asignatura</button>
      </div>
    </div>
  );
}
