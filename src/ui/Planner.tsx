import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDelete, uid } from '../data/db';
import { useGroups, useNodes } from './hooks';
import { NodePicker } from './NodePicker';
import { Rubrics } from './Rubrics';
import { Calendar } from './Calendar';
import { callScript } from '../data/api';
import type { CWork } from '../data/api';
import { activitiesWithoutItems, coverage } from '../core/curriculum';
import type { Activity, CNode, Group, LearningUnit, Rubric, Subject } from '../core/model';

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

/**
 * Enlace de una actividad planificada con su tarea de Classroom: elegir una tarea existente o crearla desde aquí
 * (como borrador, para añadirle la rúbrica en Classroom). Después, las notas y la rúbrica se traen desde el Cuaderno.
 */
function ClassroomLink(p: { a: Activity; group?: Group; others: Activity[]; nodes: CNode[]; onChange: (patch: Partial<Activity>) => void }) {
  const [list, setList] = useState<CWork[] | null>(null);
  const [msg, setMsg] = useState('');
  const courseId = p.group?.classroomCourseId;
  if (!courseId) return null;
  const taken = new Set(p.others.filter((x) => x.id !== p.a.id && !x.deleted).map((x) => x.classroomWorkId).filter(Boolean));
  if (p.a.classroomWorkId) {
    return (
      <div className="row mute">
        Vinculada con una tarea de Classroom{p.a.classroomCreated ? ' (creada desde la app)' : ''}.
        <button className="small" onClick={() => confirm('¿Desvincular de Classroom? Las notas ya traídas se conservan.') && p.onChange({ classroomWorkId: undefined, classroomCreated: undefined })}>Desvincular</button>
      </div>
    );
  }
  async function load() {
    setMsg('Cargando tareas…');
    try { setList(await callScript<CWork[]>('classroom.work.list', { courseId })); setMsg(''); }
    catch (e) { setMsg('Error: ' + (e as Error).message); }
  }
  async function create() {
    if (!p.a.title.trim()) return setMsg('Pon un título antes.');
    if (!confirm(`¿Crear «${p.a.title}» en Classroom como borrador (sobre 10)? Allí podrás añadirle la rúbrica y publicarla.`)) return;
    setMsg('Creando en Classroom…');
    const codes = p.a.nodeIds.map((id) => p.nodes.find((n) => n.id === id)?.code).filter(Boolean);
    try {
      const r = await callScript<{ id: string; maxPoints: number }>('classroom.work.create', {
        courseId, title: p.a.title.trim(), description: codes.length ? `Criterios de evaluación: ${codes.join(', ')}` : '', dueDate: p.a.date ?? '', maxPoints: 10,
      });
      p.onChange({ classroomWorkId: r.id, classroomCreated: true, maxPoints: r.maxPoints });
      setMsg('Creada en Classroom como borrador.');
    } catch (e) { setMsg('Error: ' + (e as Error).message); }
  }
  return (
    <div>
      <div className="row">
        <span className="mute">Classroom:</span>
        {!list && <button className="small" onClick={load}>Vincular con una tarea</button>}
        <button className="small" onClick={create}>Crear en Classroom</button>
      </div>
      {list && (
        <select value="" onChange={(e) => {
          const w = list.find((x) => x.id === e.target.value);
          if (w) p.onChange({ classroomWorkId: w.id, maxPoints: w.maxPoints ?? undefined, ...(p.a.date ? {} : { date: w.dueDate || undefined }) });
        }}>
          <option value="">Elige la tarea de Classroom…</option>
          {list.filter((w) => !taken.has(w.id)).map((w) => <option key={w.id} value={w.id}>{w.title}{w.state === 'DRAFT' ? ' (borrador)' : ''}{w.dueDate ? ` · ${w.dueDate}` : ''}</option>)}
        </select>
      )}
      {msg && <p className="mute">{msg}</p>}
    </div>
  );
}

function ActForm(p: { subject: Subject; nodes: CNode[]; units: LearningUnit[]; rubrics: Rubric[]; group?: Group; others: Activity[]; init: Activity; onDone: () => void }) {
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
      <select value={a.rubricId ?? ''} onChange={(e) => setA({ ...a, rubricId: e.target.value || undefined })}>
        <option value="">Sin rúbrica (nota numérica)</option>
        {p.rubrics.map((r) => <option key={r.id} value={r.id}>Rúbrica: {r.name}</option>)}
      </select>
      <button className="small" onClick={() => setPick(!pick)}>Criterios que evalúa ({a.nodeIds.length})</button>
      {pick && <NodePicker subject={p.subject} nodes={p.nodes} selected={a.nodeIds} onChange={(ids) => setA({ ...a, nodeIds: ids })} />}
      {a.rubricId && <p className="mute">Al guardar se añaden los criterios de la rúbrica.</p>}
      <ClassroomLink a={a} group={p.group} others={p.others} nodes={p.nodes} onChange={async (patch) => {
        const next = { ...a, ...patch };
        setA(next);
        // El enlace se guarda al momento: la tarea ya existe en Classroom.
        if ('classroomWorkId' in patch) {
          const saved = await db.activities.get(a.id);
          if (saved || next.title.trim()) await db.activities.put({ ...(saved ?? next), ...patch, updatedAt: Date.now() });
        }
      }} />
      <div className="row">
        <button className="on" disabled={!a.title.trim()} onClick={async () => {
          const rb = p.rubrics.find((r) => r.id === a.rubricId);
          const nodeIds = [...new Set([...a.nodeIds, ...(rb?.rows.map((x) => x.nodeId) ?? [])])];
          await db.activities.put({ ...a, nodeIds, weight: Number(w) > 0 ? Number(w) : 1, updatedAt: Date.now() });
          p.onDone();
        }}>Guardar</button>
        <button onClick={p.onDone}>Cancelar</button>
      </div>
    </div>
  );
}


function WorkImport(p: { subject: Subject; group: Group; existing: Activity[]; onDone: () => void }) {
  const [list, setList] = useState<CWork[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [termId, setTermId] = useState(p.subject.terms[0]?.id ?? '');
  const [instId, setInstId] = useState(p.subject.instruments[0]?.id ?? '');
  const [msg, setMsg] = useState('');
  const have = new Set(p.existing.map((a) => a.classroomWorkId).filter(Boolean));

  async function load() {
    setMsg('Cargando…');
    try { setList(await callScript<CWork[]>('classroom.work.list', { courseId: p.group.classroomCourseId })); setMsg(''); }
    catch (e) { setMsg('Error: ' + (e as Error).message); }
  }
  async function imp() {
    const now = Date.now();
    const rows = (list ?? []).filter((w) => sel.includes(w.id)).map((w): Activity => ({
      id: uid(), subjectId: p.subject.id, groupId: p.group.id, termId, instrumentId: instId, title: w.title, weight: 1,
      nodeIds: [], date: w.dueDate || undefined, classroomWorkId: w.id, maxPoints: w.maxPoints ?? undefined, updatedAt: now,
    }));
    await db.activities.bulkPut(rows);
    p.onDone();
  }
  return (
    <div className="card">
      <b>Tareas de Classroom</b>
      {!list && <div className="row"><button onClick={load}>Cargar tareas</button></div>}
      {msg && <p className="mute">{msg}</p>}
      {list && (
        <>
          <div className="row">
            <select value={termId} onChange={(e) => setTermId(e.target.value)}>{p.subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select value={instId} onChange={(e) => setInstId(e.target.value)}>{p.subject.instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          </div>
          <p className="mute">Evaluación e instrumento se aplican a todas las seleccionadas; luego puedes editar cada una.</p>
          <div className="picker">
            {list.map((w) => (
              <label key={w.id}>
                <input type="checkbox" disabled={have.has(w.id)} checked={sel.includes(w.id) || have.has(w.id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, w.id] : sel.filter((x) => x !== w.id))} />
                <span>{w.title} <span className="mute">{w.maxPoints != null ? `· ${w.maxPoints} pts` : '· sin nota'}{w.dueDate ? ` · ${w.dueDate}` : ''}{have.has(w.id) ? ' · ya importada' : ''}</span></span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="row">
        {list && <button className="on" disabled={!sel.length} onClick={imp}>Importar ({sel.length})</button>}
        <button onClick={p.onDone}>Cerrar</button>
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
  const [imp, setImp] = useState(false);
  const rbRaw = useLiveQuery(() => db.rubrics.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const rubrics = (rbRaw ?? []).filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const lkRaw = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const instName = (id: string) => subject.instruments.find((i) => i.id === id)?.name ?? '?';
  const cov = coverage(subject, nodes, lkRaw ?? [], units, acts);
  const noItems = new Set(activitiesWithoutItems(subject, nodes, acts).map((a) => a.id));
  // Contenidos (saberes básicos): niveles no evaluables sin relaciones; se reparten en las unidades.
  const contentLevels = subject.levels.filter((l) => !l.graded && !subject.relations.some((r) => r.from === l.key || r.to === l.key));
  const contents = nodes.filter((n) => contentLevels.some((l) => l.key === n.level));
  const inUnits = (id: string) => units.filter((u) => u.nodeIds.includes(id));

  const newUnit = () => setEu({ id: uid(), subjectId: subject.id, code: `UD${units.length + 1}`, title: '', termId: subject.terms[0]?.id ?? '', plannedSessions: 0, nodeIds: [], updatedAt: Date.now() });
  const newAct = () => setEa({ id: uid(), subjectId: subject.id, groupId: group!.id, termId: subject.terms[0]?.id ?? '', instrumentId: subject.instruments[0]?.id ?? '', title: '', weight: 1, nodeIds: [], updatedAt: Date.now() });

  const [view, setView] = useState<'plan' | 'cal'>('plan');
  const tabs = (
    <div className="row">
      <button className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>Unidades y actividades</button>
      <button className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')}>Calendario</button>
    </div>
  );
  if (view === 'cal') return <div>{tabs}<Calendar subject={subject} groups={groups} units={units} acts={actsRaw ?? []} /></div>;

  return (
    <div>
      {tabs}
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
            {group?.classroomCourseId && <button onClick={() => setImp(!imp)}>Importar de Classroom</button>}
          </div>
          {imp && group && <WorkImport subject={subject} group={group} existing={acts} onDone={() => setImp(false)} />}
          {noItems.size > 0 && <p className="warn">⚠ {noItems.size === 1 ? '1 actividad' : `${noItems.size} actividades`} sin criterio: solo admiten nota global y no aportan al perfil competencial.</p>}
          {ea && <ActForm key={ea.id} subject={subject} nodes={nodes} units={units} rubrics={rubrics} group={group} others={acts} init={ea} onDone={() => setEa(null)} />}
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
                          {instName(a.instrumentId)} · peso {a.weight}{a.date ? ` · ${a.date}` : ''}{a.unitId ? ` · ${units.find((u) => u.id === a.unitId)?.code ?? ''}` : ''}{a.classroomWorkId ? ' · Classroom' : group?.classroomCourseId ? ' · sin tarea en Classroom' : ''}{a.rubricId ? ` · rúbrica «${rubrics.find((r) => r.id === a.rubricId)?.name ?? 'borrada'}»` : ''}
                        </div>
                        {noItems.has(a.id) && <div className="warn mute">⚠ Sin criterio</div>}
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

      {contents.length > 0 && (
        <details className="card">
          <summary>{contentLevels.map((l) => l.plural).join(', ')} en las unidades ({contents.filter((n) => !inUnits(n.id).length).length} sin unidad)</summary>
          <p className="mute">Los saberes definen los contenidos: se incluyen en las unidades didácticas (Elementos curriculares de cada unidad), no se evalúan.</p>
          {contents.map((n) => {
            const us = inUnits(n.id);
            return (
              <div className="issue" key={n.id}>
                <b>{n.code}</b>
                <span>{n.title.slice(0, 90)}{n.title.length > 90 ? '…' : ''} <span className={us.length ? 'mute' : 'warn'}>— {us.length ? us.map((u) => u.code).join(', ') : 'sin unidad'}</span></span>
              </div>
            );
          })}
        </details>
      )}

      <h3>Rúbricas</h3>
      <Rubrics subject={subject} nodes={nodes} />

      {cov.length > 0 && (
        <details className="card">
          <summary>Cobertura: criterio × instrumento ({cov.filter((c) => c.total === 0).length} sin actividades)</summary>
          <p className="mute">Unidades y actividades del grupo seleccionado que evalúan cada elemento, por instrumento. Una actividad que evalúa una concreción cuenta también para su criterio.</p>
          <div className="tw">
            <table className="t c">
              <thead>
                <tr>
                  <th>Elemento</th><th>UD</th>
                  {subject.instruments.map((i) => <th key={i.id} title={i.name}>{i.name.slice(0, 10)}</th>)}
                  <th className="sum">Total</th>
                </tr>
              </thead>
              <tbody>
                {cov.map(({ node, units: ud, byInstrument, total }) => (
                  <tr key={node.id}>
                    <td title={node.title}><b>{node.code}</b></td>
                    <td className={ud === 0 ? 'warn' : ''}>{ud || '·'}</td>
                    {subject.instruments.map((i) => <td key={i.id}>{byInstrument[i.id] || '·'}</td>)}
                    <td className={'sum' + (total === 0 ? ' warn' : '')}>{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
