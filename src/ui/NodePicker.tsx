import { useState } from 'react';
import type { CNode, Subject } from '../core/model';

export function NodePicker(p: { subject: Subject; nodes: CNode[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [lv, setLv] = useState(p.subject.levels.find((l) => l.graded)?.key ?? p.subject.levels[0]?.key ?? '');
  const [q, setQ] = useState('');
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const list = p.nodes.filter((n) => n.level === lv && (!q || (n.code + ' ' + n.title).toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: string, on: boolean) => p.onChange(on ? [...p.selected, id] : p.selected.filter((x) => x !== id));
  return (
    <div>
      <div className="chips">
        {p.selected.map((id) => byId.get(id)).filter((n): n is CNode => !!n).map((n) => (
          <span className="chip" key={n.id} title={n.title}>{n.code}<button onClick={() => toggle(n.id, false)}>×</button></span>
        ))}
      </div>
      <div className="row">
        <select value={lv} onChange={(e) => setLv(e.target.value)}>
          {p.subject.levels.map((l) => <option key={l.key} value={l.key}>{l.plural}</option>)}
        </select>
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="picker">
        {list.map((n) => (
          <label key={n.id}>
            <input type="checkbox" checked={p.selected.includes(n.id)} onChange={(e) => toggle(n.id, e.target.checked)} />
            <span><b>{n.code}</b> {n.title}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
