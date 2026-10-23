import { linkId } from './model';
import type { CLink, CNode, LevelDef, RelationDef, Subject } from './model';
import { DESCRIPTORS, keyCompetence } from '../catalogs/descriptors';

export type Template = 'lomloe' | 'fp' | 'empty';

const LOMLOE_LEVELS: LevelDef[] = [
  { key: 'ce', label: 'Competencia específica', plural: 'Competencias específicas' },
  { key: 'crit', label: 'Criterio de evaluación', plural: 'Criterios', graded: true },
  { key: 'desc', label: 'Descriptor operativo', plural: 'Descriptores' },
  { key: 'saber', label: 'Saber básico', plural: 'Saberes' },
];
const LOMLOE_RELATIONS: RelationDef[] = [
  { key: 'crit-ce', from: 'crit', to: 'ce', aggregate: true, needFrom: true, needTo: true },
  { key: 'ce-desc', from: 'ce', to: 'desc', aggregate: true, needFrom: true },
];

/**
 * Asignatura nueva a partir de una plantilla: LOMLOE (competencias específicas, criterios, descriptores y saberes;
 * nota = media de las competencias), FP (resultados de aprendizaje y criterios) o vacía.
 */
export function newSubject(id: string, name: string, course: string, kind: Subject['kind'], template: Template): Subject {
  const base: Subject = {
    id, name, course, kind, updatedAt: Date.now(), levels: [], relations: [],
    instruments: [
      { id: 'trab', name: 'Trabajos y proyectos', weight: 50 },
      { id: 'prue', name: 'Pruebas', weight: 30 },
      { id: 'din', name: 'Dinámica del aula', weight: 20 },
    ],
    terms: [
      { id: 't1', name: '1.ª evaluación', weight: 1 },
      { id: 't2', name: '2.ª evaluación', weight: 1 },
      { id: 't3', name: '3.ª evaluación', weight: 1 },
    ],
    config: { passMark: 5, termDecimals: 2, finalDecimals: 0, minGrade: 1, minPerInstrument: false, latePenaltyPct: 0, absenceWarnPct: 20, gradeLevel: null,
      lec: { folderPct: 50, examPct: 50 }, extra: { projectsPct: 40, examPct: 60, minEach: 0 }, lateNoImprove: false, scale: 'num' },
  };
  if (template === 'lomloe') return { ...base, levels: LOMLOE_LEVELS, relations: LOMLOE_RELATIONS, config: { ...base.config, gradeLevel: 'ce' } };
  if (template === 'fp') return {
    ...base,
    levels: [{ key: 'ra', label: 'Resultado de aprendizaje', plural: 'Resultados de aprendizaje' }, { key: 'crit', label: 'Criterio de evaluación', plural: 'Criterios', graded: true }],
    relations: [{ key: 'crit-ra', from: 'crit', to: 'ra', aggregate: true, needFrom: true, needTo: true }],
    terms: base.terms.slice(0, 2),
    config: { ...base.config, gradeLevel: 'ra', finalDecimals: 0 },
  };
  return base;
}

/** Copia la estructura y la configuración de otra asignatura (sin su currículo ni sus grupos). */
export function copyStructure(from: Subject, id: string, name: string, course: string): Subject {
  const { pd: _pd, reviews: _r, ...rest } = structuredClone(from);
  return { ...rest, id, name, course, updatedAt: Date.now() };
}

// ---------- Currículo con IA ----------

export function curriculumPrompt(name: string, course: string) {
  return `Necesito el currículo oficial de Aragón de la materia «${name}» de ${course}. Usa la orden del Departamento de Educación del Gobierno de Aragón que establece el currículo (BOA) y, si no está, el real decreto estatal de enseñanzas mínimas.
Devuélveme SOLO un JSON válido, sin explicaciones, con esta forma:

{
  "competencias": [
    { "codigo": "CE1", "texto": "texto completo de la competencia específica",
      "descriptores": ["CCL1", "CD2"],
      "criterios": [ { "codigo": "1.1", "texto": "texto completo del criterio de evaluación" } ] }
  ],
  "saberes": [ { "codigo": "A.1", "texto": "texto del saber básico" } ],
  "descriptores": [ { "codigo": "CCL1", "texto": "texto oficial del descriptor operativo" } ]
}

Reglas:
- Copia los textos literalmente y completos.
- "descriptores" de cada competencia: los descriptores operativos del perfil de salida con los que la conecta el currículo.
- Cada criterio va dentro de su competencia específica.
- Saberes: un elemento por cada apartado del último nivel, con su código (A.1, A.2…).
- "descriptores" al final: el texto oficial de cada descriptor usado, de la etapa de la materia.
- No inventes nada: si no encuentras un dato, déjalo fuera.`;
}

export interface ParsedCurriculum {
  ces: { code: string; text: string; desc: string[]; crits: { code: string; text: string }[] }[];
  saberes: { code: string; text: string }[];
  descTexts: Record<string, string>;
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '');
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

/** Lee el JSON que devuelve la IA (admite texto alrededor y bloques ```json). */
export function parseCurriculum(text: string): ParsedCurriculum {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No encuentro un JSON en la respuesta.');
  let j: Record<string, unknown>;
  try { j = obj(JSON.parse(text.slice(a, b + 1))); } catch (e) { throw new Error('El JSON no es válido: ' + (e as Error).message); }
  const ces = arr(j.competencias).map(obj).map((c) => ({
    code: str(c.codigo), text: str(c.texto),
    desc: arr(c.descriptores).map(str).filter(Boolean),
    crits: arr(c.criterios).map(obj).map((k) => ({ code: str(k.codigo), text: str(k.texto) })).filter((k) => k.code && k.text),
  })).filter((c) => c.code && c.text);
  const saberes = arr(j.saberes).map(obj).map((s) => ({ code: str(s.codigo), text: str(s.texto) })).filter((s) => s.code && s.text);
  const descTexts: Record<string, string> = {};
  for (const d of arr(j.descriptores).map(obj)) if (str(d.codigo) && str(d.texto)) descTexts[str(d.codigo)] = str(d.texto);
  if (!ces.length && !saberes.length) throw new Error('El JSON no tiene competencias ni saberes.');
  return { ces, saberes, descTexts };
}

/**
 * Elementos y vínculos que añade el currículo leído. Ids estables (`materia/nivel:código`): cargarlo dos veces no
 * duplica. Los descriptores de Bachillerato usan la redacción oficial guardada en la app. Añade a la materia los
 * niveles y relaciones LOMLOE que le falten.
 */
export function curriculumRecords(subject: Subject, p: ParsedCurriculum, existing: CNode[]): { subject: Subject; nodes: CNode[]; links: CLink[] } {
  const levels = [...subject.levels];
  for (const l of LOMLOE_LEVELS) if (!levels.some((x) => x.key === l.key)) levels.push(l);
  const relations = [...subject.relations];
  for (const r of LOMLOE_RELATIONS) if (!relations.some((x) => x.key === r.key)) relations.push(r);
  const id = (level: string, code: string) => `${subject.id}/${level}:${code}`;
  const have = new Set(existing.filter((n) => !n.deleted).map((n) => n.id));
  let order = existing.reduce((m, n) => Math.max(m, n.order), 0) + 1;
  const now = Date.now();
  const nodes: CNode[] = [];
  const add = (level: string, code: string, title: string, extra: Partial<CNode> = {}) => {
    const nid = id(level, code);
    if (!have.has(nid) && !nodes.some((n) => n.id === nid)) nodes.push({ id: nid, subjectId: subject.id, level, code, title, order: order++, tags: [], updatedAt: now, ...extra });
    return nid;
  };
  const links: CLink[] = [];
  const link = (relation: string, from: string, to: string) => links.push({ id: linkId(subject.id, relation, from, to), subjectId: subject.id, relation, fromId: from, toId: to, updatedAt: now });
  const bach = subject.kind === 'bach';
  for (const c of p.ces) {
    const ce = add('ce', c.code, c.text);
    for (const k of c.crits) link('crit-ce', add('crit', k.code, k.text), ce);
    for (const d of c.desc) {
      const text = (bach && DESCRIPTORS[d]) || p.descTexts[d] || DESCRIPTORS[d] || d;
      link('ce-desc', ce, add('desc', d, text, { group: keyCompetence(d) }));
    }
  }
  for (const s of p.saberes) add('saber', s.code, s.text);
  return { subject: { ...subject, levels, relations }, nodes, links };
}

// ---------- Objetivos de etapa ----------

const OBJ_LEVEL: LevelDef = { key: 'obj', label: 'Objetivo de etapa', plural: 'Objetivos de etapa' };
const OBJ_RELATION: RelationDef = { key: 'ce-obj', from: 'ce', to: 'obj' };

export const objectivesPrompt = (stage: string) => `Dame los objetivos de la etapa de ${stage} tal como aparecen en el currículo vigente en Aragón (orden del Departamento de Educación publicada en el BOA, o el real decreto estatal si la orden no los recoge).
Respóndeme SOLO con la lista, sin explicaciones: un objetivo por línea, empezando por su letra, por ejemplo:
a) Texto literal y completo del objetivo.
b) …
No resumas ni cambies la redacción. Termina con una línea que empiece por # con la fuente.`;

/** Lista pegada de objetivos: «a) texto» por línea (las líneas sin letra continúan el anterior). */
export function parseObjectives(text: string): { code: string; text: string }[] {
  const out: { code: string; text: string }[] = [];
  for (const raw of text.replace(/```\w*/g, '').split(/\r?\n/)) {
    const l = raw.replace(/^[\s*>•-]+/, '').replace(/\*\*/g, '').trim();
    if (!l || l.startsWith('#')) continue;
    const m = /^([a-zñ])\s*[).:-]\s+(.+)$/i.exec(l);
    if (m) out.push({ code: m[1].toLowerCase(), text: m[2].trim() });
    else if (out.length) out[out.length - 1].text += ' ' + l;
  }
  return out;
}

/** Nivel «Objetivo de etapa», relación competencia específica → objetivo y los objetivos que aún no estén. */
export function objectivesRecords(subject: Subject, items: { code: string; text: string }[], existing: CNode[]) {
  const levels = subject.levels.some((l) => l.key === OBJ_LEVEL.key) ? subject.levels : [...subject.levels, OBJ_LEVEL];
  const from = subject.levels.some((l) => l.key === 'ce') ? 'ce' : subject.levels[0]?.key ?? 'ce';
  const relations = subject.relations.some((r) => r.to === OBJ_LEVEL.key) ? subject.relations : [...subject.relations, { ...OBJ_RELATION, key: `${from}-obj`, from }];
  const have = new Set(existing.filter((n) => !n.deleted).map((n) => n.id));
  let order = existing.reduce((m, n) => Math.max(m, n.order), 0) + 1;
  const now = Date.now();
  const nodes = items
    .map((o) => ({ id: `${subject.id}/obj:${o.code}`, subjectId: subject.id, level: OBJ_LEVEL.key, code: o.code, title: o.text, order: 0, tags: [], updatedAt: now }))
    .filter((n) => !have.has(n.id))
    .map((n) => ({ ...n, order: order++ }));
  return { subject: { ...subject, levels, relations }, nodes };
}
