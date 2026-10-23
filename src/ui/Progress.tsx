import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { indexGrades, noGrades, round, termResult, activityBase } from '../core/evaluation';
import { BUCKETS, gradeSummary, sessionProgress } from '../core/progress';
import { parseHolidays, ymd } from '../core/planning';
import type { Subject } from '../core/model';
import { useCurrentGroupId, useGroups, useNodes, useSchoolCalendar } from './hooks';
import { fmt, raw } from './cells';
import { TeacherReport } from './TeacherReport';

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

/** Seguimiento del grupo: avance de la programación (sesiones) y resultados académicos por evaluación. */
export function Progress({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const [gid] = useCurrentGroupId();
  const group = groups.find((g) => g.id === gid) ?? groups[0];
  const nodes = useNodes(subject.id);
  const cal = useSchoolCalendar(group?.schoolYear);
  const [tab, setTab] = useState<'plan' | 'res' | 'rep'>('plan');
  const [termId, setTermId] = useState(subject.terms[0]?.id ?? '');
  const today = ymd(new Date());
  const d = useLiveQuery(async () => {
    if (!group) return null;
    const [units, sessions, attendance, students, activities, links] = await Promise.all([
      db.units.where('subjectId').equals(subject.id).toArray(), db.sessions.where('groupId').equals(group.id).toArray(),
      db.attendance.where('groupId').equals(group.id).toArray(), db.students.where('groupId').equals(group.id).toArray(),
      db.activities.where('groupId').equals(group.id).toArray(), db.links.where('subjectId').equals(subject.id).toArray(),
    ]);
    const acts = activities.filter((a) => !a.deleted);
    const grades = acts.length ? await db.grades.where('activityId').anyOf(acts.map((a) => a.id)).toArray() : [];
    return { units, sessions, attendance, students: students.filter((s) => !s.deleted), acts, grades, links };
  }, [group?.id, subject.id]);
  if (!group) return <p className="mute">Crea un grupo en Más → Grupos y alumnos.</p>;
  if (!d) return null;

  const pr = sessionProgress({ units: d.units, sessions: d.sessions, attendance: d.attendance, today, terms: subject.terms,
    calendarTerms: cal?.terms, timetable: group.timetable, holidays: parseHolidays((cal?.holidays ?? '') + '\n' + (group.holidays ?? '')) });
  const nowTerm = pr.terms.find((t, i) => { const r = cal?.terms[i]; return r?.start && r.end && today >= r.start && today <= r.end; }) ?? pr.terms.find((t) => t.gap != null);
  const gap = nowTerm?.gap ?? null;

  const idx = indexGrades(d.grades);
  const curr = { nodes, links: d.links };
  const term = subject.terms.find((t) => t.id === termId) ?? subject.terms[0];
  const results = d.students.map((s) => termResult(subject, d.acts, idx.get(s.id) ?? noGrades(), term.id, curr));
  const sum = gradeSummary(results.map((r) => r.value), subject.config.passMark);
  const maxCount = Math.max(1, ...sum.counts);
  const partIds = results[0]?.parts.map((p) => p.id) ?? [];
  const parts = partIds.map((id, k) => {
    const vals = results.map((r) => r.parts[k]?.value).filter((v): v is number => v != null);
    return { id, name: results[0].parts[k].name, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, below: vals.filter((v) => v < subject.config.passMark).length };
  });
  const termActs = d.acts.filter((a) => a.termId === term.id);
  const missing = d.students.reduce((n, s) => n + termActs.filter((a) => activityBase(a, idx.get(s.id) ?? noGrades()) == null).length, 0);

  return (
    <div className="progress">
      <div className="seg noprint" role="group" aria-label="Vista">
        <button aria-pressed={tab === 'plan'} className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>Programación</button>
        <button aria-pressed={tab === 'res'} className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>Resultados</button>
        <button aria-pressed={tab === 'rep'} className={tab === 'rep' ? 'on' : ''} onClick={() => setTab('rep')}>Informe del docente</button>
      </div>

      {tab === 'rep' && <TeacherReport subject={subject} />}

      {tab === 'plan' && (
        <>
          <div className="tiles">
            <div className="tile"><span>Sesiones impartidas</span><b>{pr.taught}<small> / {pr.total || '—'}</small></b></div>
            <div className="tile"><span>{nowTerm ? `Respecto al plan (${nowTerm.term.name})` : 'Respecto al plan'}</span>
              <b className={gap != null && gap > 0 ? 'warn' : ''}>{gap == null ? '—' : gap > 0 ? `${gap} por detrás` : gap < 0 ? `${-gap} de margen` : 'Al día'}</b>
              {gap == null && <small>Faltan fechas de la evaluación u horario</small>}
            </div>
            <div className="tile"><span>Asistencia</span><b>{pr.attendancePct == null ? '—' : `${Math.round(pr.attendancePct)} %`}</b></div>
          </div>

          <section className="card">
            <h2 className="h2">Sesiones por unidad</h2>
            {pr.units.length === 0 && <p className="mute">Crea las unidades en Planificar con sus sesiones previstas.</p>}
            {pr.units.map((u) => (
              <div className="bar" key={u.unit.id} title={`${u.unit.code}: ${u.taught} impartidas de ${u.planned} previstas; ${u.scheduled} en el calendario`}>
                <div className="sp"><b>{u.unit.code} {u.unit.title}</b><span className={u.taught > u.planned ? 'warn' : 'mute'}>{u.taught >= u.planned && u.planned ? (u.taught > u.planned ? `${u.taught - u.planned} más de lo previsto` : 'Terminada') : `${u.taught} de ${u.planned}`}</span></div>
                <div className="track" role="img" aria-label={`${u.taught} de ${u.planned} sesiones`}><div style={{ width: `${pct(u.taught, u.planned)}%` }} /></div>
                {u.scheduled < u.planned && <span className="mute warn">Faltan {u.planned - u.scheduled} sesiones en el calendario: «Repartir unidades» en Planificar.</span>}
              </div>
            ))}
          </section>

          <section className="card">
            <h2 className="h2">Por evaluación</h2>
            {pr.terms.map((t) => (
              <div className="issue" key={t.term.id}>
                <b>{t.term.name}</b>
                <span>{t.pendingPlan} sesiones previstas por impartir{t.left != null ? ` · quedan ${t.left} en el calendario` : ''}{t.gap != null && t.gap > 0 ? <span className="warn"> · faltan {t.gap}</span> : ''}</span>
              </div>
            ))}
          </section>

          <section className="card">
            <h2 className="h2">Lo que queda pendiente</h2>
            <p className="ink2">{pr.taught ? `En ${pr.pending} de las ${pr.taught} sesiones impartidas quedó algo para la siguiente (${pct(pr.pending, pr.taught)} %).` : 'Aún no hay sesiones impartidas.'}</p>
            {pr.topPending && pr.topPending.n > 1 && <p className="ink2">Lo más repetido: <b>{pr.topPending.text}</b> ({pr.topPending.n} veces).</p>}
          </section>
        </>
      )}

      {tab === 'res' && (
        <>
          <div className="seg" role="group" aria-label="Evaluación">
            {subject.terms.map((t) => <button key={t.id} aria-pressed={t.id === term.id} className={t.id === term.id ? 'on' : ''} onClick={() => setTermId(t.id)}>{t.name.replace(' evaluación', '')}</button>)}
          </div>
          <div className="tiles">
            <div className="tile"><span>Media</span><b>{fmt(round(sum.mean, 1), 1)}</b></div>
            <div className="tile"><span>Aprueban</span><b>{sum.passed}<small> / {sum.of}</small></b>{sum.n < sum.of && <small>{sum.of - sum.n} sin nota</small>}</div>
            <div className="tile"><span>Notas sin poner</span><b>{missing}</b></div>
          </div>

          <section className="card">
            <h2 className="h2">Notas de la {term.name}</h2>
            {sum.n === 0 ? <p className="mute">Aún no hay notas en esta evaluación.</p> : (
              <>
                <div className="hist" role="img" aria-label={BUCKETS.map((b, i) => `${b}: ${sum.counts[i]}`).join(', ')}>
                  {BUCKETS.map((b, i) => (
                    <div key={b} title={`${b}: ${sum.counts[i]} alumnos`}>
                      <span>{sum.counts[i]}</span>
                      <div style={{ height: `${(sum.counts[i] / maxCount) * 100}px` }} />
                    </div>
                  ))}
                </div>
                <div className="histx">{BUCKETS.map((b) => <span key={b}>{b}</span>)}</div>
              </>
            )}
          </section>

          <section className="card">
            <h2 className="h2">Media del grupo por {subject.config.gradeLevel ? (subject.levels.find((l) => l.key === subject.config.gradeLevel)?.label.toLowerCase() ?? 'parte') : 'instrumento'}</h2>
            <table className="t partsTable">
              <thead><tr><th>Parte</th><th>Media</th><th>Bajo {raw(subject.config.passMark)}</th></tr></thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.id} title={p.name}>
                    <td>{p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name}</td>
                    <td><div className="hbar"><div className="track"><div style={{ width: `${(p.mean ?? 0) * 10}%` }} /></div><b className={p.mean != null && p.mean < subject.config.passMark ? 'warn' : ''}>{fmt(round(p.mean, 1), 1)}</b></div></td>
                    <td className={p.below ? 'warn' : 'mute'}>{p.below || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
