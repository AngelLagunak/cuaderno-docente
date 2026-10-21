import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveGrade, saveItemGrade } from '../data/db';
import { callScript } from '../data/api';
import type { CGrades } from '../data/api';
import { useGroups, useNodes } from './hooks';
import { activityBase, activityValue, finalResult, indexGrades, itemGrades, noGrades, round, termResult, wmean } from '../core/evaluation';
import type { Num, StudentGrades } from '../core/evaluation';
import { gradedLevels } from '../core/curriculum';
import type { Activity, CNode, Grade, Rubric, Student, Subject } from '../core/model';

const fmt = (v: Num, d: number) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const raw = (v: Num | undefined) => (v == null ? '' : String(v).replace('.', ','));
const parse = (t: string): Num | undefined => {
  const s = t.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined;
};

function Cell({ g, label, onSave }: { g?: Grade; label: string; onSave: (v: number | null) => void }) {
  const [bad, setBad] = useState(false);
  return (
    <input
      className={'cell' + (bad ? ' bad' : '')}
      inputMode="decimal"
      defaultValue={raw(g?.value)}
      key={g?.updatedAt ?? 0}
      aria-label={label}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={(e) => {
        const v = parse(e.target.value);
        if (v === undefined) { setBad(true); e.target.value = raw(g?.value); return; }
        setBad(false);
        if (v !== (g?.value ?? null)) onSave(v);
      }}
    />
  );
}

/** Casilla de la nota de una actividad: editable, o calculada si se ha calificado por criterios. */
function ActCell({ sg, s, a }: { sg: StudentGrades; s: Student; a: Activity }) {
  const n = itemGrades(a, sg).length;
  if (n) return <span className="cell calc" title={`Media de ${n} criterios`}>{fmt(activityBase(a, sg), 2)}</span>;
  return <Cell g={sg.byActivity.get(a.id)} label={`${s.lastName} · ${a.title}`} onSave={(v) => saveGrade(s.id, a.id, { value: v })} />;
}

/** Nota de un criterio: botones de nivel si la rúbrica de la actividad tiene fila para él; si no, casilla numérica. */
function ItemRow({ s, a, node, g, rubric }: { s: Student; a: Activity; node: CNode; g?: Grade; rubric?: Rubric }) {
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
        <Cell g={g} label={`${s.lastName} · ${node.code}`} onSave={(v) => saveItemGrade(s.id, a.id, node.id, { value: v, level: undefined })} />
      )}
      <span className="mute">{lv ? `${lv.label} · ${raw(lv.value)}${row?.text[g!.level!] ? ' — ' + row.text[g!.level!] : ''}` : ''}</span>
    </div>
  );
}

export function Notebook({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const rbRaw = useLiveQuery(() => db.rubrics.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const [items, setItems] = useState(true);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [view, setView] = useState<'table' | 'act' | 'final'>('table');
  const [termId, setTermId] = useState('');
  const [actId, setActId] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

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

  function exportCsv() {
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const head = ['Apellidos', 'Nombre', ...acts.map((a) => `${a.title} (${subject.terms.find((t) => t.id === a.termId)?.name})`), ...subject.terms.map((t) => t.name), 'Final'];
    const lines = students.map((s) => {
      const m = sgOf(s);
      const f = finalResult(subject, acts, m);
      return [s.lastName, s.firstName,
        ...acts.map((a) => raw(round(activityBase(a, m), 2))),
        ...f.terms.map((t) => fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)),
        fmt(f.rounded, cfg.finalDecimals)].map((x) => q(String(x))).join(';');
    });
    const blob = new Blob(['\ufeff' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notas-${group?.name ?? 'grupo'}.csv`;
    a.click();
  }

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;

  async function pullGrades() {
    if (!act?.classroomWorkId || !group?.classroomCourseId) return;
    setBusy(true); setMsg('Consultando Classroom…');
    try {
      const r = await callScript<CGrades>('classroom.grades', { courseId: group.classroomCourseId, courseWorkId: act.classroomWorkId });
      const max = r.maxPoints ?? act.maxPoints;
      if (!max) throw new Error('La tarea no tiene puntuación máxima en Classroom.');
      const byUser = new Map(students.filter((s) => s.classroomUserId).map((s) => [s.classroomUserId!, s]));
      const fresh: [Student, number | null, Grade['rubric']][] = [];
      const changed: [Student, number | null, Grade['rubric']][] = [];
      let unmatched = 0;
      for (const sub of r.submissions) {
        const st = byUser.get(sub.userId);
        if (!st) { unmatched++; continue; }
        const pts = sub.assignedGrade ?? sub.draftGrade;
        const v = pts == null ? null : Math.round((pts / max) * 1000) / 100;
        if (v == null && !sub.rubricGrades.length) continue;
        const cur = sgOf(st).byActivity.get(act.id)?.value ?? null;
        (cur == null || v == null || cur === v ? fresh : changed).push([st, v, sub.rubricGrades.length ? sub.rubricGrades : undefined]);
      }
      const overwrite = changed.length > 0 && confirm(`${changed.length} alumnos ya tienen una nota distinta. ¿Sobrescribir con la de Classroom?`);
      for (const [st, v, rb] of [...fresh, ...(overwrite ? changed : [])]) {
        await saveGrade(st.id, act.id, { ...(v != null ? { value: v } : {}), ...(rb ? { rubric: rb } : {}) });
      }
      if (r.rubric || act.maxPoints !== max) await db.activities.put({ ...act, maxPoints: max, ...(r.rubric ? { rubric: r.rubric } : {}), updatedAt: Date.now() });
      setMsg(`Importadas ${fresh.length + (overwrite ? changed.length : 0)} notas` +
        (changed.length && !overwrite ? `, ${changed.length} distintas sin sobrescribir` : '') +
        (unmatched ? `, ${unmatched} alumnos de Classroom sin coincidencia (importa antes los alumnos)` : '') +
        (r.rubric ? '. Rúbrica incluida.' : r.rubricError ? `. Rúbrica no disponible: ${r.rubricError}` : '. La tarea no tiene rúbrica.'));
    } catch (e) {
      setMsg('Error: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const LateBtn = ({ s, a }: { s: Student; a: Activity }) => {
    const g = sgOf(s).byActivity.get(a.id);
    if (!cfg.latePenaltyPct || activityBase(a, sgOf(s)) == null) return null;
    return <button className={'small late' + (g?.late ? ' on' : '')} title={`Entrega tardía (−${cfg.latePenaltyPct} %)`} onClick={() => saveGrade(s.id, a.id, { late: !g?.late })}>T</button>;
  };

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
      </div>

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
                {termActs.map((a) => <th key={a.id} title={`${a.title} · ${instName(a.instrumentId)}`}>{a.title}<div className="mute">{instName(a.instrumentId).slice(0, 10)}</div></th>)}
                {subject.instruments.map((i) => <th key={i.id} className="sum">{i.name.slice(0, 10)}</th>)}
                <th className="sum">{term.name}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const r = termResult(subject, acts, sgOf(s), term.id);
                return (
                  <tr key={s.id}>
                    <td>{s.lastName}, {s.firstName}</td>
                    {termActs.map((a) => <td key={a.id}><ActCell sg={sgOf(s)} s={s} a={a} /><LateBtn s={s} a={a} /></td>)}
                    {r.byInstrument.map((i) => <td key={i.id} className={'sum' + (cfg.minPerInstrument && i.value != null && i.value < cfg.passMark ? ' warn' : '')}>{fmt(round(i.value, cfg.termDecimals), cfg.termDecimals)}</td>)}
                    <td className="sum" title={r.coverage < 1 ? `Provisional: ${Math.round(r.coverage * 100)} % de instrumentos con datos` : ''}>
                      {fmt(round(r.value, cfg.termDecimals), cfg.termDecimals)}{r.coverage < 1 && r.value != null ? '*' : ''}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="mute">Media</td>
                {termActs.map((a) => <td key={a.id} className="mute">{fmt(round(wmean(students.map((s): [Num, number] => [activityValue(a, sgOf(s), subject), 1])), 1), 1)}</td>)}
                <td colSpan={subject.instruments.length + 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === 'table' && students.length > 0 && <p className="mute">* Provisional: faltan instrumentos por evaluar. Lo no evaluado no cuenta como 0. Se guarda al salir de la casilla o con Intro. Las notas sombreadas son la media de los criterios (se editan en «Por actividad»).</p>}

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
            <div className="row"><button className="small" disabled={busy} onClick={pullGrades}>Traer notas de Classroom</button></div>
          )}
          {msg && <p className="mute">{msg}</p>}
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
                </div>
                {its.length > 0 && (
                  <div className="items">
                    {its.map((n) => <ItemRow key={n.id} s={s} a={act} node={n} g={sgOf(s).byItem.get(act.id)?.get(n.id)} rubric={rubricOf(act)} />)}
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
        <div className="tw">
          <table className="t">
            <thead>
              <tr>
                <th>Alumno</th>
                {subject.terms.map((t) => <th key={t.id}>{t.name}</th>)}
                <th className="sum">Final</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const f = finalResult(subject, acts, sgOf(s));
                const fail = f.rounded != null && f.rounded < cfg.passMark;
                return (
                  <tr key={s.id}>
                    <td>{s.lastName}, {s.firstName}</td>
                    {f.terms.map((t) => (
                      <td key={t.id} className={t.result.belowMin.length ? 'warn' : ''} title={t.result.belowMin.length ? `Bajo mínimo: ${t.result.belowMin.join(', ')}` : ''}>
                        {fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)}
                      </td>
                    ))}
                    <td className={'sum' + (fail || f.belowMin ? ' warn' : '')} title={f.belowMin ? 'Algún instrumento por debajo del mínimo' : f.coverage < 1 ? 'Provisional' : ''}>
                      {fmt(f.rounded, cfg.finalDecimals)}{f.coverage < 1 && f.value != null ? '*' : ''}{f.belowMin ? '!' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {view === 'final' && <p className="mute">Final = media ponderada de las evaluaciones con datos. * provisional. ! algún instrumento bajo el mínimo (en rojo).</p>}
    </div>
  );
}
