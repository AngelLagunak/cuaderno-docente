import { useMemo, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { setLink } from '../data/db';
import { chainOf, levelColumns, relationFor } from '../core/curriculum';
import type { CLink, CNode, Subject } from '../core/model';

type Card = { code: string; title: string; dim: boolean; hit: boolean };

function CardNode({ data }: NodeProps<Node<Card>>) {
  return (
    <div className={'mapcard' + (data.dim ? ' dim' : '') + (data.hit ? ' hit' : '')} title={data.title}>
      <Handle type="target" position={Position.Left} />
      <b>{data.code}</b> <span>{data.title.slice(0, 48)}{data.title.length > 48 ? '…' : ''}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { card: CardNode };

/**
 * Mapa de relaciones: columnas de tarjetas según la cadena del currículo, más las competencias clave al final.
 * Pulsar una tarjeta resalta su cadena; arrastrar de un punto a otro crea el vínculo; seleccionar una línea y
 * pulsar Supr lo borra.
 */
export default function CurriculumMap({ subject, nodes, links }: { subject: Subject; nodes: CNode[]; links: CLink[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const live = useMemo(() => links.filter((l) => !l.deleted), [links]);
  const groups = useMemo(() => [...new Set(nodes.map((n) => n.group).filter((g): g is string => !!g))], [nodes]);
  // Competencias clave: nodos virtuales unidos a sus descriptores (no se editan aquí).
  const virtual = useMemo(() => nodes.filter((n) => n.group).map((n) => ({ id: `${n.id}>@${n.group}`, fromId: n.id, toId: `@${n.group}` }) as CLink), [nodes]);
  const chain = useMemo(() => (sel ? chainOf(sel, [...live, ...virtual]) : null), [sel, live, virtual]);

  const flowNodes: Node<Card>[] = useMemo(() => {
    const cols = levelColumns(subject);
    const out: Node<Card>[] = [];
    // Con una tarjeta pulsada solo se ve su cadena, compacta y legible.
    const shown = (id: string) => !chain || chain.has(id);
    cols.forEach((keys, x) => {
      nodes.filter((n) => keys.includes(n.level) && shown(n.id)).forEach((n, y) =>
        out.push({ id: n.id, type: 'card', position: { x: x * 280, y: y * 64 }, data: { code: n.code, title: n.title, dim: !!chain && !chain.has(n.id), hit: n.id === sel } }));
    });
    groups.filter((g) => shown(`@${g}`)).forEach((g, y) => out.push({ id: `@${g}`, type: 'card', position: { x: cols.length * 280, y: y * 64 }, connectable: false,
      data: { code: g, title: 'Competencia clave', dim: !!chain && !chain.has(`@${g}`), hit: `@${g}` === sel } }));
    return out;
  }, [subject, nodes, groups, chain, sel]);

  const edges: Edge[] = useMemo(() => [...live, ...virtual].filter((l) => !chain || (chain.has(l.fromId) && chain.has(l.toId))).map((l) => {
    const on = !!chain && chain.has(l.fromId) && chain.has(l.toId);
    return { id: l.id, source: l.fromId, target: l.toId, deletable: !l.id.includes('>@'), animated: on, selected: l.id === selEdge,
      style: { opacity: chain && !on ? 0.12 : 1, strokeWidth: on || l.id === selEdge ? 2.5 : 1, ...(l.id === selEdge ? { stroke: 'var(--warn)' } : {}) } };
  }), [live, virtual, chain, selEdge]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  function connect(c: Connection) {
    const a = byId.get(c.source), b = byId.get(c.target);
    if (!a || !b) return;
    const r = relationFor(subject, a.level, b.level);
    if (!r) { setMsg(`No hay relación entre ${a.code} y ${b.code} en la estructura de la materia.`); return; }
    const [from, to] = r.reversed ? [b, a] : [a, b];
    setLink(subject.id, r.key, from.id, to.id, true);
    setMsg(`Vinculado ${from.code} → ${to.code}.`);
  }
  function remove(es: Edge[]) {
    for (const e of es) {
      const l = live.find((x) => x.id === e.id);
      if (l) { setLink(subject.id, l.relation, l.fromId, l.toId, false); setMsg(`Quitado ${byId.get(l.fromId)?.code} → ${byId.get(l.toId)?.code}.`); }
    }
    setSelEdge(null);
  }
  const edgeSel = live.find((l) => l.id === selEdge);

  return (
    <div>
      <p className="mute">Pulsa una tarjeta para ver su cadena (de las concreciones a las competencias clave). Arrastra desde el punto derecho de una tarjeta al izquierdo de otra para vincularlas; selecciona una línea y pulsa Supr o Retroceso para quitarla. En el móvil, mejor como consulta.</p>
      {msg && <p className="mute">{msg}</p>}
      {edgeSel && (
        <div className="row">
          <span>Vínculo {byId.get(edgeSel.fromId)?.code} → {byId.get(edgeSel.toId)?.code}</span>
          <button className="small" onClick={() => remove([{ id: edgeSel.id } as Edge])}>Quitar vínculo</button>
        </div>
      )}
      {sel && <div className="row"><span>Cadena de <b>{byId.get(sel)?.code ?? sel.slice(1)}</b></span><button className="small" onClick={() => setSel(null)}>Ver el mapa completo</button></div>}
      <div className="map">
        <ReactFlow key={sel ?? 'todo'} nodes={flowNodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.1} colorMode="system"
          onNodeClick={(_, n) => { setSel(sel === n.id ? null : n.id); setSelEdge(null); }} onPaneClick={() => { setSel(null); setSelEdge(null); }}
          onEdgeClick={(_, e) => setSelEdge(e.deletable === false ? null : e.id)}
          onConnect={connect} onEdgesDelete={remove} deleteKeyCode={["Delete", "Backspace"]} nodesDraggable={false} proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
