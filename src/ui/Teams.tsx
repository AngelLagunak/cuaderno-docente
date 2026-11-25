import { useState } from 'react';
import { commentTeam, gradeTeam, saveGrade, saveItemGrade, saveTeams, uid, undoable } from '../data/db';
import { activityBase } from '../core/evaluation';
import type { StudentGrades } from '../core/evaluation';
import { adjusted, copyTeams, makeTeams, moveStudent } from '../core/teams';
import type { Activity, CNode, Rubric, Student, Team, TeamMark } from '../core/model';
import { Cell, fmt, raw } from './cells';

const short = (s: Student) => `${s.firstName.split(/\s+/)[0]} ${s.lastName.split(/\s+/)[0]}`;

/** Nota de un equipo en una concreción (niveles de la rúbrica) o global (casilla). */
function MarkInput({ m, row, rubric, label, onSave }: { m?: TeamMark; row?: Rubric['rows'][number]; rubric?: Rubric; label: string; onSave: (m: TeamMark) => void }) {
  if (row && rubric) return (
    <div className="levels" role="group" aria-label={label}>
      {rubric.levels.map((l, i) => (
        <button key={i} aria-pressed={m?.level === i && m.value != null} className={m?.level === i && m.value != null ? 'on' : ''} title={row.text[i] || l.label}
          onClick={() => onSave(m?.level === i && m.value != null ? { value: null } : { value: l.value, level: i })}>
          <span>{l.label}</span><small>{raw(l.value)}</small>
        </button>
      ))}
    </div>
  );
  return <Cell value={m?.value} label={label} onSave={(v) => onSave({ value: v })} />;
}

/**
 * Calificar por equipos: se forman los equipos de la actividad (al azar, por lista o copiando los de otra) y la nota
 * que se pone a cada equipo se copia a sus integrantes. Quien tenga una nota distinta (ajustada a mano) la conserva.
 */
export function Teams(p: {
  act: Activity; acts: Activity[]; students: Student[]; items: CNode[]; rubric?: Rubric; sgOf: (s: Student) => StudentGrades;
  onStudent: (s: Student) => void; onMsg: (m: string) => void;
}) {
  const { act, students, items, rubric, sgOf } = p;
  const teams = act.teams ?? [];
  const [size, setSize] = useState(4);
  const [edit, setEdit] = useState(!teams.length);
  const live = new Set(students.map((s) => s.id));
  const byId = new Map(students.map((s) => [s.id, s]));
  const inTeam = new Set(teams.flatMap((t) => t.studentIds));
  const loose = students.filter((s) => !inTeam.has(s.id));
  const others = p.acts.filter((a) => a.id !== act.id && a.teams?.length);
  const set = (t: Team[], label?: string) => saveTeams(act, t, label);

  async function build(random: boolean) {
    if (teams.length && !confirm('¿Rehacer los equipos? Las notas ya puestas a cada alumno se quedan como están.')) return;
    await set(makeTeams(students.map((s) => s.id), size, uid, random ? Math.random : undefined), 'formar equipos');
    p.onMsg(`Equipos de ${size} como mucho, ${random ? 'al azar' : 'por orden de lista'}.`);
  }
  async function copyFrom(id: string) {
    const src = p.acts.find((a) => a.id === id);
    if (!src?.teams || (teams.length && !confirm(`¿Sustituir los equipos por los de «${src.title}»?`))) return;
    await set(copyTeams(src.teams, students.map((s) => s.id), uid), 'copiar equipos');
    p.onMsg(`Equipos copiados de «${src.title}».`);
  }
  const markOf = (t: Team, n?: CNode) => (n ? t.items?.[n.id] : t.mark);
  const gradeOf = (s: Student, n?: CNode) => { const sg = sgOf(s); return n ? sg.byItem.get(act.id)?.get(n.id) : sg.byActivity.get(act.id); };
  const isAdjusted = (t: Team, s: Student) => (items.length ? items.some((n) => adjusted(gradeOf(s, n), markOf(t, n))) : adjusted(gradeOf(s), t.mark));

  async function equalize(t: Team, s: Student) {
    await undoable('igualar al equipo', async () => {
      for (const n of items.length ? items : [undefined]) {
        const m = markOf(t, n);
        if (m?.value == null) continue;
        const patch = { value: m.value, level: m.level };
        await (n ? saveItemGrade(s.id, act.id, n.id, patch) : saveGrade(s.id, act.id, patch));
      }
    });
    p.onMsg(`${s.firstName} tiene otra vez la nota del equipo.`);
  }

  if (act.formative) return <p className="mute">Actividad sin calificación: los equipos solo sirven para organizar. Puedes formarlos igualmente.</p>;

  return (
    <div className="teams">
      <details className="card sect" open={edit} onToggle={(e) => setEdit((e.target as HTMLDetailsElement).open)}>
        <summary>{teams.length ? `Equipos (${teams.length})` : 'Formar equipos'}</summary>
        <div className="row">
          <label className="row" style={{ margin: 0 }}>Integrantes
            <select aria-label="Integrantes por equipo" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="small" onClick={() => build(true)}>Al azar</button>
          <button className="small" onClick={() => build(false)}>Por lista</button>
          {others.length > 0 && (
            <select aria-label="Copiar equipos de otra actividad" value="" onChange={(e) => copyFrom(e.target.value)}>
              <option value="">Copiar de…</option>
              {others.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          )}
        </div>
        {teams.length > 0 && (
          <div className="teamgrid">
            {teams.map((t) => (
              <div className="teamedit" key={t.id}>
                <div className="sp">
                  <input aria-label="Nombre del equipo" defaultValue={t.name} key={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && set(teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value.trim() } : x)))} />
                  {!t.studentIds.some((s) => live.has(s)) && <button className="small" onClick={() => set(teams.filter((x) => x.id !== t.id), 'quitar equipo')}>Quitar</button>}
                </div>
                {t.studentIds.filter((s) => live.has(s)).map((sid) => (
                  <div className="sp member" key={sid}>
                    <span>{short(byId.get(sid)!)}</span>
                    <select aria-label={`Equipo de ${short(byId.get(sid)!)}`} value={t.id} onChange={(e) => set(moveStudent(teams, sid, e.target.value))}>
                      {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      <option value="">Sin equipo</option>
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {teams.length > 0 && loose.length > 0 && (
          <div className="teamedit">
            <b>Sin equipo</b>
            {loose.map((s) => (
              <div className="sp member" key={s.id}>
                <span>{short(s)}</span>
                <select aria-label={`Equipo de ${short(s)}`} value="" onChange={(e) => set(moveStudent(teams, s.id, e.target.value))}>
                  <option value="">Sin equipo</option>
                  {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        {teams.length > 0 && <div className="row"><button className="small" onClick={() => set([...teams, { id: uid(), name: `Equipo ${teams.length + 1}`, studentIds: [] }])}>Añadir equipo</button></div>}
        <p className="mute">Los equipos son de esta actividad. Para usarlos en otra, cópialos desde ella.</p>
      </details>

      {teams.filter((t) => t.studentIds.some((s) => live.has(s))).map((t) => {
        const members = t.studentIds.map((s) => byId.get(s)).filter((s): s is Student => !!s);
        return (
          <section className="card teamcard" key={t.id}>
            <div className="sp"><b>{t.name}</b><span className="mute">{members.length} integrantes</span></div>
            {items.length ? items.map((n) => (
              <div className="crit" key={n.id}>
                <span className="ink2"><b className="code">{n.code}</b> {n.title.length > 90 ? n.title.slice(0, 90) + '…' : n.title}</span>
                <MarkInput key={t.id + n.id + JSON.stringify(t.items?.[n.id] ?? null)} m={t.items?.[n.id]} row={rubric?.rows.find((r) => r.nodeId === n.id)} rubric={rubric} label={`${t.name} · ${n.code}`}
                  onSave={(m) => gradeTeam(act.id, t.id, n.id, m)} />
              </div>
            )) : (
              <div className="crit"><span className="ink2">Nota del equipo</span>
                <MarkInput key={t.id + JSON.stringify(t.mark ?? null)} m={t.mark} label={`${t.name} · nota`} onSave={(m) => gradeTeam(act.id, t.id, undefined, m)} />
              </div>
            )}
            <input className="cell wide" placeholder="Comentario para el equipo" defaultValue={t.comment ?? ''} key={'c' + t.id + (t.comment ?? '')}
              onBlur={(e) => e.target.value !== (t.comment ?? '') && commentTeam(act.id, t.id, e.target.value)} />
            <div className="members">
              {members.map((s) => {
                const adj = isAdjusted(t, s);
                return (
                  <div className="sp member" key={s.id}>
                    <button className="linkish" title="Ajustar su nota" onClick={() => p.onStudent(s)}>{s.lastName}, {s.firstName}</button>
                    <span className="row" style={{ margin: 0, gap: 6 }}>
                      {adj && <span className="tag" title="Tiene una nota distinta a la del equipo">ajustada</span>}
                      <b>{fmt(activityBase(act, sgOf(s)), 2)}</b>
                      {adj && <button className="small" title="Volver a la nota del equipo" onClick={() => equalize(t, s)}>Igualar</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {teams.length > 0 && <p className="mute">La nota del equipo se copia a sus integrantes. Pulsa un nombre para ajustar su nota: la conservará aunque cambies la del equipo, hasta que pulses «Igualar».</p>}
    </div>
  );
}
