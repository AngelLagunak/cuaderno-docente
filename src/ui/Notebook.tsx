import { useEffect, useState, useSyncExternalStore } from 'react';
import { ImportGrades } from './ImportGrades';
import { SigadExport } from './SigadExport';
import { ObsPanel } from './ObsPanel';
import { Cell, RecMark, fmt, parse, raw } from './cells';
import { FinalView } from './FinalView';
import { canImprove, outcome, scaleLabel } from '../core/rules';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastUndo, saveGrade, saveItemGrade, subscribeUndo, undo, undoable } from '../data/db';
import { configured } from '../data/sync';
import { applyPending, describe, pullActivity, pullGroup } from '../data/classroomSync';
import type { PullResult } from '../data/classroomSync';
import { PushGrades, RubricMap } from './ClassroomPanel';
import { useGroups, useNodes, usePlannedSessions } from './hooks';
import { activityBase, activityValue, indexGrades, profile, itemGrades, noGrades, round, termResult, wmean } from '../core/evaluation';
import type { Num, StudentGrades } from '../core/evaluation';
import { gradedLevels } from '../core/curriculum';
import type { Activity, CNode, Grade, Rubric, Student, Subject } from '../core/model';

/** Casilla de la nota de una actividad: editable, o calculada si se ha calificado por criterios. */
function ActCell({ sg, s, a }: { sg: StudentGrades; s: Student; a: Activity }) {
  const n = itemGrades(a, sg).length;
  if (n) return <span className="cell calc" title={`Media de ${n} criterios`}>{fmt(activityBase(a, sg), 2)}{itemGrades(a, sg).some((g) => g.recoveredAt) && <RecMark g={itemGrades(a, sg).find((g) => g.recoveredAt)} />}</span>;
  const g = sg.byActivity.get(a.id);
  return <><Cell value={g?.value} stamp={g?.updatedAt} label={`${s.lastName} · ${a.title}`} onSave={(v) => saveGrade(s.id, a.id, { value: v })} /><RecMark g={g} /></>;
}

/** Nota de un criterio: botones de nivel si la rúbrica de la actividad tiene fila para él; si no, casilla numérica. */
function ItemRow({ s, a, node, g, rubric, onRecover }: { s: Student; a: Activity; node: CNode; g?: Grade; rubric?: Rubric; onRecover: () => void }) {
  const row = rubric?.rows.find((r) => r.nodeId === node.id);
  const lv = row && g?.level != null ? rubric!.levels[g.level] : undefined;
  return (
    <div className="item">
      <b title={node.title}>{node.code}</b>
      {row ? (
        <span className="lvls">
          {rubric!.levels.map((l, i) => (
            <button key={i} className={'small' + (g?.level === i ? ' on' : '')} title={`${l.label} (${raw(l.value)})${row.text[i] ? ' — ' + row.text[i] : ''}`}
              onClick={() => saveItemGrade(s.id, a.id, node.id, g?.level === i ? { value: null, level: undefined } : { value: l.value, level: i })}>{i + 1}</button>
          ))}
        </span>
      ) : (
        <Cell value={g?.value} stamp={g?.updatedAt} label={`${s.lastName} · ${node.code}`} onSave={(v) => saveItemGrade(s.id, a.id, node.id, { value: v, level: undefined })} />
      )}
      <RecMark g={g} />
      {g?.value != null && <button className="small" title="Registrar recuperación" onClick={onRecover}>Rec.</button>}
      <span className="mute">{lv ? `${lv.label} · ${raw(lv.value)}${row?.text[g!.level!] ? ' — ' + row.text[g!.level!] : ''}` : ''}</span>
    </div>
  );
}

export function Notebook({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const rbRaw = useLiveQuery(() => db.rubrics.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const lkRaw = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const curr = { nodes, links: lkRaw ?? [] };
  const gl = subject.config.gradeLevel;
  const partLabel = gl ? (subject.levels.find((l) => l.key === gl)?.plural.toLowerCase() ?? 'partes') : 'instrumentos';
  // Columnas de resumen: competencias (si la nota sale de ellas) o instrumentos.
  const partsHead = gl
    ? nodes.filter((n) => n.level === gl).map((n) => ({ id: n.id, name: n.code, title: n.title }))
    : subject.instruments.map((i) => ({ id: i.id, name: i.name.slice(0, 10), title: `${i.name} (${i.weight} %)` }));
  const [items, setItems] = useState(true);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const planned = usePlannedSessions(group);
  const atRaw = useLiveQuery(() => (group ? db.attendance.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const [view, setView] = useState<'table' | 'act' | 'final'>('table');
  const [termId, setTermId] = useState('');
  const [actId, setActId] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(false);
  const [sigad, setSigad] = useState(false);
  const undoLabel = useSyncExternalStore(subscribeUndo, lastUndo);

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es'));
  const acRaw = useLiveQuery(() => (group ? db.activities.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const termIdx = (id: string) => subject.terms.findIndex((t) => t.id === id);
  const acts = (acRaw ?? []).filter((a) => !a.deleted).sort((a, b) => termIdx(a.termId) - termIdx(b.termId) || (a.date ?? '').localeCompare(b.date ?? '') || a.title.localeCompare(b.title, 'es'));
  const key = acts.map((a) => a.id).join(',');
  const grRaw = useLiveQuery(() => (acts.length ? db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : []), [key]);
  const idx = indexGrades(grRaw ?? []);
  const none = noGrades();
  const sgOf = (s: Student) => idx.get(s.id) ?? none;

  const term = subject.terms.find((t) => t.id === termId) ?? subject.terms[0];
  const termActs = acts.filter((a) => a.termId === term?.id);
  const act = acts.find((a) => a.id === actId) ?? termActs[0] ?? acts[0];
  const cfg = subject.config;
  const graded = gradedLevels(subject);
  const actItems = (a: Activity) => a.nodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n): n is CNode => !!n && graded.has(n.level));
  const rubricOf = (a: Activity) => (a.rubricId ? (rbRaw ?? []).find((r) => r.id === a.rubricId && !r.deleted) : undefined);
  const instName = (id: string) => subject.instruments.find((i) => i.id === id)?.name ?? '?';

  /** Tabla de notas para exportar (números sin redondear a texto). */
  function gradeTable(): (string | number | null)[][] {
    const head = ['Apellidos', 'Nombre', 'NIA', ...acts.map((a) => `${a.title} (${subject.terms.find((t) => t.id === a.termId)?.name})`), ...subject.terms.map((t) => t.name), 'Ordinaria', 'Vía', 'Oficial', ...(cfg.scale === 'ssapntsb' ? ['Calificación'] : [])];
    return [head, ...students.map((s) => {
      const m = sgOf(s);
      const o = outcome(subject, acts, m, curr, s);
      const f = o.ordinary;
      return [s.lastName, s.firstName, s.nia ?? '',
        ...acts.map((a) => round(activityBase(a, m), 2)),
        ...f.terms.map((t) => round(t.result.value, cfg.termDecimals)),
        f.rounded, o.source, o.official,
        ...(cfg.scale === 'ssapntsb' ? [scaleLabel(subject, o.official)] : [])];
    })];
  }
  /** Perfil de todo el curso: criterios y competencias específicas (o el nivel del que sale la nota). */
  function criteriaTable(): (string | number | null)[][] {
    const graded = gradedLevels(subject);
    const cols = nodes.filter((n) => graded.has(n.level) || n.level === gl);
    return [['Apellidos', 'Nombre', ...cols.map((n) => n.code)], ...students.map((s) => {
      const pr = profile(subject, nodes, curr.links, acts, sgOf(s));
      return [s.lastName, s.firstName, ...cols.map((n) => round(pr.nodes.get(n.id) ?? null, 2))];
    })];
  }
  function download(name: string, blob: Blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }
  function exportCsv() {
    const q = (x: string | number | null) => `"${(typeof x === 'number' ? String(x).replace('.', ',') : x ?? '').replace(/"/g, '""')}"`;
    const csv = gradeTable().map((r) => r.map(q).join(';')).join('\r\n');
    download(`notas-${group?.name ?? 'grupo'}.csv`, new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  }
  async function exportXlsx() {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const bold = (t: (string | number | null)[][]) => t.map((r, i) => (i === 0 ? r.map((v) => ({ value: v ?? '', fontWeight: 'bold' as const })) : r));
    const blob = await writeXlsxFile([
      { sheet: 'Notas', data: bold(gradeTable()), stickyRowsCount: 1 },
      { sheet: 'Criterios', data: bold(criteriaTable()), stickyRowsCount: 1 },
    ]).toBlob();
    download(`notas-${group?.name ?? 'grupo'}.xlsx`, blob);
  }

  /** Pregunta si sobrescribir las notas cambiadas en la app y muestra el resumen. */
  async function finish(r: PullResult, extra = '') {
    if (r.conflicts.length && confirm(`${r.conflicts.length} notas de Classroom son distintas a las que cambiaste en la app. ¿Sobrescribir con las de Classroom?`)) {
      await applyPending(r.conflicts);
      r = { ...r, applied: r.applied + r.conflicts.length, conflicts: [] };
    }
    setMsg(describe(r, extra));
  }
  async function pullGrades() {
    if (!act || !group) return;
    setBusy(true); setMsg('Consultando Classroom…');
    try { await undoable('notas de Classroom', async () => finish(await pullActivity(subject, act, group))); }
    catch (e) { setMsg('Error: ' + (e as Error).message); }
    finally { setBusy(false); }
  }
  async function pullAll(silent = false) {
    if (!group?.classroomCourseId) return;
    if (!silent) { setBusy(true); setMsg('Consultando Classroom…'); }
    try {
      const r = await undoable('notas de Classroom', () => pullGroup(subject, group, acts));
      localStorage.setItem('clsPull:' + group.id, String(Date.now()));
      if (silent) {
        if (r.applied || r.conflicts.length) setMsg(describe(r, ` (${r.count} tareas)`) + (r.conflicts.length ? '. Pulsa «Classroom ⟳» para revisarlas.' : ''));
      } else await undoable('notas de Classroom', () => finish(r, ` (${r.count} tareas)`));
    } catch (e) {
      if (!silent) setMsg('Error: ' + (e as Error).message);
    } finally {
      if (!silent) setBusy(false);
    }
  }
  // Al abrir el cuaderno con conexión, trae los cambios de Classroom (como mucho cada 30 min), sin pisar lo cambiado aquí.
  const linked = acts.filter((a) => a.classroomWorkId).length;
  useEffect(() => {
    if (!group?.classroomCourseId || !linked || !configured() || !navigator.onLine) return;
    if (Date.now() - Number(localStorage.getItem('clsPull:' + group.id) || 0) < 30 * 60_000) return;
    pullAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, linked]);

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;

  const LateBtn = ({ s, a }: { s: Student; a: Activity }) => {
    const g = sgOf(s).byActivity.get(a.id);
    if ((!cfg.latePenaltyPct && !cfg.lateNoImprove) || activityBase(a, sgOf(s)) == null) return null;
    const what = [cfg.latePenaltyPct ? `−${cfg.latePenaltyPct} %` : '', cfg.lateNoImprove ? 'no se podrá mejorar' : ''].filter(Boolean).join('; ');
    return <button className={'small late' + (g?.late ? ' on' : '')} title={`Entrega fuera de plazo sin justificar (${what})`} onClick={() => saveGrade(s.id, a.id, { late: !g?.late })}>T</button>;
  };

  /** Recuperación: guarda la nota anterior (la primera, si ya se recuperó antes) y cuenta la nueva. */
  async function recover(s: Student, a: Activity, node?: CNode) {
    const sg = sgOf(s);
    if (!canImprove(subject, sg.byActivity.get(a.id))) return alert('Entrega fuera de plazo sin justificar: no se puede mejorar.');
    const g = node ? sg.byItem.get(a.id)?.get(node.id) : sg.byActivity.get(a.id);
    const rubric = rubricOf(a);
    const row = node && rubric?.rows.find((r) => r.nodeId === node.id);
    const what = node ? node.code : a.title;
    const ans = prompt(row ? `Recuperación de ${what}: nivel (1–${rubric!.levels.length}). Antes: ${fmt(g?.value ?? null, 2)}` : `Nota de la recuperación de ${what} (antes ${fmt(g?.value ?? null, 2)})`);
    if (ans == null || ans.trim() === '') return;
    const prev = g?.recoveredAt ? g.prev ?? null : g?.value ?? null;
    const recoveredAt = new Date().toISOString().slice(0, 10);
    let patch: Partial<Grade>;
    if (row) {
      const i = Number(ans) - 1;
      if (!rubric!.levels[i]) return alert('Nivel no válido.');
      patch = { value: rubric!.levels[i].value, level: i, prev, recoveredAt };
    } else {
      const v = parse(ans);
      if (v == null) return alert('Nota no válida (0–10).');
      patch = { value: v, level: undefined, prev, recoveredAt };
    }
    await undoable('recuperación', () => (node ? saveItemGrade(s.id, a.id, node.id, patch) : saveGrade(s.id, a.id, patch)));
  }

  /** Entrega vacía o archivo corrupto: vale 0 (en todos sus criterios si se califica por criterio). */
  async function emptyDelivery(s: Student, a: Activity) {
    if (!confirm(`¿Entrega vacía o archivo corrupto de ${s.firstName} en «${a.title}»? Se calificará con 0.`)) return;
    const its = actItems(a);
    await undoable('entrega vacía', async () => {
      if (its.length && items) for (const n of its) await saveItemGrade(s.id, a.id, n.id, { value: 0, level: undefined });
      await saveGrade(s.id, a.id, { ...(its.length && items ? {} : { value: 0 }), comment: 'Entrega vacía o archivo corrupto' });
    });
  }

  return (
    <div>
      <div className="row">
        <select value={group.id} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Tabla</button>
        <button className={view === 'act' ? 'on' : ''} onClick={() => setView('act')}>Por actividad</button>
        <button className={view === 'final' ? 'on' : ''} onClick={() => setView('final')}>Final</button>
        <button className="small" onClick={exportCsv}>Exportar CSV</button>
        <button className="small" onClick={exportXlsx}>Exportar Excel</button>
        <button className="small" onClick={() => setImp(!imp)}>Importar notas</button>
        <button className="small" onClick={() => setSigad(!sigad)}>SIGAD</button>
        {undoLabel && <button className="small" onClick={async () => setMsg(`Deshecho: ${await undo()}.`)} title="Deshace el último cambio de notas de esta sesión">↶ Deshacer {undoLabel}</button>}
        {group.classroomCourseId && linked > 0 && <button className="small" disabled={busy} onClick={() => pullAll()} title="Traer notas y rúbricas de todas las tareas vinculadas">Classroom ⟳</button>}
      </div>

      {msg && <p className="mute">{msg}</p>}
      {sigad && <SigadExport subject={subject} students={students} acts={acts} sgOf={sgOf} curr={curr} onDone={(m) => { setSigad(false); if (m) setMsg(m); }} />}
      {imp && <ImportGrades subject={subject} students={students} acts={acts} sgOf={sgOf} onDone={(m) => { setImp(false); if (m) setMsg(m); }} />}
      {students.length === 0 && <p className="mute">Este grupo no tiene alumnos.</p>}
      {students.length > 0 && acts.length === 0 && <p className="mute">Crea actividades en el Planificador.</p>}

      {students.length > 0 && acts.length > 0 && view !== 'final' && (
        <div className="row">
          {view === 'table' ? (
            <select value={term.id} onChange={(e) => setTermId(e.target.value)}>
              {subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <select value={act?.id} onChange={(e) => setActId(e.target.value)}>
              {acts.map((a) => <option key={a.id} value={a.id}>{a.title} · {subject.terms.find((t) => t.id === a.termId)?.name}</option>)}
            </select>
          )}
        </div>
      )}

      {students.length > 0 && acts.length > 0 && view === 'table' && (
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Alumno</th>
                {termActs.map((a) => <th key={a.id} title={`${a.title} · ${instName(a.instrumentId)}`}>{a.title}<div className="mute">{instName(a.instrumentId).slice(0, 10)}</div>{gl && actItems(a).length === 0 && <div className="warn" title="Sin criterios: no cuenta para la nota">⚠ no cuenta</div>}</th>)}
                {partsHead.map((p) => <th key={p.id} className="sum" title={p.title}>{p.name}</th>)}
                <th className="sum">{term.name}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const r = termResult(subject, acts, sgOf(s), term.id, curr);
                return (
                  <tr key={s.id}>
                    <td>{s.lastName}, {s.firstName}</td>
                    {termActs.map((a) => <td key={a.id}><ActCell sg={sgOf(s)} s={s} a={a} /><LateBtn s={s} a={a} /></td>)}
                    {r.parts.map((i) => <td key={i.id} className={'sum' + (cfg.minPerInstrument && i.value != null && i.value < cfg.passMark ? ' warn' : '')}>{fmt(round(i.value, cfg.termDecimals), cfg.termDecimals)}</td>)}
                    <td className="sum" title={r.coverage < 1 ? `Provisional: ${Math.round(r.coverage * 100)} % de ${partLabel} con datos` : ''}>
                      {fmt(round(r.value, cfg.termDecimals), cfg.termDecimals)}{r.coverage < 1 && r.value != null ? '*' : ''}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="mute">Media</td>
                {termActs.map((a) => <td key={a.id} className="mute">{fmt(round(wmean(students.map((s): [Num, number] => [activityValue(a, sgOf(s), subject), 1])), 1), 1)}</td>)}
                <td colSpan={partsHead.length + 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === 'table' && students.length > 0 && <p className="mute">* Provisional: faltan {partLabel} por evaluar.{gl ? ` La nota de la evaluación es la media de las ${partLabel} evaluadas.` : ''} Lo no evaluado no cuenta como 0. Se guarda al salir de la casilla o con Intro. Las notas sombreadas son la media de los criterios (se editan en «Por actividad»).</p>}

      {students.length > 0 && acts.length > 0 && view === 'act' && act && (
        <div className="card">
          <b>{act.title}</b>
          <div className="mute">{instName(act.instrumentId)} · peso {act.weight}{act.maxPoints ? ` · ${act.maxPoints} pts en Classroom` : ''}{rubricOf(act) ? ` · rúbrica «${rubricOf(act)!.name}»` : ''}</div>
          {actItems(act).length > 0 ? (
            <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={items} onChange={(e) => setItems(e.target.checked)} /> Calificar por criterio ({actItems(act).length})</label>
          ) : (
            <p className="mute warn">Esta actividad no tiene criterios: solo admite nota global y no aporta al perfil competencial. Añádelos en el Planificador.</p>
          )}
          {act.classroomWorkId && group.classroomCourseId && (
            <div className="row">
              <button className="small" disabled={busy} onClick={pullGrades}>Traer notas de Classroom</button>
              <PushGrades act={act} group={group} students={students} grades={grRaw ?? []} onMsg={setMsg} />
            </div>
          )}
          {act.fromObs && <ObsPanel subject={subject} group={group} act={act} students={students} att={(atRaw ?? []).filter((r) => !r.deleted)} sgOf={sgOf} onMsg={setMsg} />}
          {act.rubric && <RubricMap key={act.id + (act.updatedAt ?? 0)} subject={subject} act={act} nodes={nodes} onResult={(r) => finish(r, ' con el nuevo emparejamiento')} />}
          {students.map((s) => {
            const g = sgOf(s).byActivity.get(act.id);
            const its = items ? actItems(act) : [];
            return (
              <div key={s.id}>
                <div className="issue sp" style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{s.lastName}, {s.firstName}</span>
                  <input className="cell" style={{ width: 140 }} placeholder="Comentario" defaultValue={g?.comment ?? ''} key={'c' + (g?.updatedAt ?? 0)}
                    onBlur={(e) => e.target.value !== (g?.comment ?? '') && saveGrade(s.id, act.id, { comment: e.target.value || undefined })} />
                  <span><ActCell sg={sgOf(s)} s={s} a={act} /><LateBtn s={s} a={act} /></span>
                  <span className="row" style={{ margin: 0, gap: 4 }}>
                    {itemGrades(act, sgOf(s)).length === 0 && g?.value != null && <button className="small" title="Registrar recuperación (se guarda la nota anterior)" onClick={() => recover(s, act)}>Rec.</button>}
                    <button className="small" title="Entrega vacía o archivo corrupto: 0" onClick={() => emptyDelivery(s, act)}>∅</button>
                  </span>
                </div>
                {its.length > 0 && (
                  <div className="items">
                    {its.map((n) => <ItemRow key={n.id} s={s} a={act} node={n} g={sgOf(s).byItem.get(act.id)?.get(n.id)} rubric={rubricOf(act)} onRecover={() => recover(s, act, n)} />)}
                  </div>
                )}
                {act.rubric && g?.rubric?.length ? (
                  <details className="mute" style={{ padding: '2px 0 6px 8px' }}>
                    <summary>Rúbrica</summary>
                    {act.rubric.criteria.map((c) => {
                      const rg = g.rubric!.find((x) => x.criterionId === c.id);
                      const lv = c.levels.find((l) => l.id === rg?.levelId);
                      return <div key={c.id}>{c.title || 'Criterio'}: {lv?.title || '—'} ({rg?.points ?? '—'} pts)</div>;
                    })}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {students.length > 0 && acts.length > 0 && view === 'final' && (
        <FinalView subject={subject} students={students} acts={acts} sgOf={sgOf} curr={curr} att={(atRaw ?? []).filter((r) => !r.deleted)} partLabel={partLabel} planned={planned} />
      )}
    </div>
  );
}
