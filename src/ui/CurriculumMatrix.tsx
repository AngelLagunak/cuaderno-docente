import { useState } from 'react';
import { setLink } from '../data/db';
import type { CLink, CNode, Subject } from '../core/model';

/** Matriz de vínculos: filas de un nivel, columnas de otro; un toque crea o quita el enlace. */
export function CurriculumMatrix({ subject, nodes, links }: { subject: Subject; nodes: CNode[]; links: CLink[] }) {
  const [rk, setRk] = useState(subject.relations[0]?.key ?? '');
  const [q, setQ] = useState('');
  const r = subject.relations.find((x) => x.key === rk);
  if (!r) return <p className="mute">Esta materia no tiene relaciones entre niveles (se definen en Configuración → Estructura).</p>;
  const lbl = (k: string) => subject.levels.find((l) => l.key === k)?.plural ?? k;
  const rows = nodes.filter((n) => n.level === r.from && (!q || (n.code + ' ' + n.title).toLowerCase().includes(q.toLowerCase())));
  const cols = nodes.filter((n) => n.level === r.to);
  const on = new Set(links.filter((l) => l.relation === r.key && !l.deleted).map((l) => `${l.fromId}>${l.toId}`));
  const empty = (id: string, side: 'from' | 'to') => ![...on].some((k) => (side === 'from' ? k.startsWith(id + '>') : k.endsWith('>' + id)));

  return (
    <div>
      <div className="row">
        <select value={r.key} onChange={(e) => setRk(e.target.value)}>
          {subject.relations.map((x) => <option key={x.key} value={x.key}>{lbl(x.from)} → {lbl(x.to)}</option>)}
        </select>
        <input placeholder="Filtrar filas…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tw">
        <table className="t mx">
          <thead>
            <tr>
              <th>{lbl(r.from)}</th>
              {cols.map((c) => <th key={c.id} title={c.title} className={r.needTo && empty(c.id, 'to') ? 'warn' : ''}><span className="vert">{c.code}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td title={n.title} className={r.needFrom && empty(n.id, 'from') ? 'warn' : ''}><b>{n.code}</b></td>
                {cols.map((c) => {
                  const v = on.has(`${n.id}>${c.id}`);
                  return (
                    <td key={c.id} className={v ? 'mxon' : ''}>
                      <input type="checkbox" aria-label={`${n.code} → ${c.code}`} checked={v} onChange={(e) => setLink(subject.id, r.key, n.id, c.id, e.target.checked)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mute">En naranja, elementos sin ningún vínculo que deberían tenerlo. Mantén el dedo o pasa el ratón por un código para ver su texto.</p>
    </div>
  );
}
