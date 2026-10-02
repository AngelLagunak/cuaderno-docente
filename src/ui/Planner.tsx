import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { useGroups, useNodes } from './hooks';
import { NodePicker } from './NodePicker';
import type { Activity, CNode, LearningUnit, Subject } from '../core/model';

function UnitForm(p: { subject: Subject; nodes: CNode[]; init: LearningUnit; onDone: () => void }) {
  const [u, setU] = useState(p.init);
  const [pick, setPick] = useState(false);
  return (
    <div className="card form">
      <input placeholder="Código (UD1)" value={u.code} onChange={(e) => setU({ ...u, code: e.target.value })} />
      <input placeholder="Título" value={u.title} onChange={(e) => setU({ ...u, title: e.target.value })} />
      <div className="row">
        <select value={u.termId} onChange={(e) => setU({ ...u, termId: e.target.value })}>
          {p.subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Sesiones <input className="num" type="number" min={0} value={u.plannedSessions} onChange={(e) => setU({ ...u, plannedSessions: Number(e.target.value) || 0 })} /></label>
      </div>
      <button className="small" onClick={() => setPick(!pick)}>Elementos curriculares ({u.nodeIds.length})</button>
      {pick && <NodePicker subject={p.subject} nodes={p.nodes} selected={u.nodeIds} onChange={(ids) => setU({ ...u, nodeIds: ids })} />}
      <div className="row">
        <button className="on" disabled={!u.code.trim() || !u.title.trim()} onClick={async () => { await db.units.put({ ...u, updatedAt: Date.now() }); p.onDone(); }}>Guardar</button>
        <button onClick={p.onDone}>Cancelar</button>
      </div>
    </div>
  );
}

function ActForm(p: { subject: Subject; nodes: CNode[]; units: LearningUnit[]; init: Activity; onDone: () => void }) {
  const [a, setA] = useState(p.init);
  const [w, setW] = useState(String(p.init.weight));
  const [pick, setPick] = useState(false);
  return (
    <div className="card form">
      <input placeholder="Título de la actividad" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} />
      <div className="row">
        <select value={a.termId} onChange={(e) => setA({ ...a, termId: e.target.value })}>
          {p.subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={a.instrumentId} onChange={(e) => setA({ ...a, instrumentId: e.target.value })}>
          {p.subject.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Peso <input className="num" type="number" min={0} step="0.5" value={w} onChange={(e) => setW(e.target.value)} /></label>
        <input type="date" value={a.date ?? ''} onChange={(e) => setA({ ...a, date: e.target.value || undefined })} />
        <select value={a.unitId ?? ''} onChange={(e) => setA({ ...a, unitId: e.target.value || undefined })}>
          <option value="">Sin unidad</option>
          {p.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
      </div>
      <button className="small" onClick={() => setPick(!pick)}>Elementos curriculares, opcional ({a.nodeIds.length})</button>
      {pick && <NodePicker subject={p.subject} nodes={p.nodes} selected={a.nodeIds} onChange={(ids) => setA({ ...a, nodeIds: ids })} />}
      <div className="row">
        <button className="on" disabled={!a.title.trim()} onClick={async () => { await db.activities.put({ ...a, weight: Number(w) > 0 ? Number(w) : 1, updatedAt: Date.now() }); p.onDone(); }}>Guardar</button>
        <button onClick={p.onDone}>Cancelar</button>
      </div>
    </div>
  );
}

export function Planner({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const unitsRaw = useLiveQuery(() => db.units.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const actsRaw = useLiveQuery(() => db.activities.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const units = (unitsRaw ?? []).filter((u) => !u.deleted).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  const acts = (actsRaw ?? []).filter((a) => !a.deleted && a.groupId === group?.id);
  const [eu, setEu] = useState<LearningUnit | null>(null);
  const [ea, setEa] = useState<Activity | null>(null);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const instName = (id: string) => subject.instruments.find((i) => i.id === id)?.name ?? '?';
  const graded = subject.levels.filter((l) => l.graded).map((l) => l.key);
  const cov = nodes.filter((n) => graded.includes(n.level)).map((n) => ({
    n, ud: units.filter((u) => u.nodeIds.includes(n.id)).length, ac: acts.filter((a) => a.nodeIds.includes(n.id)).length,
  }));

  const newUnit = () => setEu({ id: uid(), subjectId: subject.id, code: `UD${units.length + 1}`, title: '', termId: subject.terms[0]?.id ?? '', plannedSessions: 0, nodeIds: [], updatedAt: Date.now() });
  const newAct = () => setEa({ id: uid(), subjectId: subject.id, groupId: group!.id, termId: subject.terms[0]?.id ?? '', instrumentId: subject.instruments[0]?.id ?? '', title: '', weight: 1, nodeIds: [], updatedAt: Date.now() });

  return (
    <div>
      <h3>Unidades didácticas</h3>
      {units.map((u) => (
        eu?.id === u.id ? null : (
          <div className="card sp" key={u.id}>
            <div>
              <b>{u.code}</b> {u.title}
              <div className="mute">{subject.terms.find((t) => t.id === u.termId)?.name} · {u.plannedSessions} sesiones · {u.nodeIds.length} elementos</div>
            </div>
            <div className="row" style={{ margin: 0 }}>
              <button className="small" onClick={() => setEu(u)}>Editar</button>
              <button className="small" onClick={() => confirm(`¿Borrar ${u.code}?`) && softDelete(db.units, u)}>×</button>
            </div>
          </div>
        )
      ))}
      {eu && <UnitForm key={eu.id} subject={subject} nodes={nodes} init={eu} onDone={() => setEu(null)} />}
      {!eu && <button onClick={newUnit}>+ Unidad</button>}

      <h3>Actividades</h3>
      {groups.length === 0 ? (
        <p className="mute">Crea un grupo en la pestaña Grupos.</p>
      ) : (
        <>
          <div className="row">
            <select value={group?.id} onChange={(e) => setGid(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
            </select>
            {!ea && <button onClick={newAct}>+ Actividad</button>}
          </div>
          {ea && <ActForm key={ea.id} subject={subject} nodes={nodes} units={units} init={ea} onDone={() => setEa(null)} />}
          {subject.terms.map((t) => {
            const list = acts.filter((a) => a.termId === t.id);
            return (
              <div key={t.id}>
                <b className="mute">{t.name}</b>
                {list.length === 0 && <p className="mute">Sin actividades.</p>}
                {list.map((a) => (
                  ea?.id === a.id ? null : (
                    <div className="card sp" key={a.id}>
                      <div>
                        <b>{a.title}</b>
                        <div className="mute">
                          {instName(a.instrumentId)} · peso {a.weight}{a.date ? ` · ${a.date}` : ''}{a.unitId ? ` · ${units.find((u) => u.id === a.unitId)?.code ?? ''}` : ''}
                        </div>
                        <div className="chips">
                          {a.nodeIds.map((id) => byId.get(id)).filter((n): n is CNode => !!n).map((n) => <span className="chip" key={n.id} title={n.title}>{n.code}</span>)}
                        </div>
                      </div>
                      <div className="row" style={{ margin: 0 }}>
                        <button className="small" onClick={() => setEa(a)}>Editar</button>
                        <button className="small" onClick={() => confirm(`¿Borrar “${a.title}”?`) && softDelete(db.activities, a)}>×</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            );
          })}
        </>
      )}

      {cov.length > 0 && (
        <details className="card">
          <summary>Cobertura curricular ({cov.filter((c) => c.ac === 0).length} sin actividades)</summary>
          <p className="mute">Cuenta unidades y actividades del grupo seleccionado que incluyen cada elemento evaluable.</p>
          {cov.map(({ n, ud, ac }) => (
            <div className="issue" key={n.id}>
              <b>{n.code}</b>
              <span>{n.title.slice(0, 60)}{n.title.length > 60 ? '…' : ''} <span className={ac === 0 ? 'warn' : 'mute'}>— UD {ud} · act. {ac}</span></span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
