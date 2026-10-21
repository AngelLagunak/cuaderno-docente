import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveRubric, softDelete, uid } from '../data/db';
import { NodePicker } from './NodePicker';
import { defaultLevels } from '../core/model';
import type { CNode, Rubric, Subject } from '../core/model';

function RubricForm(p: { subject: Subject; nodes: CNode[]; init: Rubric; onDone: () => void }) {
  const [r, setR] = useState(p.init);
  const [pick, setPick] = useState(p.init.rows.length === 0);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const n = r.levels.length;
  const setLevel = (i: number, patch: Partial<Rubric['levels'][number]>) =>
    setR({ ...r, levels: r.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setText = (nodeId: string, i: number, t: string) =>
    setR({ ...r, rows: r.rows.map((x) => (x.nodeId === nodeId ? { ...x, text: x.text.map((y, j) => (j === i ? t : y)) } : x)) });
  // Selección de criterios: mantiene el texto de las filas que siguen y añade filas vacías.
  const setNodes = (ids: string[]) =>
    setR({ ...r, rows: ids.map((id) => r.rows.find((x) => x.nodeId === id) ?? { nodeId: id, text: Array(n).fill('') }) });
  const ok = r.name.trim() && r.rows.length > 0 && r.levels.every((l) => l.label.trim() && Number.isFinite(l.value) && l.value >= 0 && l.value <= 10);

  return (
    <div className="card form">
      <input placeholder="Nombre de la rúbrica" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
      <b className="mute">Niveles y nota de cada uno</b>
      {r.levels.map((l, i) => (
        <div className="row" style={{ margin: 0 }} key={i}>
          <b>{i + 1}</b>
          <input value={l.label} onChange={(e) => setLevel(i, { label: e.target.value })} />
          <input className="num" type="number" min={0} max={10} step="0.25" value={l.value} onChange={(e) => setLevel(i, { value: Number(e.target.value) })} />
        </div>
      ))}
      <p className="mute">Si cambias la nota de un nivel, se recalculan las notas ya puestas con esta rúbrica.</p>
      <button className="small" onClick={() => setPick(!pick)}>Criterios de la rúbrica ({r.rows.length})</button>
      {pick && <NodePicker subject={p.subject} nodes={p.nodes} selected={r.rows.map((x) => x.nodeId)} onChange={setNodes} />}
      {r.rows.map((row) => {
        const node = byId.get(row.nodeId);
        return (
          <details key={row.nodeId} className="card">
            <summary><b>{node?.code ?? '?'}</b> {node?.title.slice(0, 70)}{(node?.title.length ?? 0) > 70 ? '…' : ''}
              <span className="mute"> · {row.text.filter((t) => t.trim()).length}/{n} descriptores</span></summary>
            {r.levels.map((l, i) => (
              <textarea key={i} rows={2} placeholder={`${i + 1} · ${l.label}: descriptor (opcional)`} value={row.text[i] ?? ''} onChange={(e) => setText(row.nodeId, i, e.target.value)} />
            ))}
          </details>
        );
      })}
      <div className="row">
        <button className="on" disabled={!ok} onClick={async () => { await saveRubric({ ...r, name: r.name.trim() }); p.onDone(); }}>Guardar</button>
        <button onClick={p.onDone}>Cancelar</button>
      </div>
    </div>
  );
}

/** Rúbricas propias de la materia: niveles 1–4 con su nota y una fila por criterio. */
export function Rubrics({ subject, nodes }: { subject: Subject; nodes: CNode[] }) {
  const raw = useLiveQuery(() => db.rubrics.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const list = (raw ?? []).filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const used = useLiveQuery(() => db.activities.where('subjectId').equals(subject.id).filter((a) => !a.deleted && !!a.rubricId).toArray(), [subject.id]);
  const [edit, setEdit] = useState<Rubric | null>(null);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const uses = (id: string) => (used ?? []).filter((a) => a.rubricId === id).length;
  const fresh = (): Rubric => ({ id: uid(), subjectId: subject.id, name: '', levels: defaultLevels(), rows: [], updatedAt: Date.now() });

  return (
    <div>
      {list.length === 0 && !edit && <p className="mute">Sin rúbricas. Una rúbrica traduce niveles (1–4) a nota y se califica con un toque por criterio.</p>}
      {list.map((r) => (
        edit?.id === r.id ? null : (
          <div className="card sp" key={r.id}>
            <div>
              <b>{r.name}</b>
              <div className="mute">{r.levels.map((l, i) => `${i + 1} ${l.label} = ${String(l.value).replace('.', ',')}`).join(' · ')} · {uses(r.id) === 1 ? '1 actividad' : `${uses(r.id)} actividades`}</div>
              <div className="chips">
                {r.rows.map((x) => byId.get(x.nodeId)).filter((x): x is CNode => !!x).map((x) => <span className="chip" key={x.id} title={x.title}>{x.code}</span>)}
              </div>
            </div>
            <div className="row" style={{ margin: 0 }}>
              <button className="small" onClick={() => setEdit(r)}>Editar</button>
              <button className="small" onClick={() => setEdit({ ...r, id: uid(), name: r.name + ' (copia)', updatedAt: Date.now() })}>Duplicar</button>
              <button className="small" onClick={() => {
                const n = uses(r.id);
                if (confirm(n ? `«${r.name}» se usa en ${n} actividades. Las notas ya puestas se conservan, pero esas actividades se quedan sin rúbrica. ¿Borrar?` : `¿Borrar «${r.name}»?`)) softDelete(db.rubrics, r);
              }}>×</button>
            </div>
          </div>
        )
      ))}
      {edit && <RubricForm key={edit.id} subject={subject} nodes={nodes} init={edit} onDone={() => setEdit(null)} />}
      {!edit && <button onClick={() => setEdit(fresh())}>+ Rúbrica</button>}
    </div>
  );
}
