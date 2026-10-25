import { saveGrade, saveItemGrade } from '../data/db';
import { termResult } from '../core/evaluation';
import type { Curr, StudentGrades } from '../core/evaluation';
import type { Activity, CNode, Rubric, Student, Subject } from '../core/model';
import { Cell, fmt, raw } from './cells';
import { Icon } from './icons';

/**
 * Calificar a un alumno en una actividad: un toque por criterio (niveles de la rúbrica) o la nota numérica, y debajo
 * cómo cuenta en cascada (criterios → competencias específicas o instrumentos → nota de la evaluación).
 */
export function StudentGrader(p: {
  subject: Subject; act: Activity; acts: Activity[]; student: Student; pos: string; sg: StudentGrades; items: CNode[]; rubric?: Rubric; curr: Curr;
  onPrev: () => void; onNext: () => void;
}) {
  const { subject, act, student: s, sg, rubric } = p;
  const overall = sg.byActivity.get(act.id);
  const r = termResult(subject, p.acts, sg, act.termId, p.curr);
  const term = subject.terms.find((t) => t.id === act.termId);
  const pass = subject.config.passMark;
  // Lo que mueve esta actividad: sus criterios y todo lo que alimentan (y su instrumento).
  const touched = new Set<string>([act.instrumentId, ...p.items.map((n) => n.id)]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of p.curr.links) if (!l.deleted && touched.has(l.fromId) && !touched.has(l.toId)) { touched.add(l.toId); grew = true; }
  }
  return (
    <section className="card grader" aria-label={`Calificar a ${s.firstName} ${s.lastName}`}>
      <div className="stunav">
        <button aria-label="Alumno anterior" onClick={p.onPrev}><Icon name="left" /></button>
        <div><b>{s.firstName} {s.lastName}</b><span className="mute">{p.pos}</span></div>
        <button aria-label="Alumno siguiente" onClick={p.onNext}><Icon name="right" /></button>
      </div>

      {act.formative ? (
        <p className="ink2">Actividad sin calificación: no cuenta en la nota ni en las competencias. Si quieres, deja constancia del comentario que le has dado.</p>
      ) : p.items.length === 0 ? (
        <div className="crit">
          <span className="ink2">Nota de la actividad (no tiene criterios: no cuenta en las competencias)</span>
          <Cell value={overall?.value} stamp={overall?.updatedAt} label={`${s.lastName} · ${act.title}`} onSave={(v) => saveGrade(s.id, act.id, { value: v })} />
        </div>
      ) : p.items.map((n) => {
        const g = sg.byItem.get(act.id)?.get(n.id);
        const row = rubric?.rows.find((x) => x.nodeId === n.id);
        return (
          <div className="crit" key={n.id}>
            <span className="ink2"><b className="code">{n.code}</b> {n.title.length > 90 ? n.title.slice(0, 90) + '…' : n.title}</span>
            {row ? (
              <div className="levels" role="group" aria-label={`Nivel de ${n.code}`}>
                {rubric!.levels.map((l, i) => (
                  <button key={i} aria-pressed={g?.level === i} className={g?.level === i ? 'on' : ''} title={row.text[i] || l.label}
                    onClick={() => saveItemGrade(s.id, act.id, n.id, g?.level === i ? { value: null, level: undefined } : { value: l.value, level: i })}>
                    <span>{l.label}</span><small>{raw(l.value)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <Cell value={g?.value} stamp={g?.updatedAt} label={`${s.lastName} · ${n.code}`} onSave={(v) => saveItemGrade(s.id, act.id, n.id, { value: v, level: undefined })} />
            )}
            {row && g?.level != null && row.text[g.level] && <span className="mute">{row.text[g.level]}</span>}
          </div>
        );
      })}

      {!act.formative && <div className="cascade" aria-live="polite">
        <div className="sp"><b>Se calcula solo</b><span>{subject.config.gradeLevel ? 'criterios → competencias → evaluación' : 'actividades → instrumentos → evaluación'}</span></div>
        <div className="parts">
          {r.parts.map((x) => (
            <div key={x.id} className={touched.has(x.id) ? 'hit' : ''} title={x.name}>
              <span>{x.name.replace(/^CE\.[A-Z]+\./, 'CE ')}</span>
              <b className={x.value != null && x.value < pass ? 'warn' : ''}>{fmt(x.value, 1)}{x.value != null && x.value < pass ? ' ↓' : ''}</b>
            </div>
          ))}
        </div>
        <div className="sp total"><span>{term?.name} de {s.firstName}</span><b>{fmt(r.value, subject.config.termDecimals)}</b></div>
      </div>}

      <textarea rows={2} placeholder={`Comentario para ${s.firstName}`} defaultValue={overall?.comment ?? ''} key={'c' + s.id + (overall?.updatedAt ?? 0)}
        onBlur={(e) => e.target.value !== (overall?.comment ?? '') && saveGrade(s.id, act.id, { comment: e.target.value || undefined })} />
      <button className="on wide big" onClick={p.onNext}>Siguiente alumno <Icon name="right" /></button>
    </section>
  );
}
