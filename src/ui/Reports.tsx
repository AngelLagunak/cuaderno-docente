import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../data/db';
import { useGroups, useNodes } from './hooks';
import { finalResult, profile, round, wmean } from '../core/evaluation';
import type { Num, Profile } from '../core/evaluation';
import type { Grade, Student, Subject } from '../core/model';

const fmt = (v: Num, d: number) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
const tick = { fill: 'currentColor', fontSize: 11 };

type Axis = { id: string; axis: string; title: string; v: Num };

export function Reports({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const [gid, setGid] = useState('');
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const [view, setView] = useState<'student' | 'group'>('student');
  const [sid, setSid] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [axisKey, setAxisKey] = useState('');
  const [cmp, setCmp] = useState(true);

  const stRaw = useLiveQuery(() => (group ? db.students.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const students = useMemo(() => (stRaw ?? []).filter((s) => !s.deleted).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'es')), [stRaw]);
  const acRaw = useLiveQuery(() => (group ? db.activities.where('groupId').equals(group.id).toArray() : []), [group?.id]);
  const acts = useMemo(() => (acRaw ?? []).filter((a) => !a.deleted), [acRaw]);
  const key = acts.map((a) => a.id).join(',');
  const grRaw = useLiveQuery(() => (acts.length ? db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : []), [key]);
  const lkRaw = useLiveQuery(() => db.links.where('subjectId').equals(subject.id).toArray(), [subject.id]);
  const links = useMemo(() => (lkRaw ?? []).filter((l) => !l.deleted), [lkRaw]);

  const gm = useMemo(() => new Map((grRaw ?? []).filter((g) => !g.deleted).map((g) => [`${g.studentId}|${g.activityId}`, g])), [grRaw]);
  const gradesOf = (s: Student) => new Map(acts.flatMap((a) => { const g = gm.get(`${s.id}|${a.id}`); return g ? [[a.id, g] as [string, Grade]] : []; }));

  const cfg = subject.config;
  const tid = periodId || undefined;
  const rows = students.map((s) => {
    const m = gradesOf(s);
    return { s, m, fin: finalResult(subject, acts, m), prof: profile(subject, nodes, links, acts, m, tid) };
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
  const groupAxes = (k: string): Axis[] => {
    const per = rows.map((r) => axesOf(r.prof, k));
    return (per[0] ?? []).map((a, i) => ({ ...a, v: wmean(per.map((x): [Num, number] => [x[i].v, 1])) }));
  };

  if (!group) return <p className="mute">Crea un grupo y alumnos en la pestaña Grupos.</p>;
  const student = students.find((s) => s.id === sid) ?? students[0];
  const sr = rows.find((r) => r.s.id === student?.id);
  const termName = (id: string) => subject.terms.find((t) => t.id === id)?.name ?? '';

  const radar = (data: Record<string, unknown>[], series: [string, string, string][]) => (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={tick} />
          <PolarRadiusAxis domain={[0, 10]} tick={tick} />
          {series.map(([k, name, color]) => <Radar key={k} name={name} dataKey={k} stroke={color} fill={color} fillOpacity={0.25} />)}
          <Tooltip />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );

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
        const axes = axesOf(sr.prof, effKey);
        const gAxes = groupAxes(effKey);
        const data = axes.map((a, i) => ({ axis: a.axis, alumno: a.v ?? 0, grupo: gAxes[i]?.v ?? 0 }));
        const missing = axes.filter((a) => a.v == null).map((a) => a.axis);
        return (
          <div>
            <div className="row noprint">
              <select value={student.id} onChange={(e) => setSid(e.target.value)}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
              </select>
              {periodSel}{axisSel}
              <label><input type="checkbox" style={{ width: 'auto' }} checked={cmp} onChange={(e) => setCmp(e.target.checked)} /> Media del grupo</label>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{student.firstName} {student.lastName}</h3>
              <p className="mute">{subject.name} · {group.name} · {group.schoolYear}</p>
              <div className="tw">
                <table className="t">
                  <thead><tr><th>Instrumento</th>{subject.terms.map((t) => <th key={t.id}>{t.name}</th>)}</tr></thead>
                  <tbody>
                    {subject.instruments.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name} ({i.weight})</td>
                        {sr.fin.terms.map((t) => <td key={t.id}>{fmt(round(t.result.byInstrument.find((x) => x.id === i.id)?.value ?? null, cfg.termDecimals), cfg.termDecimals)}</td>)}
                      </tr>
                    ))}
                    <tr className="sum">
                      <td>Evaluación ({sr.fin.terms.map((t) => t.weight).join('/')})</td>
                      {sr.fin.terms.map((t) => <td key={t.id}>{fmt(round(t.result.value, cfg.termDecimals), cfg.termDecimals)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p><b>Nota final: {fmt(sr.fin.rounded, cfg.finalDecimals)}</b> {sr.fin.coverage < 1 && sr.fin.value != null && <span className="mute">(provisional)</span>}
                {sr.fin.belowMin && <span className="warn"> · algún instrumento bajo el mínimo</span>}</p>
            </div>

            <div className="card">
              <b>Perfil competencial</b> <span className="mute">{periodId ? termName(periodId) : 'todo el curso'}</span>
              {data.some((d) => d.alumno > 0) ? (
                <>
                  {radar(data, [['alumno', 'Alumno', '#2d4a7a'], ...(cmp ? [['grupo', 'Grupo', '#e08a1e'] as [string, string, string]] : [])])}
                  {missing.length > 0 && <p className="mute">Sin evaluar: {missing.join(', ')}</p>}
                </>
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
                      const g = gm.get(`${student.id}|${a.id}`);
                      return (
                        <div className="issue sp" key={a.id}>
                          <span>{a.title} <span className="mute">· {subject.instruments.find((i) => i.id === a.instrumentId)?.name} · peso {a.weight}</span></span>
                          <span>{fmt(g?.value ?? null, 1)}{g?.late ? ' (tardía)' : ''}</span>
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
        const axes = groupAxes(effKey);
        const gdata = axes.map((a) => ({ axis: a.axis, grupo: a.v ?? 0 }));
        const graded = new Set(subject.levels.filter((l) => l.graded).map((l) => l.key));
        const nodeMeans = nodes.filter((n) => graded.has(n.level)).map((n) => ({
          n, v: wmean(rows.map((r): [Num, number] => [r.prof.nodes.get(n.id) ?? null, 1])),
        })).filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
        return (
          <div>
            <div className="row noprint">{periodSel}{axisSel}</div>
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
              <b>Perfil del grupo</b>
              {gdata.some((d) => d.grupo > 0) ? radar(gdata, [['grupo', 'Media del grupo', '#2d4a7a']]) : <p className="mute">Sin datos competenciales.</p>}
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
