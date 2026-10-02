import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setLink } from '../data/db';
import { review } from '../core/curriculum';
import type { CNode, RelationDef, Subject } from '../core/model';

export function Curriculum({ subject }: { subject: Subject }) {
  const allNodes = useLiveQuery(() => db.nodes.where('subjectId').equals(subject.id).sortBy('order'), [subject.id]);
  const allLinks = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const nodes = useMemo(() => (allNodes ?? []).filter((n) => !n.deleted), [allNodes]);
  const links = useMemo(() => (allLinks ?? []).filter((l) => !l.deleted), [allLinks]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const [levelKey, setLevelKey] = useState(subject.levels[0].key);
  const [view, setView] = useState<'cards' | 'review'>('cards');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const lv = subject.levels.find((l) => l.key === levelKey) ?? subject.levels[0];
  const rels = subject.relations.filter((r) => r.from === lv.key || r.to === lv.key);
  const levelOf = (k: string) => subject.levels.find((l) => l.key === k)!;
  const issues = useMemo(() => review(subject, nodes, links), [subject, nodes, links]);

  if (subject.relations.length === 0)
    return (
      <div className="card">
        <p><b>{subject.name}</b> no usa vínculos curriculares.</p>
        <p className="mute">
          Las actividades se evalúan por instrumento. Los {nodes.length} aspectos evaluables
          ({subject.levels[0].plural.toLowerCase()}) quedan disponibles para asociarlos a una actividad si quieres.
        </p>
        {nodes.map((n) => (
          <div className="issue" key={n.id}>
            <b>{n.code}</b>
            <span>{n.title}</span>
          </div>
        ))}
      </div>
    );

  const shown = nodes.filter(
    (n) => n.level === lv.key && (!q || (n.code + ' ' + n.title).toLowerCase().includes(q.toLowerCase()))
  );

  const cardGroup = (n: CNode, r: RelationDef) => {
    const side = r.from === lv.key ? 'from' : 'to';
    const otherKey = side === 'from' ? r.to : r.from;
    const mine = links.filter((l) => l.relation === r.key && (side === 'from' ? l.fromId === n.id : l.toId === n.id));
    const ids = new Set(mine.map((l) => (side === 'from' ? l.toId : l.fromId)));
    const linked = [...ids].map((id) => byId.get(id)).filter((x): x is CNode => !!x).sort((a, b) => a.order - b.order);
    const pk = `${n.id}|${r.key}`;
    const candidates = nodes.filter((x) => x.level === otherKey);
    const toggle = (other: CNode, on: boolean) =>
      setLink(subject.id, r.key, side === 'from' ? n.id : other.id, side === 'from' ? other.id : n.id, on);
    return (
      <div className="group" key={r.key}>
        <b>{levelOf(otherKey).plural}</b>
        <div className="chips">
          {linked.map((o) => (
            <span className="chip" key={o.id} title={o.title}>
              {o.code}
              <button aria-label="Quitar" onClick={() => toggle(o, false)}>×</button>
            </span>
          ))}
          <button className="chip add" onClick={() => setOpen(open === pk ? null : pk)}>
            {open === pk ? 'Cerrar' : '+ Vincular'}
          </button>
        </div>
        {open === pk && (
          <div className="picker">
            {candidates.map((o) => (
              <label key={o.id}>
                <input type="checkbox" checked={ids.has(o.id)} onChange={(e) => toggle(o, e.target.checked)} />
                <span><b>{o.code}</b> {o.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="row">
        <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Tarjetas</button>
        <button className={view === 'review' ? 'on' : ''} onClick={() => setView('review')}>
          Revisión{issues.length ? ` (${issues.length})` : ''}
        </button>
      </div>

      {view === 'review' ? (
        <div className="card">
          {issues.length === 0 && <p>Sin avisos. Todos los enlaces obligatorios están hechos.</p>}
          {issues.map((i) => {
            const n = byId.get(i.nodeId);
            return (
              <div className="issue" key={i.key}>
                <b>{n?.code}</b>
                <span>{n?.title.slice(0, 80)}{(n?.title.length ?? 0) > 80 ? '…' : ''} <span className="warn">— {i.message}</span></span>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="row">
            <select value={lv.key} onChange={(e) => { setLevelKey(e.target.value); setOpen(null); }}>
              {subject.levels.map((l) => <option key={l.key} value={l.key}>{l.plural}</option>)}
            </select>
            <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="mute">{shown.length} elementos</span>
          </div>
          {shown.map((n) => (
            <div className="card" key={n.id}>
              <div>
                <b>{n.code}</b> {n.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
                {n.group && <span className="tag">{n.group}</span>}
              </div>
              <p>{n.title}</p>
              {rels.map((r) => cardGroup(n, r))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
