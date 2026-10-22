import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { holidayItems, parseCalendarText, parseHolidays, plannedSessions, schoolYearOf, weekday, ymd } from '../core/planning';
import type { Group, SchoolCalendar as Cal } from '../core/model';
import { TimetableGrid } from './Timetable';

const dmy = (s: string) => (s ? s.split('-').reverse().join('/') : '—');
const blank = (id: string): Cal => ({
  id, start: '', end: '', holidays: '', updatedAt: 0,
  terms: ['1.ª evaluación', '2.ª evaluación', '3.ª evaluación'].map((name) => ({ name, start: '', end: '' })),
});

export function aiPrompt(year: string, place: string, stage: string) {
  return `Necesito el calendario escolar oficial del curso ${year} en Aragón para ${stage} en ${place}.
Búscalo en la orden del Departamento de Educación del Gobierno de Aragón que fija el calendario escolar de ese curso (BOA) y en los festivos locales de ${place}.
Respóndeme SOLO con un bloque de texto con este formato exacto, sin explicaciones:

INICIO: AAAA-MM-DD
FIN: AAAA-MM-DD
EVALUACION: 1.ª evaluación | AAAA-MM-DD | AAAA-MM-DD
EVALUACION: 2.ª evaluación | AAAA-MM-DD | AAAA-MM-DD
EVALUACION: 3.ª evaluación | AAAA-MM-DD | AAAA-MM-DD
AAAA-MM-DD Nombre del día no lectivo
AAAA-MM-DD..AAAA-MM-DD Nombre del periodo de vacaciones

Reglas:
- INICIO y FIN: primer y último día lectivo de ${stage}.
- Una línea por cada día no lectivo de lunes a viernes entre INICIO y FIN: festivos nacionales, autonómicos y locales de ${place}, días no lectivos que fije la orden y vacaciones de Navidad y Semana Santa (como intervalo).
- Si la orden no fija las fechas de las evaluaciones, deja esas líneas sin fechas (EVALUACION: 1.ª evaluación | |).
- No inventes fechas: si no encuentras un dato, no lo pongas.
- Termina con una línea que empiece por # con la fuente (nombre de la orden y fecha del BOA).`;
}

function GroupRow({ g, subject, cal }: { g: Group; subject: string; cal: Cal }) {
  const [open, setOpen] = useState(false);
  const tt = g.timetable ?? [];
  const p = plannedSessions(cal, tt, g.holidays);
  return (
    <>
      <tr>
        <td>{g.name}<div className="mute">{subject}</div></td>
        <td className="sum">{tt.length || '—'}</td>
        <td className="sum">{p?.total ?? '—'}</td>
        {cal.terms.map((t, i) => <td className="sum" key={i}>{p?.byTerm[i] ?? '—'}</td>)}
        <td><button className="small" onClick={() => setOpen(!open)}>{open ? 'Cerrar' : 'Horario'}</button></td>
      </tr>
      {open && (
        <tr><td colSpan={4 + cal.terms.length}>
          <TimetableGrid value={tt} onChange={(timetable) => db.groups.put({ ...g, timetable, updatedAt: Date.now() })} />
        </td></tr>
      )}
    </>
  );
}

/**
 * Calendario escolar del curso, común a todas las materias y grupos: inicio y fin de las clases, fechas de cada
 * evaluación y días no lectivos. Con el horario de cada grupo calcula sus sesiones previstas.
 */
export function SchoolCalendar() {
  const cals = useLiveQuery(() => db.calendars.toArray());
  const groups = useLiveQuery(() => db.groups.toArray());
  const subjects = useLiveQuery(() => db.subjects.toArray());
  const years = [...new Set([schoolYearOf(ymd(new Date())), ...(cals ?? []).filter((c) => !c.deleted).map((c) => c.id), ...(groups ?? []).filter((g) => !g.deleted).map((g) => g.schoolYear)])].sort();
  const [year, setYear] = useState(schoolYearOf(ymd(new Date())));
  const saved = cals?.find((c) => c.id === year && !c.deleted);
  const [d, setD] = useState<Cal>(blank(year));
  const [dirty, setDirty] = useState(false);
  const [place, setPlace] = useState('Zaragoza');
  const [stage, setStage] = useState('Bachillerato');
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!dirty) setD(saved ?? blank(year)); }, [saved, year, dirty]);

  const set = (p: Partial<Cal>) => { setD({ ...d, ...p }); setDirty(true); setMsg(''); };
  const items = holidayItems(d.holidays);
  const lost = [...parseHolidays(d.holidays)].filter((x) => (!d.start || x >= d.start) && (!d.end || x <= d.end) && weekday(x) <= 5).length;
  const aiText = aiPrompt(year, place, stage);

  function apply() {
    const r = parseCalendarText(answer);
    if (!r.start && !r.end && !r.holidays) return setMsg('No encuentro fechas en la respuesta. Comprueba que tiene el formato del prompt.');
    set({
      start: r.start ?? d.start, end: r.end ?? d.end, holidays: r.holidays || d.holidays,
      terms: r.terms.length ? r.terms.map((t, i) => ({ ...t, start: t.start || d.terms[i]?.start || '', end: t.end || d.terms[i]?.end || '' })) : d.terms,
    });
    setMsg(`Leídos: ${[r.start && 'inicio', r.end && 'fin', r.terms.length && `${r.terms.length} evaluaciones`, `${holidayItems(r.holidays).length} días o periodos no lectivos`].filter(Boolean).join(', ')}. Revísalo y pulsa Guardar.`);
  }
  async function save() {
    await db.calendars.put({ ...d, id: year, updatedAt: Date.now() });
    setDirty(false);
    setMsg('Calendario guardado.');
  }

  const live = (groups ?? []).filter((g) => !g.deleted && g.schoolYear === year);
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? '';

  return (
    <div>
      <div className="row">
        <label>Curso
          <select value={year} onChange={(e) => { setYear(e.target.value); setDirty(false); setMsg(''); }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button className="small" onClick={() => { const y = prompt('Curso escolar', year); if (y?.trim()) { setYear(y.trim()); setDirty(false); } }}>Otro curso</button>
      </div>
      <p className="mute">Común a todas las materias y grupos. Se usa para generar las sesiones, calcular las sesiones previstas de cada grupo y las fechas de cada evaluación.</p>

      <details className="card">
        <summary>Rellenarlo con una IA</summary>
        <div className="form">
          <div className="row">
            <label>Localidad <input value={place} onChange={(e) => setPlace(e.target.value)} /></label>
            <label>Enseñanza <input value={stage} onChange={(e) => setStage(e.target.value)} /></label>
          </div>
          <p className="mute">1. Copia este texto y pégalo en una IA con búsqueda web (Claude, ChatGPT, Gemini…).</p>
          <textarea rows={8} readOnly value={aiText} onFocus={(e) => e.target.select()} />
          <div className="row"><button className="small" onClick={() => navigator.clipboard?.writeText(aiText).then(() => setMsg('Prompt copiado.'), () => setMsg('No se pudo copiar: selecciónalo y cópialo a mano.'))}>Copiar prompt</button></div>
          <p className="mute">2. Pega aquí su respuesta y pulsa «Leer respuesta». Revisa las fechas con el BOA antes de guardar.</p>
          <textarea rows={6} placeholder={'INICIO: 2026-09-09\nFIN: 2027-06-18\n2026-10-12 Fiesta Nacional…'} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <div className="row"><button className="small" disabled={!answer.trim()} onClick={apply}>Leer respuesta</button></div>
        </div>
      </details>

      <div className="card form">
        <div className="row">
          <label>Inicio de las clases <input type="date" value={d.start} onChange={(e) => set({ start: e.target.value })} /></label>
          <label>Fin de las clases <input type="date" value={d.end} onChange={(e) => set({ end: e.target.value })} /></label>
        </div>
        <b className="mute">Evaluaciones</b>
        {d.terms.map((t, i) => (
          <div className="row" key={i}>
            <input style={{ width: 140 }} value={t.name} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input type="date" aria-label="Desde" value={t.start} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
            <input type="date" aria-label="Hasta" value={t.end} onChange={(e) => set({ terms: d.terms.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
            <button className="small" onClick={() => set({ terms: d.terms.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <div className="row"><button className="small" onClick={() => set({ terms: [...d.terms, { name: `${d.terms.length + 1}.ª evaluación`, start: '', end: '' }] })}>+ Evaluación</button></div>
        <details>
          <summary className="mute">Horas del centro ({(d.slots ?? []).filter((x) => x.start && x.end).length} de 7): Hoy sabrá qué clase toca ahora</summary>
          <div className="tw">
            <table className="t">
              <thead><tr><th>Sesión</th><th>Empieza</th><th>Acaba</th></tr></thead>
              <tbody>
                {['1', '2', '3', '4', '5', '6', '7'].map((h) => {
                  const t = d.slots?.find((x) => x.slot === h) ?? { slot: h, start: '', end: '' };
                  const put = (p: Partial<typeof t>) => set({ slots: [...(d.slots ?? []).filter((x) => x.slot !== h), { ...t, ...p }].sort((a, b) => a.slot.localeCompare(b.slot, 'es', { numeric: true })) });
                  return (
                    <tr key={h}><td>{h}.ª</td>
                      <td><input type="time" aria-label={`Inicio de la ${h}.ª`} value={t.start} onChange={(e) => put({ start: e.target.value })} /></td>
                      <td><input type="time" aria-label={`Fin de la ${h}.ª`} value={t.end} onChange={(e) => put({ end: e.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
        <label>Días no lectivos (una fecha o «inicio..fin» por línea, con su nombre detrás)
          <textarea rows={8} placeholder={'2026-10-12 Fiesta Nacional\n2026-12-23..2027-01-07 Navidad'} value={d.holidays} onChange={(e) => set({ holidays: e.target.value })} />
        </label>
        <p className="mute">{items.length} días o periodos · {lost} días de lunes a viernes sin clase{d.start && d.end ? ` entre el ${dmy(d.start)} y el ${dmy(d.end)}` : ''}. Añade a mano los días de libre disposición de tu centro.</p>
        <div className="row">
          <button className="on" disabled={!dirty} onClick={save}>Guardar</button>
          {dirty && <button onClick={() => { setDirty(false); setMsg(''); }}>Descartar cambios</button>}
          {msg && <span className="mute">{msg}</span>}
        </div>
      </div>

      <h3>Sesiones previstas por grupo</h3>
      {!saved ? <p className="mute">Guarda el calendario para calcularlas.</p> : !live.length ? <p className="mute">No hay grupos del curso {year}.</p> : (
        <div className="tw">
          <table className="t">
            <thead><tr><th>Grupo</th><th>h/sem</th><th>Curso</th>{saved.terms.map((t, i) => <th key={i}>{t.name}</th>)}<th></th></tr></thead>
            <tbody>{live.map((g) => <GroupRow key={g.id} g={g} subject={subjectName(g.subjectId)} cal={saved} />)}</tbody>
          </table>
        </div>
      )}
      <p className="mute">Marca el horario de cada grupo con «Horario». Las sesiones previstas son la base del % de faltas si en Configuración no hay sesiones anuales fijadas.</p>
    </div>
  );
}
