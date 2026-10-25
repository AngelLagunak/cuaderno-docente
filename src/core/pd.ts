import { coverage, gradedLevels, unitNodeIds } from './curriculum';
import { aggregateTree } from './evaluation';
import type { Activity, CLink, CNode, LearningUnit, PdInfo, Rubric, Session, Subject } from './model';

export type { PdInfo };

/**
 * Apartados de la programación didáctica (art. de programaciones de las órdenes ECD/1172/2022 y ECD/1173/2022 de
 * currículo de ESO y Bachillerato en Aragón). Los de `auto` se generan con los datos de la app; el texto se añade.
 */
export const PD_SECTIONS: { key: string; title: string; auto?: boolean; hint: string }[] = [
  { key: 'a', title: 'Competencias específicas y criterios de evaluación asociados a ellas', auto: true, hint: 'Sale del currículo: competencias, criterios, descriptores y objetivos vinculados.' },
  { key: 'b', title: 'Concreción, agrupamiento y secuenciación de los saberes básicos y de los criterios de evaluación en unidades didácticas', auto: true, hint: 'Sale de Planificar: unidades, sesiones, fechas, criterios y saberes.' },
  { key: 'c', title: 'Procedimientos e instrumentos de evaluación, con especial atención al carácter formativo de la evaluación y a su vinculación con los criterios de evaluación', auto: true, hint: 'Sale de los instrumentos, las actividades y las rúbricas. Añade cómo se da retroalimentación.' },
  { key: 'd', title: 'Criterios de calificación', auto: true, hint: 'Sale de Evaluación y configuración.' },
  { key: 'e', title: 'Características de la evaluación inicial, criterios para su valoración y consecuencias de sus resultados en la programación', hint: 'Qué se hace al empezar el curso, cómo se valora y qué cambia según los resultados.' },
  { key: 'f', title: 'Actuaciones generales de atención a las diferencias individuales y adaptaciones curriculares', hint: 'Medidas generales, DUA, adaptaciones de acceso y no significativas.' },
  { key: 'g', title: 'Plan de recuperación de materias pendientes', hint: 'Cómo se recupera la materia pendiente de cursos anteriores (si aplica).' },
  { key: 'h', title: 'Estrategias didácticas y metodológicas: organización, recursos, agrupamientos, enfoques de enseñanza y criterios para elaborar situaciones de aprendizaje', hint: 'Metodología, espacios, materiales, agrupamientos, situaciones de aprendizaje.' },
  { key: 'i', title: 'Concreción del plan de implementación de los elementos transversales del Proyecto Curricular de Etapa', hint: 'Comprensión lectora, expresión oral y escrita, comunicación audiovisual, igualdad, sostenibilidad…' },
  { key: 'j', title: 'Concreción del plan de utilización de las tecnologías digitales del Proyecto Curricular de Etapa', hint: 'Classroom, herramientas digitales, competencia digital del alumnado.' },
  { key: 'k', title: 'Medidas complementarias para el tratamiento de la materia dentro de proyectos o ámbitos', hint: 'Proyectos interdisciplinares o de centro (si los hay).' },
  { key: 'l', title: 'Actividades complementarias y extraescolares y su incidencia en la evaluación', hint: 'Salidas, visitas, exposiciones y cómo cuentan en la nota.' },
  { key: 'm', title: 'Mecanismos de revisión, evaluación y modificación de la programación en relación con los resultados académicos y procesos de mejora', hint: 'Seguimiento trimestral, informe del docente, propuestas de mejora.' },
];

export const defaultNorm = (s: Subject) =>
  s.kind === 'bach' ? 'Orden ECD/1173/2022, de 3 de agosto, currículo y características de la evaluación del Bachillerato en Aragón.'
  : s.kind === 'eso' ? 'Orden ECD/1172/2022, de 2 de agosto, currículo y características de la evaluación de la ESO en Aragón.'
  : '';

/** Texto base editable para los apartados que no salen de los datos. */
export function pdBase(s: Subject): Record<string, string> {
  return {
    e: `Durante las primeras sesiones se realiza una evaluación inicial mediante una actividad práctica y la observación del trabajo en el aula. Se valoran los conocimientos previos, las destrezas técnicas y la autonomía de trabajo de cada alumno o alumna. No lleva calificación. Sus resultados sirven para ajustar el ritmo, los agrupamientos y el nivel de las primeras propuestas, y para detectar alumnado que necesite medidas de apoyo.`,
    f: `Se aplican medidas generales de atención a la diversidad siguiendo el Diseño Universal para el Aprendizaje: varias formas de presentar la información, propuestas abiertas con distintos niveles de complejidad y diversas formas de mostrar lo aprendido. Se adapta el tiempo y el formato de las entregas cuando es necesario y se coordinan las adaptaciones de acceso y no significativas con el departamento de orientación y el equipo docente.`,
    g: s.kind === 'bach' && /1/.test(s.course) ? 'No procede: la materia se imparte en primer curso.' : `El alumnado con la materia pendiente realiza un plan de trabajo con actividades y entregas trimestrales vinculadas a los criterios de evaluación, con el seguimiento del profesorado del departamento. Se informa por escrito del plan y de las fechas.`,
    h: `Metodología activa y basada en proyectos. Cada unidad se plantea como una situación de aprendizaje con un reto, un producto final y su proceso documentado. Se alterna el trabajo individual con el trabajo en pequeños grupos. Se usan el aula taller, sus materiales y herramientas, y Google Classroom para las instrucciones, los recursos y las entregas. Las situaciones de aprendizaje parten de contextos reales y significativos, movilizan varios saberes básicos y se evalúan con los criterios asociados.`,
    i: `Se trabajan la comprensión lectora y la expresión oral y escrita en la documentación y la presentación de los proyectos; la comunicación audiovisual en el registro del proceso; la igualdad, la convivencia y la sostenibilidad en la elección de temas, materiales y procesos.`,
    j: `Se utiliza Google Classroom para la comunicación, los recursos y la entrega de tareas, y herramientas digitales para la investigación, el registro fotográfico y la presentación de los proyectos, conforme al plan de tecnologías digitales del centro.`,
    k: `No se plantean.`,
    l: `Se proponen las salidas y visitas incluidas en la programación anual del departamento. La participación y las tareas asociadas se evalúan con los criterios de la unidad en la que se integran; quien no pueda asistir realiza una actividad alternativa.`,
    m: `Al final de cada evaluación se revisan los resultados del grupo, el avance de las sesiones previstas y la cobertura de los criterios de evaluación (informe del docente de la app). Las conclusiones se recogen en el departamento y, si es necesario, se ajusta la temporalización, las actividades o los instrumentos. Al final del curso se elabora una memoria con las propuestas de mejora para el curso siguiente.`,
  };
}

export interface PdData {
  subject: Subject;
  nodes: CNode[];
  links: CLink[];
  units: LearningUnit[];
  activities: Activity[];
  rubrics: Rubric[];
  /** Sesiones del grupo de referencia (para las fechas de cada unidad). */
  sessions: Session[];
  /** Sesiones lectivas previstas por evaluación (calendario escolar y horario), si se conocen. */
  planned?: number[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (t: string) => t.split(/\n{2,}|\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const pct = (w: number, total: number) => (total > 0 ? `${Math.round((w / total) * 1000) / 10} %` : '—');
const dmy = (s: string) => s.split('-').reverse().join('/');
const byOrder = (a: CNode, b: CNode) => a.order - b.order;

/** Nivel de los criterios de evaluación (o el primero calificable). */
const critLevel = (s: Subject) => (s.levels.some((l) => l.key === 'crit') ? 'crit' : s.levels.find((l) => l.graded)?.key ?? '');

/** Nivel del que salen las notas por competencias (o el primero con relaciones), si lo hay. */
function compLevel(s: Subject) {
  return s.levels.find((l) => l.key === s.config.gradeLevel) ?? s.levels.find((l) => l.key === 'ce' || l.key === 'ra') ?? null;
}

function live(d: PdData) {
  return { nodes: d.nodes.filter((n) => !n.deleted), links: d.links.filter((l) => !l.deleted), units: d.units.filter((u) => !u.deleted), acts: d.activities.filter((a) => !a.deleted) };
}

/** Apartado a): cada competencia con sus criterios (y concreciones) y los elementos a los que contribuye. */
function sectionA(d: PdData): string {
  const { nodes, links } = live(d);
  const s = d.subject;
  const level = compLevel(s);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (k: string) => s.levels.find((l) => l.key === k)?.plural ?? k;
  if (!level) {
    const graded = gradedLevels(s);
    const rows = nodes.filter((n) => graded.has(n.level)).sort(byOrder);
    return rows.length ? `<table><tr><th>Código</th><th>Elemento evaluable</th></tr>${rows.map((n) => `<tr><td>${esc(n.code)}</td><td>${esc(n.title)}</td></tr>`).join('')}</table>` : '<p class="miss">Falta el currículo de la materia.</p>';
  }
  const children = (id: string): CNode[] => links.filter((l) => l.toId === id).map((l) => byId.get(l.fromId)).filter((n): n is CNode => !!n && n.level !== 'saber').sort(byOrder);
  const tree = (id: string): string => {
    const ch = children(id);
    return ch.length ? `<ul>${ch.map((n) => `<li><b>${esc(n.code)}</b> ${esc(n.title)}${tree(n.id)}</li>`).join('')}</ul>` : '';
  };
  const comps = nodes.filter((n) => n.level === level.key).sort(byOrder);
  if (!comps.length) return '<p class="miss">Falta el currículo de la materia.</p>';
  const out = comps.map((c) => {
    const targets = links.filter((l) => l.fromId === c.id).map((l) => byId.get(l.toId)).filter((n): n is CNode => !!n);
    const groups = [...new Set(targets.map((t) => t.level))].map((k) => `<p class="small"><b>${esc(label(k))}:</b> ${targets.filter((t) => t.level === k).sort(byOrder).map((t) => esc(t.code)).join(', ')}</p>`).join('');
    const tr = tree(c.id);
    return `<h3>${esc(c.code)}. ${esc(c.title)}</h3>${groups}${tr || '<p class="miss">Sin criterios vinculados.</p>'}`;
  }).join('');
  // Anexo: texto de los descriptores y objetivos citados.
  const cited = new Set(links.filter((l) => comps.some((c) => c.id === l.fromId)).map((l) => l.toId));
  const annex = [...new Set(nodes.filter((n) => cited.has(n.id)).map((n) => n.level))].map((k) => {
    const list = nodes.filter((n) => n.level === k && cited.has(n.id)).sort(byOrder);
    return `<h3>${esc(label(k))} vinculados</h3><table>${list.map((n) => `<tr><td>${esc(n.code)}</td><td>${esc(n.title)}</td></tr>`).join('')}</table>`;
  }).join('');
  return out + annex;
}

/** Apartado b): saberes y unidades con su evaluación, sesiones, fechas, criterios y saberes. */
function sectionB(d: PdData): string {
  const { nodes, units } = live(d);
  const s = d.subject;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const graded = gradedLevels(s);
  const saberes = nodes.filter((n) => n.level === 'saber').sort(byOrder);
  let out = '';
  if (saberes.length) out += `<h3>Saberes básicos</h3><table>${saberes.map((n) => `<tr><td>${esc(n.code)}</td><td>${esc(n.title)}</td></tr>`).join('')}</table>`;
  if (!units.length) return out + '<p class="miss">Faltan las unidades didácticas (Planificar).</p>';
  const ordered = [...units].sort((a, b) => s.terms.findIndex((t) => t.id === a.termId) - s.terms.findIndex((t) => t.id === b.termId) || a.code.localeCompare(b.code, 'es', { numeric: true }));
  const codes = (u: LearningUnit, f: (n: CNode) => boolean) => unitNodeIds(u, d.activities).map((id) => byId.get(id)).filter((n): n is CNode => !!n && f(n)).sort(byOrder).map((n) => esc(n.code)).join(', ') || '—';
  const dates = (u: LearningUnit) => {
    const ss = d.sessions.filter((x) => !x.deleted && x.unitId === u.id).map((x) => x.date).sort();
    return ss.length ? `${dmy(ss[0])} – ${dmy(ss[ss.length - 1])}` : '—';
  };
  out += `<h3>Unidades didácticas y temporalización</h3><table><tr><th>Unidad</th><th>Evaluación</th><th>Sesiones</th><th>Fechas</th><th>Criterios</th><th>Saberes</th></tr>${ordered.map((u) => `<tr><td><b>${esc(u.code)}</b> ${esc(u.title)}</td><td>${esc(s.terms.find((t) => t.id === u.termId)?.name ?? '—')}</td><td>${u.plannedSessions}</td><td>${dates(u)}</td><td>${codes(u, (n) => graded.has(n.level))}</td><td>${codes(u, (n) => n.level === 'saber')}</td></tr>`).join('')}</table>`;
  out += `<table><tr><th>Evaluación</th><th>Sesiones de las unidades</th>${d.planned ? '<th>Sesiones lectivas previstas</th>' : ''}</tr>${s.terms.map((t, i) => `<tr><td>${esc(t.name)}</td><td>${units.filter((u) => u.termId === t.id).reduce((n, u) => n + u.plannedSessions, 0)}</td>${d.planned ? `<td>${d.planned[i] ?? '—'}</td>` : ''}</tr>`).join('')}</table>`;
  return out;
}

/** Apartado c): instrumentos con su peso y los criterios que evalúa cada uno; rúbricas y observación. */
function sectionC(d: PdData): string {
  const { nodes, links, units, acts } = live(d);
  const s = d.subject;
  const total = s.instruments.reduce((n, i) => n + i.weight, 0);
  const cov = coverage(s, nodes, links, units, acts);
  const top = cov.filter((r) => r.node.level === critLevel(s));
  const rows = s.instruments.map((i) => {
    const crit = top.filter((r) => r.byInstrument[i.id]).map((r) => esc(r.node.code));
    const n = acts.filter((a) => a.instrumentId === i.id && !a.formative).length;
    return `<tr><td>${esc(i.name)}</td><td>${pct(i.weight, total)}</td><td>${crit.join(', ') || '—'}</td><td>${n || '—'}</td></tr>`;
  }).join('');
  let out = `<table><tr><th>Instrumento</th><th>Peso</th><th>Criterios que evalúa</th><th>Actividades</th></tr>${rows}</table>`;
  const rub = d.rubrics.filter((r) => !r.deleted);
  if (rub.length) out += `<p><b>Rúbricas:</b> ${rub.map((r) => `${esc(r.name)} (${r.levels.map((l) => esc(l.label)).join(' / ')})`).join('; ')}.</p>`;
  const obs = s.config.observations ?? [];
  const form = acts.filter((a) => a.formative).length;
  if (form) out += `<p><b>Evaluación formativa sin calificación:</b> ${form} actividad${form === 1 ? '' : 'es'} con retroalimentación oral o escrita al alumnado, que no cuenta${form === 1 ? '' : 'n'} en la nota.</p>`;
  if (obs.length && acts.some((a) => a.fromObs)) out += `<p><b>Observación sistemática en el aula</b> al pasar lista: ${obs.map((o) => `${esc(o.label)} (${o.sign > 0 ? '+' : '−'})`).join(', ')}.</p>`;
  const noCrit = top.filter((r) => r.total === 0);
  if (noCrit.length && acts.length) out += `<p class="miss">Criterios aún sin actividad de evaluación: ${noCrit.map((r) => esc(r.node.code)).join(', ')}.</p>`;
  return out;
}

/** Apartado d): cómo se calcula la nota, con los pesos y reglas de la configuración. */
export function gradingText(s: Subject): string[] {
  const c = s.config;
  const it = s.instruments.reduce((n, i) => n + i.weight, 0);
  const tt = s.terms.reduce((n, t) => n + t.weight, 0);
  const instr = s.instruments.map((i) => `${i.name} ${pct(i.weight, it)}`).join(', ');
  const level = s.levels.find((l) => l.key === c.gradeLevel);
  const out: string[] = [];
  if (level) {
    const graded = s.levels.filter((l) => l.graded).map((l) => l.plural.toLowerCase());
    out.push(`La nota de cada evaluación es la media de las ${level.plural.toLowerCase()} evaluadas. Cada una se obtiene de sus ${graded.join(' y ')}, y la nota de cada ${graded[0] ? s.levels.find((l) => l.graded)!.label.toLowerCase() : 'criterio'} se calcula con las actividades que lo evalúan, ponderadas según su instrumento: ${instr}.`);
  } else {
    out.push(`La nota de cada evaluación es la media ponderada de los instrumentos: ${instr}. Dentro de cada instrumento, las actividades hacen media según su peso.`);
  }
  out.push('Solo cuentan los elementos ya evaluados en ese momento.');
  if (c.minPerInstrument) out.push(`Para superar la evaluación es necesario obtener al menos un ${c.passMark} en cada ${level ? level.label.toLowerCase() : 'instrumento'}.`);
  if (c.latePenaltyPct > 0) out.push(`Las entregas fuera de plazo sin justificar se califican con una reducción del ${c.latePenaltyPct} %.`);
  if (c.lateNoImprove) out.push('Las entregas fuera de plazo sin justificar no pueden mejorarse después.');
  if (c.observations?.length) out.push(`La dinámica del aula parte de un ${c.obsBase ?? 6} y suma o resta ${c.obsStep ?? 0.5} por cada observación positiva o negativa registrada al pasar lista.`);
  out.push(`La nota final ordinaria es la media ponderada de las evaluaciones (${s.terms.map((t) => `${t.name} ${pct(t.weight, tt)}`).join(', ')}), redondeada a ${c.finalDecimals === 0 ? 'número entero' : `${c.finalDecimals} decimal${c.finalDecimals > 1 ? 'es' : ''}`}${c.scale === 'ssapntsb' ? ' y expresada como SS, AP, NT o SB' : ''}, con un mínimo de ${c.minGrade ?? 1}. Se supera con un ${c.passMark} o más.`);
  const lec = c.lec;
  if (lec) out.push(`Pérdida del derecho a la evaluación continua: carpeta o dossier de trabajos ${lec.folderPct} % y prueba global ${lec.examPct} %. Se avisa al alumnado al llegar al ${c.absenceWarnPct ?? 20} % de faltas injustificadas.`);
  const ex = c.extra;
  if (ex) out.push(`Convocatoria extraordinaria: proyectos o trabajos ${ex.projectsPct} % y examen ${ex.examPct} %${ex.minEach > 0 ? `; es necesario un ${ex.minEach} en cada parte para hacer media` : ''}.`);
  return out;
}

/** Lo que falta para que la programación esté completa. */
export function pdIssues(d: PdData, info: PdInfo): string[] {
  const { nodes, links, units } = live(d);
  const s = d.subject;
  const out: string[] = [];
  if (!info.centre?.trim()) out.push('Falta el nombre del centro.');
  if (!info.teacher?.trim()) out.push('Falta el profesor o profesora.');
  if (!info.year?.trim()) out.push('Falta el curso escolar.');
  const graded = gradedLevels(s);
  const gradedNodes = nodes.filter((n) => graded.has(n.level));
  if (!gradedNodes.length) out.push('Falta el currículo (Currículo).');
  if (!units.length) out.push('Faltan las unidades didácticas (Planificar).');
  else {
    const { ancestors } = aggregateTree(s, links);
    const unitIds = (u: LearningUnit) => unitNodeIds(u, d.activities);
    const inUnits = new Set(units.flatMap((u) => unitIds(u).flatMap((id) => [id, ...ancestors(id)])));
    const crit = nodes.filter((n) => n.level === critLevel(s));
    const out1 = crit.filter((n) => !inUnits.has(n.id));
    if (out1.length) out.push(`Criterios que no trabaja ninguna actividad de las unidades: ${out1.map((n) => n.code).slice(0, 10).join(', ')}${out1.length > 10 ? '…' : '.'}`);
    const sab = nodes.filter((n) => n.level === 'saber' && !inUnits.has(n.id));
    if (sab.length) out.push(`Saberes en ninguna unidad: ${sab.map((n) => n.code).slice(0, 10).join(', ')}${sab.length > 10 ? '…' : '.'}`);
    const empty = units.filter((u) => !unitIds(u).some((id) => graded.has(nodes.find((n) => n.id === id)?.level ?? '')));
    if (empty.length) out.push(`Unidades sin actividades con criterios: ${empty.map((u) => u.code).join(', ')}.`);
    if (d.planned) s.terms.forEach((t, i) => {
      const need = units.filter((u) => u.termId === t.id).reduce((n, u) => n + u.plannedSessions, 0);
      const have = d.planned![i];
      if (have != null && need > have) out.push(`${t.name}: las unidades piden ${need} sesiones y solo hay ${have} lectivas.`);
    });
  }
  const it = s.instruments.reduce((n, i) => n + i.weight, 0);
  if (Math.abs(it - 100) > 0.01 && it > 0) out.push(`Los pesos de los instrumentos suman ${it}, no 100 (se reparten en proporción).`);
  for (const sec of PD_SECTIONS) if (!sec.auto && !info.texts?.[sec.key]?.trim()) out.push(`Apartado ${sec.key}) sin texto.`);
  return out;
}

/** Documento completo en HTML (para ver, imprimir o descargar como .doc). */
export function pdHtml(d: PdData, info: PdInfo): string {
  const s = d.subject;
  const t = info.texts ?? {};
  const head = [
    ['Centro', info.centre], ['Departamento', info.department], ['Materia', s.name], ['Curso', s.course],
    ['Profesor/a', info.teacher], ['Curso escolar', info.year], ['Normativa', info.norm ?? defaultNorm(s)],
  ].filter(([, v]) => v?.trim()).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v!)}</td></tr>`).join('');
  const auto: Record<string, () => string> = {
    a: () => sectionA(d), b: () => sectionB(d), c: () => sectionC(d),
    d: () => gradingText(s).map((x) => `<p>${esc(x)}</p>`).join(''),
  };
  const body = PD_SECTIONS.map((sec) => {
    const gen = auto[sec.key]?.() ?? '';
    const txt = t[sec.key]?.trim() ? para(t[sec.key]) : sec.auto ? '' : '<p class="miss">Pendiente de redactar.</p>';
    return `<h2>${sec.key}) ${esc(sec.title)}</h2>${gen}${txt}`;
  }).join('');
  return `<h1>Programación didáctica · ${esc(s.name)}</h1><table class="head">${head}</table>${body}`;
}

/** Estilos del documento descargado (Word abre el HTML como documento editable). */
export const PD_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;line-height:1.35}
h1{font-size:18pt;margin:0 0 10pt}h2{font-size:13pt;margin:16pt 0 6pt;border-bottom:1px solid #999}h3{font-size:11.5pt;margin:10pt 0 4pt}
table{border-collapse:collapse;width:100%;margin:6pt 0}td,th{border:1px solid #999;padding:3pt 5pt;vertical-align:top;text-align:left;font-size:10pt}
th{background:#eee}table.head th{width:28%}ul{margin:2pt 0 4pt 16pt;padding:0}li{margin:1pt 0}.small{font-size:9.5pt;margin:2pt 0}.miss{color:#b54708}`;

export function pdDocument(d: PdData, info: PdInfo): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Programación didáctica · ${esc(d.subject.name)}</title><style>${PD_CSS}</style></head><body>${pdHtml(d, info)}</body></html>`;
}

/** Prompt para que una IA redacte los apartados de texto a partir de los datos de la materia. */
export function pdPrompt(d: PdData, info: PdInfo): string {
  const { nodes, units } = live(d);
  const s = d.subject;
  const level = compLevel(s);
  const comps = level ? nodes.filter((n) => n.level === level.key).sort(byOrder).map((n) => `- ${n.code}: ${n.title}`).join('\n') : '';
  const us = units.map((u) => `- ${u.code} ${u.title} (${s.terms.find((t) => t.id === u.termId)?.name ?? ''}, ${u.plannedSessions} sesiones)`).join('\n');
  const keys = PD_SECTIONS.filter((x) => !x.auto);
  return `Redacta los apartados de texto de la programación didáctica de la materia «${s.name}» (${s.course})${info.centre ? ` del centro ${info.centre}` : ''}, en Aragón${info.norm || defaultNorm(s) ? `, según ${info.norm || defaultNorm(s)}` : ''}.
${comps ? `\nCompetencias específicas:\n${comps}\n` : ''}${us ? `\nUnidades didácticas:\n${us}\n` : ''}
Instrumentos de evaluación: ${s.instruments.map((i) => `${i.name} (${i.weight} %)`).join(', ')}.

Escribe en español, en un tono profesional y concreto, adaptado a esta materia (nada genérico). Entre 80 y 180 palabras por apartado.
Devuélveme SOLO un JSON válido, sin explicaciones, con estas claves:
{
${keys.map((x) => `  "${x.key}": "${x.title}"`).join(',\n')}
}`;
}

/** Respuesta de la IA: JSON con las claves de los apartados (acepta bloques de código y texto alrededor). */
export function parsePdTexts(text: string): Record<string, string> {
  const m = /\{[\s\S]*\}/.exec(text.replace(/```\w*/g, ''));
  if (!m) throw new Error('No encuentro el JSON en la respuesta.');
  const j = JSON.parse(m[0]) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const sec of PD_SECTIONS) {
    const v = j[sec.key] ?? j[sec.key.toUpperCase()];
    if (typeof v === 'string' && v.trim()) out[sec.key] = v.trim();
  }
  if (!Object.keys(out).length) throw new Error('El JSON no trae ningún apartado (claves a, b, c…).');
  return out;
}
