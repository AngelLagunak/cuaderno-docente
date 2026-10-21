import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { currentSnapshot, db, restoreSnapshot, softDelete, uid } from '../data/db';
import { diffCount, snapshotDiff } from '../core/versions';
import type { SnapshotDiff } from '../core/versions';
import { schoolYearOf, ymd } from '../core/planning';
import type { Snapshot, SnapshotData, Subject } from '../core/model';

const when = (t: number) => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Changes({ d }: { d: SnapshotDiff }) {
  const codes = (xs: { code: string }[]) => xs.map((x) => x.code).join(', ');
  const line = (label: string, x: { added: unknown[]; removed: unknown[]; changed: unknown[] }, detail?: [string, string, string]) =>
    x.added.length + x.removed.length + x.changed.length > 0 && (
      <div className="issue"><b>{label}</b><span>
        {[x.added.length && `${x.added.length} nuevos${detail?.[0] ? `: ${detail[0]}` : ''}`, x.removed.length && `${x.removed.length} quitados${detail?.[1] ? `: ${detail[1]}` : ''}`, x.changed.length && `${x.changed.length} cambiados${detail?.[2] ? `: ${detail[2]}` : ''}`].filter(Boolean).join(' · ')}
      </span></div>
    );
  if (!diffCount(d)) return <p className="mute">Sin cambios: es igual que la programación actual.</p>;
  return (
    <div>
      {d.subject && <div className="issue"><b>Configuración</b><span>instrumentos, evaluaciones, cálculo o estructura cambiados</span></div>}
      {line('Currículo', d.nodes, [codes(d.nodes.added), codes(d.nodes.removed), codes(d.nodes.changed.map((c) => c.after))])}
      {line('Vínculos', d.links)}
      {line('Unidades', d.units, [codes(d.units.added), codes(d.units.removed), codes(d.units.changed.map((c) => c.after))])}
      {line('Rúbricas', d.rubrics)}
    </div>
  );
}

/**
 * Versiones de la programación: guardar la de un curso («Programación 2026/27»), ver qué ha cambiado desde
 * entonces, volver a ella o descargarla. No incluyen alumnado ni notas.
 */
export function Versions({ subject }: { subject: Subject }) {
  const raw = useLiveQuery(() => db.snapshots.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const list = (raw ?? []).filter((s) => !s.deleted).sort((a, b) => b.createdAt - a.createdAt);
  // La programación actual cambia con cualquier edición: se recalcula al cambiar materia, versiones o algo del currículo.
  const tick = useLiveQuery(async () => [await db.nodes.where('subjectId').equals(subject.id).count(), await db.links.where('subjectId').equals(subject.id).count(), Date.now()].join(), [subject.id]);
  const [cur, setCur] = useState<SnapshotData | null>(null);
  useEffect(() => { currentSnapshot(subject.id).then(setCur).catch(() => setCur(null)); }, [subject, tick, raw]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  async function save() {
    const name = prompt('Nombre de la versión', `Programación ${schoolYearOf(ymd(new Date()))}`);
    if (!name?.trim()) return;
    const now = Date.now();
    await db.snapshots.put({ id: uid(), subjectId: subject.id, name: name.trim(), createdAt: now, data: await currentSnapshot(subject.id), updatedAt: now });
    setMsg(`Guardada «${name.trim()}».`);
  }
  async function restore(s: Snapshot) {
    const n = cur ? diffCount(snapshotDiff(cur, s.data)) : 0;
    if (!confirm(`¿Volver a «${s.name}»? Se deshacen ${n} cambios del currículo, unidades, rúbricas y configuración. Las notas no se tocan; los elementos que se quiten desaparecen también de las actividades.\nAntes se guarda la programación actual como versión.`)) return;
    const r = await restoreSnapshot(s);
    setMsg(`Programación devuelta a «${s.name}» (${r.nodes.length + r.removedNodes.length} elementos del currículo cambiados).`);
  }
  function download(s: Snapshot) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'cuaderno-docente', kind: 'programacion', ...s })], { type: 'application/json' }));
    a.download = `${subject.name} - ${s.name}.json`.replace(/[\\/:*?"<>|]/g, '-');
    a.click();
  }

  return (
    <div>
      <div className="card">
        <p className="mute">Una versión guarda la programación de la materia: configuración, currículo y vínculos, unidades y rúbricas (sin alumnado ni notas). Guárdala al cerrar cada curso o antes de cambios grandes.</p>
        <p className="mute">Para empezar el curso siguiente: guarda la versión, crea los grupos nuevos en Grupos con su curso escolar (2027/28) y cambia lo que haga falta. La programación anterior queda aquí.</p>
        <div className="row"><button className="on" onClick={save}>Guardar versión actual</button>{msg && <span className="mute">{msg}</span>}</div>
      </div>
      {list.length === 0 && <p className="mute">Aún no hay versiones guardadas.</p>}
      {list.map((s) => {
        const d = cur ? snapshotDiff(s.data, cur) : null;
        return (
          <div className="card" key={s.id}>
            <div className="sp">
              <div><b>{s.name}</b><div className="mute">{when(s.createdAt)} · {s.data.nodes.length} elementos · {s.data.units.length} unidades · {s.data.rubrics.length} rúbricas{d ? ` · ${diffCount(d) ? `${diffCount(d)} cambios desde entonces` : 'igual que la actual'}` : ''}</div></div>
            </div>
            <div className="row">
              <button className="small" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Ocultar cambios' : 'Ver cambios'}</button>
              <button className="small" disabled={!d || !diffCount(d)} onClick={() => restore(s)}>Volver a esta versión</button>
              <button className="small" onClick={() => download(s)}>Descargar</button>
              <button className="small" onClick={() => confirm(`¿Borrar la versión «${s.name}»?`) && softDelete(db.snapshots, s)}>Borrar</button>
            </div>
            {open === s.id && d && <><p className="mute">Cambios desde esta versión hasta hoy:</p><Changes d={d} /></>}
          </div>
        );
      })}
    </div>
  );
}
