import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSubject } from '../data/db';
import { teacherReport } from '../core/teacherReport';
import type { TrGroupInput } from '../core/teacherReport';
import { round } from '../core/evaluation';
import { plannedSessions, ymd } from '../core/planning';
import type { Subject } from '../core/model';
import { useGroups, useNodes, useSubjectCalendar } from './hooks';
import { fmt } from './cells';

/**
 * Informe del docente al final de cada evaluación y del curso: cómo ha trabajado el alumnado y cómo se ha organizado
 * la materia, con puntos fuertes y áreas de mejora deducidos de los datos y una reflexión propia.
 */
export function TeacherReport({ subject }: { subject: Subject }) {
  const groups = useGroups(subject.id);
  const nodes = useNodes(subject.id);
  const cal = useSubjectCalendar(subject, groups[0]?.schoolYear);
  const today = ymd(new Date());
  // Por defecto, la evaluación en curso (o la última).
  const current = subject.terms.find((_, i) => { const r = cal?.terms[i]; return r?.start && r.end && today >= r.start && today <= r.end; });
  const [period, setPeriod] = useState(current?.id ?? subject.terms[0]?.id ?? 'final');
  const [note, setNote] = useState(subject.reviews?.[period] ?? '');
  useEffect(() => setNote(subject.reviews?.[period] ?? ''), [period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (note === (subject.reviews?.[period] ?? '')) return;
    const t = setTimeout(() => saveSubject({ ...subject, reviews: { ...subject.reviews, [period]: note } }), 600);
    return () => clearTimeout(t);
  }, [note, period, subject]);

  const data = useLiveQuery(async () => {
    const [links, units] = await Promise.all([db.links.where('subjectId').equals(subject.id).toArray(), db.units.where('subjectId').equals(subject.id).toArray()]);
    const per = await Promise.all(groups.map(async (group): Promise<TrGroupInput> => {
      const [students, activities, attendance, sessions] = await Promise.all([
        db.students.where('groupId').equals(group.id).toArray(), db.activities.where('groupId').equals(group.id).toArray(),
        db.attendance.where('groupId').equals(group.id).toArray(), db.sessions.where('groupId').equals(group.id).toArray(),
      ]);
      const live = activities.filter((a) => !a.deleted);
      const grades = live.length ? await db.grades.where('activityId').anyOf(live.map((a) => a.id)).toArray() : [];
      return { group, students, activities: live, grades, attendance, sessions, planned: plannedSessions(cal, group.timetable ?? [], group.holidays)?.total };
    }));
    return { links, units, per };
  }, [subject.id, groups, cal]);

  if (!groups.length) return <p className="mute">Crea un grupo para ver el informe.</p>;
  if (!data) return null;
  const ti = subject.terms.findIndex((t) => t.id === period);
  const r = ti >= 0 ? cal?.terms[ti] : cal ? { start: cal.start, end: cal.end } : undefined;
  const range = r?.start && r.end ? { start: r.start, end: r.end } : undefined;
  const rep = teacherReport({ subject, nodes, links: data.links, units: data.units, period, range, today, groups: data.per });
  const name = ti >= 0 ? subject.terms[ti].name : 'Curso completo';

  return (
    <div className="trep">
      <div className="row noprint">
        <div className="seg" role="group" aria-label="Periodo">
          {subject.terms.map((t) => <button key={t.id} aria-pressed={t.id === period} className={t.id === period ? 'on' : ''} onClick={() => setPeriod(t.id)}>{t.name.replace(' evaluación', '')}</button>)}
          <button aria-pressed={period === 'final'} className={period === 'final' ? 'on' : ''} onClick={() => setPeriod('final')}>Curso</button>
        </div>
        <button className="small" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      <h2 className="h2">Informe del docente · {subject.name} · {name}</h2>
      {range ? <p className="mute">Del {range.start.split('-').reverse().join('/')} al {range.end.split('-').reverse().join('/')}{range.end > today ? ' (en curso: datos hasta hoy)' : ''}.</p>
        : <p className="mute">Sin fechas en el calendario escolar: se usan todos los datos.</p>}

      {rep.map((g) => (
        <section key={g.group.id} className="card">
          <h3 className="h2">Grupo {g.group.name} · {g.n} alumnos</h3>
          <div className="tiles">
            <div className="tile"><span>Media</span><b>{fmt(round(g.summary.mean, 1), 1)}</b></div>
            <div className="tile"><span>Aprueban</span><b>{g.summary.passed}<small> / {g.summary.n}</small></b></div>
            <div className="tile"><span>Asistencia</span><b>{g.attendancePct == null ? '—' : `${Math.round(g.attendancePct)} %`}</b></div>
            <div className="tile"><span>Notas puestas</span><b>{g.graded.total ? `${Math.round((g.graded.done / g.graded.total) * 100)} %` : '—'}</b></div>
            <div className="tile"><span>Sesiones con lista</span><b>{g.sessions.withList}<small> / {g.sessions.held}</small></b></div>
            <div className="tile"><span>Criterios evaluados</span><b>{g.coverage.evaluated}<small> / {g.coverage.total}</small></b></div>
          </div>
          <div className="cols">
            <div className="good"><b>Puntos fuertes</b>{g.strengths.length ? <ul>{g.strengths.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mute">Aún sin datos suficientes.</p>}</div>
            <div className="bad"><b>Áreas de mejora</b>{g.improvements.length ? <ul>{g.improvements.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mute">Nada destacable.</p>}</div>
          </div>
          <details className="sect">
            <summary>Detalle</summary>
            {g.parts.length > 0 && <p className="ink2"><b>Medias por parte:</b> {g.parts.map((p) => `${p.name.replace(/^CE\.[A-Z]+\./, 'CE ')} ${fmt(round(p.mean, 1), 1)}`).join(' · ')}</p>}
            {g.units.length > 0 && <p className="ink2"><b>Unidades (impartidas / previstas):</b> {g.units.map((u) => `${u.code} ${u.taught}/${u.planned}`).join(' · ')}</p>}
            <p className="ink2"><b>Diario:</b> {g.sessions.documented} de {g.sessions.held} sesiones anotadas · {g.sessions.pending} con algo pendiente.</p>
            <p className="ink2"><b>Entregas tarde:</b> {g.late} · <b>Observaciones:</b> {g.obs.pos} positivas, {g.obs.neg} negativas.</p>
          </details>
        </section>
      ))}

      <section className="card">
        <h3 className="h2">Reflexión y propuestas de mejora</h3>
        <p className="mute noprint">Se guarda sola. Sirve para la memoria del departamento y para el apartado m) de la programación.</p>
        <textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué ha funcionado, qué cambiarías y qué decisiones tomas para la siguiente evaluación." />
      </section>
    </div>
  );
}
