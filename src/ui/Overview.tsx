import { useState } from 'react';
import { overview } from '../core/overview';
import type { Status } from '../core/overview';
import type { Activity, CLink, CNode, LearningUnit, Subject } from '../core/model';

const LABEL: Record<Status, string> = { evaluated: 'Evaluado', worked: 'Solo trabajado', missing: 'Sin trabajar' };
const dm = (s?: string) => (s ? s.slice(5).split('-').reverse().join('/') : '');
const pct = ([a, b]: [number, number]) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Visión general de la programación del grupo: cada unidad con sus actividades y saberes, y el currículo completo
 * (competencia → criterio → concreción) marcado según esté evaluado, solo trabajado o sin trabajar.
 */
export function Overview(p: { subject: Subject; nodes: CNode[]; links: CLink[]; units: LearningUnit[]; activities: Activity[]; groupName?: string; instName: (id: string) => string }) {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const o = overview(p.subject, p.nodes, p.links, p.units, p.activities);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const term = (id: string) => p.subject.terms.find((t) => t.id === id)?.name ?? '';
  const t = o.totals;
  const tiles: [string, [number, number]][] = [['Concreciones evaluadas', t.leaves], ['Criterios evaluados', t.crits], ...(t.comps[1] ? [['Competencias evaluadas', t.comps] as [string, [number, number]]] : []), ...(t.saberes[1] ? [['Saberes en alguna unidad', t.saberes] as [string, [number, number]]] : [])];
  const show = (s: Status) => !onlyMissing || s !== 'evaluated';

  const act = (a: Activity) => (
    <div className="ovact" key={a.id}>
      <div className="sp"><b>{a.title}</b><span className="mute">{a.formative ? 'sin nota' : p.instName(a.instrumentId)}</span></div>
      <div className="mute">{a.from ? `${dm(a.from)}–${dm(a.to ?? a.from)}` : 'sin fechas'}{a.date ? ` · entrega ${dm(a.date)}` : ''}</div>
      <div className="chips">{a.nodeIds.map((id) => byId.get(id)).filter((n): n is CNode => !!n).map((n) => <span className="chip" key={n.id} title={n.title}>{n.code}</span>)}{!a.nodeIds.length && <span className="warn">Sin concreciones</span>}</div>
    </div>
  );

  return (
    <div className="overview">
      <div className="tiles">
        {tiles.map(([l, v]) => <div className="tile" key={l}><span>{l}</span><b>{v[0]}<small> / {v[1]}</small></b><div className="track"><div style={{ width: `${pct(v)}%` }} /></div></div>)}
      </div>
      <p className="mute">{p.groupName ? `Actividades de ${p.groupName}. ` : ''}Una actividad que evalúa una concreción cubre también su criterio y su competencia. Las actividades sin calificación cuentan como «solo trabajado».</p>

      <h3>Unidades y actividades</h3>
      {o.units.length === 0 && <p className="mute">Aún no hay unidades.</p>}
      <div className="ovunits">
        {o.units.map((u) => (
          <section className="card" key={u.unit.id}>
            <div className="sp"><b>{u.unit.code} {u.unit.title}</b><span className="mute">{term(u.unit.termId)} · {u.unit.plannedSessions} ses.</span></div>
            {u.saberes.length > 0 && <div className="chips">{u.saberes.map((n) => <span className="chip saber" key={n.id} title={n.title}>{n.code}</span>)}</div>}
            {u.activities.length ? u.activities.map(act) : <p className="warn">Sin actividades: sus criterios salen de ellas.</p>}
          </section>
        ))}
        {o.loose.length > 0 && <section className="card"><b>Sin unidad</b>{o.loose.map(act)}</section>}
      </div>

      <div className="sp"><h3>Currículo</h3><label className="row" style={{ margin: 0 }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Solo lo que falta</label></div>
      <div className="legend"><span className="st evaluated">Evaluado</span><span className="st worked">Solo trabajado</span><span className="st missing">Sin trabajar</span></div>
      {o.comps.filter((c) => show(c.status) || c.crits.some((k) => show(k.status) || k.leaves.some((l) => show(l.status)))).map((c) => (
        <section className="card ovcomp" key={c.node.id}>
          {c.node.code && <div className="sp"><b><span className={'dot ' + c.status} />{c.node.code}. {c.node.title}</b><span className="mute">{LABEL[c.status]}</span></div>}
          {c.crits.filter((k) => show(k.status) || k.leaves.some((l) => show(l.status))).map((k) => (
            <div className="ovcrit" key={k.node.id}>
              <div className="sp"><span><span className={'dot ' + k.status} /><b>{k.node.code}</b> {k.node.title.length > 110 ? k.node.title.slice(0, 110) + '…' : k.node.title}</span><span className="mute">{k.units.join(', ') || '—'}</span></div>
              {k.leaves.length > 0 && (
                <div className="chips">
                  {k.leaves.filter((l) => show(l.status)).map((l) => <span key={l.node.id} className={'chip st ' + l.status} title={`${l.node.title}\n${LABEL[l.status]}${l.graded ? ` · ${l.graded} actividad(es) con nota` : ''}${l.formative ? ` · ${l.formative} sin nota` : ''}${l.units.length ? ` · ${l.units.join(', ')}` : ''}`}>{l.node.code}</span>)}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {o.saberes.length > 0 && (
        <>
          <h3>Saberes básicos</h3>
          <div className="chips">
            {o.saberes.filter((s) => !onlyMissing || !s.units.length).map((s) => <span key={s.node.id} className={'chip st ' + (s.units.length ? 'evaluated' : 'missing')} title={`${s.node.title}\n${s.units.join(', ') || 'En ninguna unidad'}`}>{s.node.code}{s.units.length ? ` · ${s.units.join(', ')}` : ''}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
