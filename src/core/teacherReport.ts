import { activityBase, aggregateTree, finalResult, indexGrades, noGrades, termResult } from './evaluation';
import type { Curr, Num } from './evaluation';
import { gradeSummary } from './progress';
import { absenceSummary } from './rules';
import type { Activity, Attendance, CLink, CNode, Grade, Group, LearningUnit, Session, Student, Subject } from './model';

export interface TrGroupInput {
  group: Group;
  students: Student[];
  activities: Activity[];
  grades: Grade[];
  attendance: Attendance[];
  sessions: Session[];
  /** Sesiones anuales previstas del grupo (base del % de faltas). */
  planned?: number;
}

export interface TrInput {
  subject: Subject;
  nodes: CNode[];
  links: CLink[];
  units: LearningUnit[];
  /** Id de la evaluación o «final» (todo el curso). */
  period: string;
  /** Fechas del periodo (del calendario escolar); sin ellas no se filtra por fecha. */
  range?: { start: string; end: string };
  today: string;
  groups: TrGroupInput[];
}

export interface TrGroup {
  group: Group;
  n: number;
  summary: ReturnType<typeof gradeSummary>;
  failing: string[];
  parts: { name: string; mean: Num }[];
  graded: { done: number; total: number };
  late: number;
  attendancePct: Num;
  absenceWarn: string[];
  obs: { pos: number; neg: number };
  sessions: { held: number; withList: number; documented: number; pending: number; topPending: string | null };
  units: { code: string; title: string; planned: number; taught: number }[];
  coverage: { evaluated: number; total: number; missing: string[] };
  unusedInstruments: string[];
  noCriteria: number;
  strengths: string[];
  improvements: string[];
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const pc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const list = (xs: string[], max = 6) => xs.slice(0, max).join(', ') + (xs.length > max ? ` y ${xs.length - max} más` : '');

/**
 * Informe del docente de una evaluación o del curso: cómo ha trabajado el alumnado (notas, entregas, asistencia,
 * observaciones) y cómo se ha organizado la materia (sesiones, lista, diario, unidades, cobertura de criterios),
 * con los puntos fuertes y las áreas de mejora que se deducen de los datos.
 */
export function teacherReport(p: TrInput): TrGroup[] {
  const s = p.subject;
  const curr: Curr = { nodes: p.nodes, links: p.links };
  const inRange = (d?: string) => !p.range || (!!d && d >= p.range.start && d <= p.range.end);
  const critLevel = s.levels.some((l) => l.key === 'crit') ? 'crit' : s.levels.find((l) => l.graded)?.key ?? '';
  const crits = p.nodes.filter((n) => !n.deleted && n.level === critLevel);
  const { ancestors } = aggregateTree(s, p.links);
  const units = p.units.filter((u) => !u.deleted && (p.period === 'final' || u.termId === p.period));
  const pass = s.config.passMark;

  return p.groups.map((g) => {
    const students = g.students.filter((x) => !x.deleted);
    const allActs = g.activities.filter((a) => !a.deleted);
    const acts = p.period === 'final' ? allActs : allActs.filter((a) => a.termId === p.period);
    const idx = indexGrades(g.grades.filter((x) => !x.deleted));
    const sg = (id: string) => idx.get(id) ?? noGrades();

    // Notas
    const values = students.map((st) => (p.period === 'final' ? finalResult(s, allActs, sg(st.id), curr).value : termResult(s, allActs, sg(st.id), p.period, curr).value));
    const summary = gradeSummary(values, pass);
    const failing = students.filter((_, i) => values[i] != null && values[i]! < pass).map((x) => `${x.firstName} ${x.lastName}`);
    const termIds = p.period === 'final' ? s.terms.map((t) => t.id) : [p.period];
    const partVals = new Map<string, number[]>();
    for (const st of students) for (const t of termIds) for (const part of termResult(s, allActs, sg(st.id), t, curr).parts) {
      if (part.value == null) continue;
      partVals.set(part.name, [...(partVals.get(part.name) ?? []), part.value]);
    }
    const parts = [...partVals].map(([name, v]) => ({ name, mean: mean(v) }));

    // Entregas y correcciones
    const due = acts.filter((a) => (a.date ? a.date <= p.today : students.some((st) => activityBase(a, sg(st.id)) != null)));
    let done = 0, late = 0;
    for (const a of due) for (const st of students) {
      if (activityBase(a, sg(st.id)) != null) done++;
      if (sg(st.id).byActivity.get(a.id)?.late) late++;
    }
    const graded = { done, total: due.length * students.length };

    // Asistencia y observaciones
    const rows = g.attendance.filter((r) => !r.deleted);
    const rowsIn = rows.filter((r) => inRange(r.date));
    const attendancePct = rowsIn.length ? (rowsIn.filter((r) => r.status === 'P' || r.status === 'R').length / rowsIn.length) * 100 : null;
    const absenceWarn = students.filter((st) => !st.lec && absenceSummary(s, rows, st.id, g.planned).warn).map((x) => `${x.firstName} ${x.lastName}`);
    const sign = new Map((s.config.observations ?? []).map((o) => [o.id, o.sign]));
    const obs = { pos: 0, neg: 0 };
    for (const r of rowsIn) for (const o of r.obs ?? []) sign.get(o) === 1 ? obs.pos++ : sign.get(o) === -1 && obs.neg++;

    // Sesiones
    const held = g.sessions.filter((x) => !x.deleted && x.date <= p.today && inRange(x.date));
    const listed = new Set(rows.map((r) => `${r.date}|${r.slot}`));
    const withPending = held.filter((x) => x.pending?.trim());
    const freq = new Map<string, number>();
    for (const x of withPending) freq.set(x.pending!.trim(), (freq.get(x.pending!.trim()) ?? 0) + 1);
    const top = [...freq].sort((a, b) => b[1] - a[1])[0];
    const sessions = {
      held: held.length, withList: held.filter((x) => listed.has(`${x.date}|${x.slot}`)).length,
      documented: held.filter((x) => x.done?.trim() || x.pending?.trim()).length, pending: withPending.length,
      topPending: top && top[1] > 1 ? `${top[0]} (${top[1]} veces)` : null,
    };
    const taughtAll = g.sessions.filter((x) => !x.deleted && x.date <= p.today);
    const unitRows = units.map((u) => ({ code: u.code, title: u.title, planned: u.plannedSessions, taught: taughtAll.filter((x) => x.unitId === u.id).length }));

    // Cobertura de criterios: los que tienen alguna nota en una actividad del periodo.
    const reached = new Set<string>();
    for (const a of acts) {
      if (!students.some((st) => activityBase(a, sg(st.id)) != null)) continue;
      for (const id of a.nodeIds) { reached.add(id); ancestors(id).forEach((x) => reached.add(x)); }
    }
    const planned = new Set(units.flatMap((u) => u.nodeIds.flatMap((id) => [id, ...ancestors(id)])));
    const target = p.period === 'final' || !units.length ? crits : crits.filter((n) => planned.has(n.id));
    const coverage = { evaluated: target.filter((n) => reached.has(n.id)).length, total: target.length, missing: target.filter((n) => !reached.has(n.id)).map((n) => n.code) };
    const unusedInstruments = s.instruments.filter((i) => i.weight > 0 && !acts.some((a) => a.instrumentId === i.id)).map((i) => i.name);
    const gradedLv = new Set(s.levels.filter((l) => l.graded).map((l) => l.key));
    const noCriteria = crits.length ? acts.filter((a) => !a.fromObs && !a.nodeIds.some((id) => gradedLv.has(p.nodes.find((n) => n.id === id)?.level ?? ''))).length : 0;

    // Puntos fuertes y áreas de mejora
    const good: string[] = [], bad: string[] = [];
    if (summary.n) {
      const pp = pc(summary.passed, summary.n);
      if (pp >= 80) good.push(`Aprueba el ${pp} % del grupo (media ${f1(summary.mean!)}).`);
      else if (pp < 60) bad.push(`Solo aprueba el ${pp} % del grupo (media ${f1(summary.mean!)}): revisar la dificultad de las tareas y los apoyos.`);
      const known = parts.filter((x) => x.mean != null).sort((a, b) => b.mean! - a.mean!);
      if (known.length > 1) {
        const hi = known[0], lo = known[known.length - 1];
        if (hi.mean! - lo.mean! >= 1) {
          good.push(`Lo mejor resuelto: ${hi.name} (${f1(hi.mean!)}).`);
          bad.push(`Lo más flojo: ${lo.name} (${f1(lo.mean!)}). Conviene reforzarlo con más práctica o retroalimentación.`);
        }
      }
    }
    if (failing.length) bad.push(`Alumnado por debajo del aprobado: ${list(failing)}.`);
    if (graded.total) {
      const gp = pc(graded.done, graded.total);
      if (gp >= 95) good.push(`Las notas de las tareas vencidas están al día (${gp} %).`);
      else bad.push(`Faltan ${graded.total - graded.done} notas en tareas ya vencidas (${gp} % puesto): entregas sin hacer o sin corregir.`);
      const lp = pc(late, graded.total);
      if (lp >= 15) bad.push(`El ${lp} % de las entregas llegan tarde: revisar plazos y recordatorios.`);
    }
    if (attendancePct != null) {
      if (attendancePct >= 92) good.push(`Asistencia alta (${Math.round(attendancePct)} %).`);
      else if (attendancePct < 85) bad.push(`Asistencia baja (${Math.round(attendancePct)} %).`);
    }
    if (absenceWarn.length) bad.push(`Superan el límite de faltas: ${list(absenceWarn)}.`);
    if (obs.pos + obs.neg >= 5) {
      if (obs.pos >= obs.neg * 2) good.push(`Buena dinámica en el aula: ${obs.pos} observaciones positivas y ${obs.neg} negativas.`);
      else if (obs.neg > obs.pos) bad.push(`Más observaciones negativas (${obs.neg}) que positivas (${obs.pos}) en el aula.`);
    }
    if (sessions.held) {
      const lp = pc(sessions.withList, sessions.held), dp = pc(sessions.documented, sessions.held);
      if (lp >= 95) good.push(`Lista pasada en casi todas las sesiones (${lp} %).`);
      else bad.push(`Sin lista en ${sessions.held - sessions.withList} de ${sessions.held} sesiones.`);
      if (dp >= 70) good.push(`Diario de clase al día (${dp} % de las sesiones anotadas).`);
      else bad.push(`Solo el ${dp} % de las sesiones tiene anotado lo realizado o lo pendiente.`);
      const pp = pc(sessions.pending, sessions.held);
      if (pp >= 40) bad.push(`En el ${pp} % de las sesiones quedó algo pendiente: la planificación va justa de tiempo.`);
      if (sessions.topPending) bad.push(`Lo que más se repite como pendiente: ${sessions.topPending}.`);
    }
    const ended = !p.range || p.range.end < p.today;
    const behind = unitRows.filter((u) => u.taught < u.planned);
    if (unitRows.length && ended) {
      if (!behind.length) good.push('Se han impartido todas las unidades previstas.');
      else bad.push(`Unidades con menos sesiones de las previstas: ${list(behind.map((u) => `${u.code} (${u.taught}/${u.planned})`))}.`);
    }
    const over = unitRows.filter((u) => u.planned && u.taught > u.planned * 1.25);
    if (over.length) bad.push(`Unidades que se alargaron: ${list(over.map((u) => `${u.code} (${u.taught}/${u.planned})`))}. Ajustar su temporalización.`);
    if (coverage.total) {
      if (!coverage.missing.length) good.push(`Todos los criterios previstos tienen nota (${coverage.total}).`);
      else bad.push(`Criterios sin evaluar: ${list(coverage.missing, 10)}.`);
    }
    if (unusedInstruments.length) bad.push(`Instrumentos sin ninguna actividad: ${unusedInstruments.join(', ')}.`);
    if (noCriteria) bad.push(`${noCriteria} actividad${noCriteria === 1 ? '' : 'es'} sin criterios de evaluación: no cuentan en las competencias.`);

    return {
      group: g.group, n: students.length, summary, failing, parts, graded, late, attendancePct, absenceWarn, obs, sessions,
      units: unitRows, coverage, unusedInstruments, noCriteria, strengths: good, improvements: bad,
    };
  });
}
