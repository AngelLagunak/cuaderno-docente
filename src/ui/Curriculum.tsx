import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteNode, saveNode, setLink, uid } from '../data/db';
import { review } from '../core/curriculum';
import { useNodes } from './hooks';
import type { CNode, RelationDef, Subject } from '../core/model';

function NodeForm(p: { node: CNode; showGroup: boolean; onSave: (n: CNode) => void; onCancel: () => void }) {
  const [code, setCode] = useState(p.node.code);
  const [title, setTitle] = useState(p.node.title);
  const [tags, setTags] = useState(p.node.tags.join(', '));
  const [group, setGroup] = useState(p.node.group ?? '');
  return (
    <div className="form">
      <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
      <textarea rows={3} placeholder="Texto" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="Etiquetas (separadas por comas)" value={tags} onChange={(e) => setTags(e.target.value)} />
      {p.showGroup && (
        <input placeholder="Grupo para el radar (CCL, STEM, CD…)" value={group} onChange={(e) => setGroup(e.target.value)} />
      )}
      <div className="row">
        <button
          className="on"
          disabled={!code.trim() || !title.trim()}
          onClick={() =>
            p.onSave({
              ...p.node,
              code: code.trim(),
              title: title.trim(),
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              group: group.trim() || undefined,
            })
          }
        >
          Guardar
        </button>
        <button onClick={p.onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export function Curriculum({ subject }: { subject: Subject }) {
  const nodes = useNodes(subject.id);
  const allLinks = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const links = useMemo(() => (allLinks ?? []).filter((l) => !l.deleted), [allLinks]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const [levelKey, setLevelKey] = useState(subject.levels[0]?.key ?? '');
  const [view, setView] = useState<'cards' | 'review'>('cards');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<CNode | null>(null);

  const lv = subject.levels.find((l) => l.key === levelKey) ?? subject.levels[0];
  const issues = useMemo(() => review(subject, nodes, links), [subject, nodes, links]);
  if (!lv) return <div className="card">Esta materia no tiene niveles. Defínelos en Configuración.</div>;

  const rels = subject.relations.filter((r) => r.from === lv.key || r.to === lv.key);
  const levelOf = (k: string) => subject.levels.find((l) => l.key === k);
  const showGroup = lv.key === 'desc' || nodes.some((n) => n.level === lv.key && n.group);
  const shown = nodes.filter(
    (n) => n.level === lv.key && (!q || (n.code + ' ' + n.title).toLowerCase().includes(q.toLowerCase()))
  );

  const startAdd = () =>
    setAdding({
      id: uid(), subjectId: subject.id, level: lv.key, code: '', title: '',
      order: nodes.reduce((m, n) => Math.max(m, n.order), 0) + 1, tags: [], updatedAt: Date.now(),
    });

  const cardGroup = (n: CNode, r: RelationDef) => {
    const side = r.from === lv.key ? 'from' : 'to';
    const otherKey = side === 'from' ? r.to : r.from;
    const mine = links.filter((l) => l.relation === r.key && (side === 'from' ? l.fromId === n.id : l.toId === n.id));
    const ids = new Set(mine.map((l) => (side === 'from' ? l.toId : l.fromId)));
    const linked = [...ids].map((id) => byId.get(id)).filter((x): x is CNode => !!x).sort((a, b) => a.order - b.order);
    const pk = `${n.id}|${r.key}`;
    const toggle = (o: CNode, on: boolean) =>
      setLink(subject.id, r.key, side === 'from' ? n.id : o.id, side === 'from' ? o.id : n.id, on);
    return (
      <div className="group" key={r.key}>
        <b>{levelOf(otherKey)?.plural ?? otherKey}</b>
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
            {nodes.filter((x) => x.level === otherKey).map((o) => (
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
        <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Elementos</button>
        <button className={view === 'review' ? 'on' : ''} onClick={() => setView('review')}>
          Revisión{issues.length ? ` (${issues.length})` : ''}
        </button>
      </div>

      {view === 'review' ? (
        <div className="card">
          {issues.length === 0 && <p>Sin avisos.</p>}
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
            <select value={lv.key} onChange={(e) => { setLevelKey(e.target.value); setOpen(null); setEditing(null); setAdding(null); }}>
              {subject.levels.map((l) => <option key={l.key} value={l.key}>{l.plural}</option>)}
            </select>
            <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={startAdd}>+ {lv.label}</button>
          </div>
          {rels.length === 0 && <p className="mute">Sin vínculos para este nivel (se definen en Configuración → Estructura).</p>}
          {adding && (
            <div className="card">
              <NodeForm node={adding} showGroup={showGroup} onCancel={() => setAdding(null)}
                onSave={async (n) => { await saveNode(n); setAdding(null); }} />
            </div>
          )}
          {shown.map((n) => (
            <div className="card" key={n.id}>
              {editing === n.id ? (
                <NodeForm node={n} showGroup={showGroup} onCancel={() => setEditing(null)}
                  onSave={async (x) => { await saveNode(x); setEditing(null); }} />
              ) : (
                <>
                  <div className="sp">
                    <div>
                      <b>{n.code}</b> {n.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
                      {n.group && <span className="tag">{n.group}</span>}
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <button className="small" onClick={() => setEditing(n.id)}>Editar</button>
                      <button className="small" onClick={() => { if (confirm(`¿Borrar ${n.code}? Se quitará de vínculos, unidades y actividades.`)) deleteNode(n); }}>Borrar</button>
                    </div>
                  </div>
                  <p>{n.title}</p>
                  {rels.map((r) => cardGroup(n, r))}
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
