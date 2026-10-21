import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../data/db';
import { useGroups, useNodes } from './hooks';
import { activityBase, finalResult, indexGrades, itemGrades, noGrades, profile, round, wmean } from '../core/evaluation';
import { outcome, scaleLabel } from '../core/rules';
import type { Num, Profile } from '../core/evaluation';
import type { Student, Subject } from '../core/model';

const fmt = (v: Num, d: number) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const tick = { fill: 'currentColor', fontSize: 11 };

type Axis = { id: string; axis: string; title: string; v: Num };
type Series = { key: string; name: string; axes: Axis[] };
const COLORS = ['#2d4a7a', '#e08a1e', '#2e7d4f', '#9c3d8f', '#b54708'];

export function Reports({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [view, setView] = useState<'student' | 'group'>('student');
  const [sid, setSid] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [axisKey, setAxisKey] = useState('');
  const [cmp, setCmp] = useState<'none' | 'group' | 'terms'>('group');
  const [gTerms, setGTerms] = useState(false);

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = useMemo(() => (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es')), [stRaw]);
  const acRaw = useLiveQuery(() => (group ? db.activities.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const acts = useMemo(() => (acRaw ?? []).filter((a) => !a.deleted), [acRaw]);
  const key = acts.map((a) => a.id).join(',');
  const grRaw = useLiveQuery(() => (acts.length ? db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : []), [key]);
  const lkRaw = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const links = useMemo(() => (lkRaw ?? []).filter((l) => !l.deleted), [lkRaw]);

  const idx = useMemo(() => indexGrades(grRaw ?? []), [grRaw]);
  const gradesOf = (s: Student) => idx.get(s.id) ?? noGrades();

  const cfg = subject.config;
  const gl = cfg.gradeLevel;
  const glLabel = subject.levels.find((l) => l.key === gl)?.label ?? '';
  const glPlural = subject.levels.find((l) => l.key === gl)?.plural ?? '';
  const tid = periodId || undefined;
  const rows = students.map((s) => {
    const m = gradesOf(s);
    return { s, m, fin: finalResult(subject, acts, m, { nodes, links }), prof: profile(subject, nodes, links, acts, m, tid) };
  });

  const axisOpts = [
    ...subject.levels.map((l) => ({ key: l.key, label: l.plural })),
    ...(nodes.some((n) => n.group) ? [{ key: '@group', label: 'Competencias clave (por grupo)' }] : []),
  ];
  const axesOf = (p: Profile, k: string): Axis[] =>
    k === '@group'
      ? [...new Set(nodes.filter((n) => n.group).map((n) => n.group!))].map((g) => ({ id: g, axis: g, title: g, v: p.groups.get(g) ?? null }))
      : nodes.filter((n) => n.level === k).map((n) => ({ id: n.id, axis: n.code, title: n.title, v: p.nodes.get(n.id) ?? null }));
  const hasData = (k: string) => rows.some((r) => axesOf(r.prof, k).some((a) => a.v != null));
  const effKey = axisKey || axisOpts.find((o) => hasData(o.key))?.key || axisOpts[0]?.key || '';

  // media del grupo por eje
  const meanAxes = (profs: Profile[], k: string): Axis[] => {
    const per = profs.map((p) => axesOf(p, k));
    return (per[0] ?? []).map((a, i) => ({ ...a, v: wmean(per.map((x): [Num, number] => [x[i].v, 1])) }));
  };
  const groupAxes = (k: string) => meanAxes(rows.map((r) => r.prof), k);
  const withData = (s: Series) => s.axes.some((a) => a.v != null);

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;
  const student = students.find((s) => s.id === sid) ?? students[0];
  const sr = rows.find((r) => r.s.id === student?.id);
  const nodeCode = (id: string) => nodes.find((n) => n.id === id)?.code ?? '?';
  const termName = (id: string) => subject.terms.find((t) => t.id === id)?.name ?? '';

  /** Radar con una serie por alumno, grupo o evaluación, y tabla con los valores ("Sin evaluar" en vez de 0). */
  const chart = (series: Series[]) => {
    const base = series[0]?.axes ?? [];
    const data = base.map((a, i) => ({ axis: a.axis, ...Object.fromEntries(series.map((x) => [x.key, x.axes[i]?.v ?? 0])) }));
    return (
      <>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <RadarChart data={data} outerRadius="70%">
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" tick={tick} />
              <PolarRadiusAxis domain={[0, 10]} tick={tick} />
              {series.map((x, i) => <Radar key={x.key} name={x.name} dataKey={x.key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.2} isAnimationActive={false} />)}
              <Tooltip />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="tw">
          <table className="t c">
            <thead><tr><th>Eje</th>{series.map((x) => <th key={x.key}>{x.name}</th>)}</tr></thead>
            <tbody>
              {base.map((a, i) => (
                <tr key={a.id}>
                  <td title={a.title} className="wrap"><b>{a.axis}</b> <span className="mute">{a.title.slice(0, 40)}{a.title.length > 40 ? '…' : ''}</span></td>
                  {series.map((x) => { const v = x.axes[i]?.v ?? null; return <td key={x.key} className={v == null ? 'mute' : ''}>{v == null ? 'Sin evaluar' : fmt(round(v, 2), 2)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const periodSel = (
    <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
      <option value="">Todo el curso</option>
      {subject.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
  const axisSel = (
    <select value={effKey} onChange={(e) => setAxisKey(e.target.value)}>
      {axisOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );

  return (
    <div>
      <div className="row noprint">
        <select value={group.id} onChange={(e) => setGid(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.schoolYear}</option>)}
        </select>
        <button className={view === 'student' ? 'on' : ''} onClick={() => setView('student')}>Alumno</button>
        <button className={view === 'group' ? 'on' : ''} onClick={() => setView('group')}>Grupo</button>
        <button className="small" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      {students.length === 0 && <p className="mute">Este grupo no tiene alumnos.</p>}

      {students.length > 0 && view === 'student' && student && sr && (() => {
        const series: Series[] = cmp === 'terms'
          ? subject.terms.map((t) => ({ key: t.id, name: t.name, axes: axesOf(profile(subject, nodes, links, acts, sr.m, t.id), effKey) })).filter(withData)
          : [{ key: 'alumno', name: 'Alumno', axes: axesOf(sr.prof, effKey) }, ...(cmp === 'group' ? [{ key: 'grupo', name: 'Media del grupo', axes: groupAxes(effKey) }] : [])];
        return (
          <div>
            <div className="row noprint">
              <select value={student.id} onChange={(e) => setSid(e.target.value)}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
              </select>
              {cmp !== 'terms' && periodSel}{axisSel}
              <select value={cmp} onChange={(e) => setCmp(e.target.value as typeof cmp)}>
                <option value="none">Sin comparar</option>
                <option value="group">Comparar con la media del grupo</option>
                <option value="terms">Comparar evaluaciones</option>
              </select>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{student.firstName} {student.lastName}</h3>
              <p className="mute">{subject.name} · {group.name} · {group.schoolYear}</p>
              <div className="tw">
                <table className="t">
                  <thead><tr><th>{gl ? glLabel : 'Instrumento'}</th>{subject.terms.map((t) => <th key={t.id}>{t.name}</th>)}</tr></thead>
                  <tbody>
                    {(sr.fin.terms[0]?.result.parts ?? []).map((p, k) => (
                      <tr key={p.id}>
                        <td title={gl ? nodes.find((n) => n.id === p.id)?.title : undefined}>{gl ? p.name : `${p.name} (${p.weight})`}</td>
                        {sr.fin.terms.map((t) => {
                          const v = t.result.parts[k]?.value ?? null;
                          return <td key={t.id} className={cfg.minPerInstrument && v != null && v < cfg.passMark ? 'warn' : ''}>{fmt(round(v, cfg.termDecimals), cfg.termDecimals)}</td>;
                        })}
                      </tr>
                    ))}
                    <tr className="sum">
                      <td>Evaluación ({sr.fin.terms.map((t) => t.weight).join('/')})</td>
                      {sr.fin.terms.map((t) => <td key={t.id}>{fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              {(() => {
                const o = outcome(subject, acts, sr.m, { nodes, links }, student);
                const sl = scaleLabel(subject, o.official);
                return o.source !== 'ordinaria' ? (
                  <p><b>Nota oficial: {fmt(o.official, cfg.finalDecimals)}{sl ? ` (${sl})` : ''}</b> <span className="mute">· {o.source}{o.lec ? ` (carpeta ${fmt(student.lecGrades?.folder ?? null, 1)}, examen ${fmt(student.lecGrades?.exam ?? null, 1)})` : ''}{o.extra ? ` (proyectos ${fmt(student.extra?.projects ?? null, 1)}, examen ${fmt(student.extra?.exam ?? null, 1)}${o.extra.blocked ? '; no hace media' : ''})` : ''}</span></p>
                ) : sl ? <p><b>Calificación: {sl}</b></p> : null;
              })()}
              <p><b>{student.lec ? 'Ordinaria (no cuenta)' : 'Nota final ordinaria'}: {fmt(sr.fin.rounded, cfg.finalDecimals)}</b> {sr.fin.coverage < 1 && sr.fin.value != null && <span className="mute">(provisional)</span>}
                {sr.fin.belowMin && <span className="warn"> · {gl ? `alguna ${glLabel.toLowerCase()} por debajo de ${cfg.passMark}` : 'algún instrumento bajo el mínimo'}</span>}</p>
              {gl && <p className="mute">Cada evaluación es la media de las {glPlural.toLowerCase()} evaluadas; cada criterio combina sus medidas con el peso de cada instrumento ({subject.instruments.map((i) => `${i.name} ${i.weight}`).join(', ')}).</p>}
            </div>

            <div className="card">
              <b>Perfil competencial</b> <span className="mute">{cmp === 'terms' ? 'por evaluación' : periodId ? termName(periodId) : 'todo el curso'}</span>
              {series.length > 0 && withData(series[0]) ? (
                chart(series)
              ) : (
                <p className="mute">Sin datos. El perfil sale de las actividades que tienen elementos curriculares vinculados y calificados.</p>
              )}
            </div>

            <details className="card">
              <summary>De dónde sale cada nota</summary>
              {subject.terms.map((t) => {
                const list = acts.filter((a) => a.termId === t.id);
                return (
                  <div key={t.id}>
                    <b className="mute">{t.name}</b>
                    {list.length === 0 && <p className="mute">Sin actividades.</p>}
                    {list.map((a) => {
                      const g = sr.m.byActivity.get(a.id);
                      const items = itemGrades(a, sr.m);
                      return (
                        <div className="issue sp" key={a.id}>
                          <span>{a.title} <span className="mute">· {subject.instruments.find((i) => i.id === a.instrumentId)?.name} · peso {a.weight}</span>
                            {items.length > 0 && <div className="mute">Media de: {items.map((x) => `${nodeCode(x.nodeId!)} ${fmt(x.value, 1)}${x.recoveredAt ? ` (recuperado; antes ${fmt(x.prev ?? null, 1)})` : ''}`).join(' · ')}</div>}
                            {g?.recoveredAt && <div className="mute">Recuperada el {g.recoveredAt}; antes {fmt(g.prev ?? null, 1)}</div>}
                          </span>
                          <span>{fmt(activityBase(a, sr.m), 1)}{g?.late ? ' (tardía)' : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </details>
          </div>
        );
      })()}

      {students.length > 0 && view === 'group' && (() => {
        const finals = rows.map((r) => r.fin).filter((f) => f.rounded != null);
        const fv = finals.map((f) => f.rounded as number);
        const mean = wmean(fv.map((v): [Num, number] => [v, 1]));
        const pass = fv.filter((v) => v >= cfg.passMark).length;
        const bins = [['0–4,9', 0, 5], ['5–6,9', 5, 7], ['7–8,9', 7, 9], ['9–10', 9, 11]] as const;
        const dist = bins.map(([name, lo, hi]) => ({ name, alumnos: fv.filter((v) => v >= lo && v < hi).length }));
        const termMeans = subject.terms.map((t, i) => ({
          name: t.name,
          media: wmean(rows.map((r): [Num, number] => [r.fin.terms[i].result.value, 1])),
        }));
        const gSeries: Series[] = gTerms
          ? subject.terms.map((t) => ({ key: t.id, name: t.name, axes: meanAxes(rows.map((r) => profile(subject, nodes, links, acts, r.m, t.id)), effKey) })).filter(withData)
          : [{ key: 'grupo', name: 'Media del grupo', axes: groupAxes(effKey) }];
        const graded = new Set(subject.levels.filter((l) => l.graded).map((l) => l.key));
        const nodeMeans = nodes.filter((n) => graded.has(n.level)).map((n) => ({
          n, v: wmean(rows.map((r): [Num, number] => [r.prof.nodes.get(n.id) ?? null, 1])),
        })).filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
        return (
          <div>
            <div className="row noprint">
              {!gTerms && periodSel}{axisSel}
              <label><input type="checkbox" style={{ width: 'auto' }} checked={gTerms} onChange={(e) => setGTerms(e.target.checked)} /> Comparar evaluaciones</label>
            </div>
            <div className="card">
              <b>{group.name}</b> · {fv.length} de {students.length} alumnos con nota final
              <p>Media: <b>{fmt(round(mean, 2), 2)}</b> · Aprobados: <b>{pass}</b> · Suspensos: <b>{fv.length - pass}</b></p>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={dist}><XAxis dataKey="name" tick={tick} /><YAxis allowDecimals={false} tick={tick} /><Tooltip /><Bar dataKey="alumnos" fill="#2d4a7a" /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <b>Media por evaluación</b>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={termMeans.map((t) => ({ name: t.name, media: t.media == null ? 0 : Math.round(t.media * 100) / 100 }))}>
                    <XAxis dataKey="name" tick={tick} /><YAxis domain={[0, 10]} tick={tick} /><Tooltip /><Bar dataKey="media" fill="#e08a1e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <b>Perfil del grupo</b> <span className="mute">{gTerms ? 'por evaluación' : periodId ? termName(periodId) : 'todo el curso'}</span>
              {gSeries.length > 0 && withData(gSeries[0]) ? chart(gSeries) : <p className="mute">Sin datos competenciales.</p>}
            </div>
            {nodeMeans.length > 0 && (
              <div className="card">
                <b>Mejores y peores elementos evaluables</b>
                {[...nodeMeans.slice(0, 3), ...(nodeMeans.length > 6 ? nodeMeans.slice(-3) : nodeMeans.slice(3))].map(({ n, v }) => (
                  <div className="issue" key={n.id}><b>{n.code}</b><span>{n.title.slice(0, 70)}{n.title.length > 70 ? '…' : ''} — <b>{fmt(round(v, 2), 2)}</b></span></div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
