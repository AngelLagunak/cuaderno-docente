import { linkId } from '../core/model';
import type { CLink, CNode, Subject } from '../core/model';

export const PA_ID = 'pa-1bach';
const now = Date.now();
const nid = (l: string, c: string) => `${PA_ID}/${l}:${c}`;
let order = 0;
const N = (level: string, code: string, title: string, extra: Partial<CNode> = {}): CNode => ({
  id: nid(level, code), subjectId: PA_ID, level, code, title, order: order++, tags: [], updatedAt: now, ...extra,
});
const K = (relation: string, fromId: string, toId: string): CLink => ({
  id: linkId(PA_ID, relation, fromId, toId), subjectId: PA_ID, relation, fromId, toId, updatedAt: now,
});

const PH: Record<string, string[]> = {
  '1.1.1': ['GENERAR IDEAS'],
  '1.1.2': ['INVESTIGACIÓN'], '5.1.1': ['INVESTIGACIÓN'], '5.1.2': ['INVESTIGACIÓN'],
  '1.1.3': ['BOCETOS'], '1.1.4': ['BOCETOS'],
  '3.2': ['INTENCIÓN'], '3.3.1': ['INTENCIÓN', 'SELECCIÓN'], '3.3.2': ['INTENCIÓN', 'SELECCIÓN'],
  '2.1.1': ['PLANIFICACIÓN'], '2.1.2': ['PLANIFICACIÓN'], '2.1.3': ['PLANIFICACIÓN'],
  '2.2.1': ['PLANIFICACIÓN'], '2.2.2': ['PLANIFICACIÓN'], '3.1.3': ['PLANIFICACIÓN', 'SELECCIÓN'],
  '1.2.1': ['SELECCIÓN'], '1.2.2': ['SELECCIÓN'], '1.2.3': ['SELECCIÓN'], '1.2.4': ['SELECCIÓN'], '1.2.5': ['SELECCIÓN'],
  '4.2': ['SELECCIÓN', 'COMPARTIR'],
  '3.1.1': ['PARTICIPACIÓN'], '3.1.2': ['PARTICIPACIÓN'],
  '4.1.1': ['COMPARTIR'], '4.1.2': ['COMPARTIR'], '4.1.3': ['COMPARTIR'], '3.4.2': ['COMPARTIR'],
  '4.3.1': ['EVALUAR'], '4.3.2': ['EVALUAR'], '4.3.3': ['EVALUAR'],
  '5.2': ['MEMORIA'], '5.3': ['MEMORIA'], '5.4': ['MEMORIA'],
  '3.4.1': ['EMPRENDIMIENTO'],
};
const tg = (code: string) => ({ tags: PH[code] ?? [] });

const CE: [string, string][] = [
  ['1', 'Generar y perfeccionar ideas de proyecto'],
  ['2', 'Planificar las fases y el proceso de trabajo'],
  ['3', 'Realizar proyectos artísticos'],
  ['4', 'Compartir las fases del proyecto y valorar su repercusión'],
  ['5', 'Tratar la documentación del proyecto'],
];

const CRIT: [string, string][] = [
  ['1.1', 'Generar y perfeccionar ideas de proyecto, consultando distintas fuentes, elaborando bocetos y maquetas, y experimentando con las técnicas y estrategias artísticas más adecuadas en cada caso.'],
  ['1.2', 'Seleccionar una propuesta concreta para un proyecto, justificando su relevancia artística, su viabilidad, su sostenibilidad y su adecuación a la intención con la que fue concebida y a las características del marco de recepción previsto.'],
  ['2.1', 'Establecer el plan de trabajo de un proyecto artístico, organizando correctamente sus fases, evaluando su sostenibilidad y ajustándolo a los plazos, a las características del espacio y, en su caso, al presupuesto previsto.'],
  ['2.2', 'Proponer soluciones creativas en la organización de un proyecto artístico, buscando el máximo aprovechamiento de los recursos disponibles.'],
  ['3.1', 'Participar activamente en la realización de proyectos artísticos, individuales o colectivos, asumiendo diferentes funciones y seleccionando los espacios, las técnicas, los medios y los soportes más adecuados.'],
  ['3.2', 'Explicar, de forma razonada, la intención expresiva o funcional de un proyecto artístico, detallando los efectos que se espera que este tenga en el entorno.'],
  ['3.3', 'Argumentar las decisiones relativas a la ejecución del proyecto, asegurando la coherencia de estas decisiones con la intención expresiva o funcional y con los efectos esperados.'],
  ['3.4', 'Identificar oportunidades de desarrollo personal, social, académico o profesional relacionadas con el ámbito artístico, comprendiendo su valor añadido y expresando la opinión personal de forma crítica y respetuosa.'],
  ['4.1', 'Compartir, a través de diversos medios y soportes, las distintas fases del proyecto, poniéndolo en relación con el resultado final esperado y recabando, de manera abierta y respetuosa, las críticas, los comentarios y las aportaciones de mejora formuladas por distintas personas, incluido el público receptor.'],
  ['4.2', 'Valorar las críticas, los comentarios y las aportaciones de mejora recibidas, incorporando de manera justificada aquellas que redunden en beneficio del proyecto y de su repercusión en el entorno.'],
  ['4.3', 'Evaluar la repercusión que el proyecto ha tenido en el entorno, considerando las valoraciones del público receptor y analizando el logro de la intención inicial planteada, así como la pertinencia de las soluciones puestas en práctica ante las dificultades afrontadas a lo largo del proceso.'],
  ['5.1', 'Seleccionar diversas fuentes para la elaboración del proyecto, justificando su utilidad teórica, informativa o inspiradora.'],
  ['5.2', 'Elaborar la documentación necesaria para desarrollar un proyecto artístico, considerando las posibilidades de aplicación y ajustándose a los modelos más adecuados.'],
  ['5.3', 'Registrar las distintas fases del proyecto, adoptando un enfoque reflexivo y de autoevaluación.'],
  ['5.4', 'Archivar correctamente la documentación, garantizando la accesibilidad y la facilidad de su recuperación.'],
];

const IND: [string, string][] = [
  ['1.1.1', 'Generar y perfeccionar ideas de proyecto.'],
  ['1.1.2', 'Consultar distintas fuentes para generar y perfeccionar ideas de proyecto.'],
  ['1.1.3', 'Elaborar bocetos y maquetas para perfeccionar ideas de proyecto.'],
  ['1.1.4', 'Experimentar las técnicas y estrategias artísticas más adecuadas a cada caso.'],
  ['1.2.1', 'Relevancia artística.'],
  ['1.2.2', 'Viabilidad.'],
  ['1.2.3', 'Sostenibilidad.'],
  ['1.2.4', 'Adecuación a la intención con la que fue concebida.'],
  ['1.2.5', 'Características del entorno de recepción.'],
  ['2.1.1', 'Fases y ajuste a plazos.'],
  ['2.1.2', 'Características del espacio.'],
  ['2.1.3', 'Presupuesto previsto.'],
  ['2.2.1', 'Proponer soluciones creativas a la organización de un proyecto.'],
  ['2.2.2', 'Búsqueda del máximo aprovechamiento de recursos disponibles.'],
  ['3.1.1', 'Participación activa en la realización de los proyectos.'],
  ['3.1.2', 'Asunción de diferentes funciones.'],
  ['3.1.3', 'Selección de espacios, técnicas, medios y soportes más adecuados.'],
  ['3.3.1', 'Argumentar las decisiones sobre el proyecto en relación a la intención y los efectos esperados.'],
  ['3.3.2', 'Explicar correctamente la intención y los efectos esperados, y argumentar las decisiones a lo largo del proyecto en función de estos parámetros.'],
  ['3.4.1', 'Identificar oportunidades de desarrollo personal, social, académico o profesional.'],
  ['3.4.2', 'Expresión de la opinión personal de forma crítica y respetuosa.'],
  ['4.1.1', 'Compartir a través de diversos medios y soportes todas las fases.'],
  ['4.1.2', 'Compartir relacionando con el resultado final esperado.'],
  ['4.1.3', 'Compartir recabando críticas, comentarios y aportaciones de mejora.'],
  ['4.3.1', 'Valoraciones del público receptor.'],
  ['4.3.2', 'Logro de la intención original.'],
  ['4.3.3', 'Adecuación de las soluciones aplicadas durante el proceso.'],
  ['5.1.1', 'Investigar para recabar diversas fuentes para la realización del proyecto.'],
  ['5.1.2', 'Justificar la utilidad (teórica, informativa o inspiradora) de las fuentes o referentes.'],
];

// Textos de descriptores abreviados (no son la redacción oficial completa).
const DESC: [string, string][] = [
  ['CCL1', 'Expresión oral, escrita o multimodal con fluidez y coherencia'],
  ['CCL2', 'Comprensión e interpretación crítica de textos'],
  ['CCL3', 'Búsqueda, selección y contraste de información'],
  ['STEM1', 'Razonamiento matemático y resolución de problemas'],
  ['STEM3', 'Resolución de problemas técnicos y gestión de dispositivos'],
  ['CD1', 'Uso creativo, crítico y seguro de tecnologías digitales'],
  ['CD2', 'Creación de contenidos digitales'],
  ['CD3', 'Colaboración mediante entornos digitales'],
  ['CPSAA1.1', 'Optimismo, resiliencia y autoeficacia'],
  ['CPSAA1.2', 'Personalidad autónoma y gestión del cambio'],
  ['CPSAA3.1', 'Empatía y conciencia de la influencia del grupo'],
  ['CPSAA3.2', 'Reparto equitativo de tareas y responsabilidades'],
  ['CPSAA4', 'Análisis y síntesis de información de los medios'],
  ['CPSAA5', 'Planificación a largo plazo y aprendizaje autorregulado'],
  ['CC3', 'Juicio propio ante problemas éticos y rechazo de la discriminación'],
  ['CC4', 'Interdependencia, ecodependencia y compromiso con los ODS'],
  ['CE1', 'Evaluar necesidades y afrontar retos con sentido crítico'],
  ['CE2', 'Autoconocimiento y trabajo colaborativo en iniciativas'],
  ['CE3', 'Crear ideas y gestionar proyectos hasta un prototipo final'],
  ['CCEC2', 'Valoración y difusión del patrimonio cultural'],
  ['CCEC3.1', 'Expresión de ideas y emociones mediante producciones artísticas'],
  ['CCEC3.2', 'Generar y perfeccionar ideas: fuentes, técnicas, bocetos y maquetas'],
  ['CCEC4.1', 'Planificar y ejecutar proyectos artísticos'],
  ['CCEC4.2', 'Documentar y compartir el proceso creativo'],
];

const CE_DESC: Record<string, string[]> = {
  '1': ['CCL1', 'STEM3', 'CD1', 'CD2', 'CPSAA1.1', 'CPSAA3.1', 'CE3', 'CCEC3.2', 'CCEC4.1'],
  '2': ['STEM1', 'CD3', 'CPSAA3.1', 'CPSAA3.2', 'CC4', 'CE1', 'CE2', 'CCEC4.1', 'CCEC4.2'],
  '3': ['CCL1', 'CD3', 'CPSAA1.2', 'CPSAA3.2', 'CC3', 'CE1', 'CE3', 'CCEC3.1', 'CCEC4.1', 'CCEC4.2'],
  '4': ['CCL1', 'CCL2', 'STEM1', 'CD2', 'CPSAA5', 'CC3', 'CE3', 'CCEC2', 'CCEC4.2'],
  '5': ['CCL2', 'CCL3', 'CD1', 'CD2', 'CPSAA4', 'CPSAA5', 'CCEC2', 'CCEC4.2'],
};

const SABER: [string, string, string[]][] = [
  ['PART.A.1', 'La creatividad como destreza personal y herramienta para la expresión artística', ['1.1']],
  ['PART.A.2', 'Estrategias y técnicas de fomento y desarrollo de la creatividad', ['1.1']],
  ['PART.A.3', 'Estrategias de superación del bloqueo creativo', ['1.1']],
  ['PART.B.1', 'Metodología proyectual. Generación y selección de propuestas. Planificación, gestión y evaluación de proyectos artísticos. Difusión de resultados',
    ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '5.4']],
  ['PART.B.2', 'Estrategias de trabajo en equipo. Distribución de tareas y liderazgo compartido. Resolución de conflictos', ['2.1', '4.1', '4.2']],
  ['PART.B.3', 'Estrategias, técnicas y soportes de documentación, registro y archivo', ['2.2', '3.1', '5.1', '5.2', '5.3', '5.4']],
  ['PART.B.4', 'Sostenibilidad e impacto de los proyectos artísticos', ['2.1', '3.1', '4.3']],
  ['PART.B.5', 'Oportunidades de desarrollo personal, social, académico y profesional relacionadas con el ámbito artístico. El emprendimiento cultural', ['3.1', '3.4']],
];

const nodes: CNode[] = [];
const links: CLink[] = [];

CE.forEach(([n, t]) => nodes.push(N('ce', `CE.PA.${n}`, t)));
CRIT.forEach(([c, t]) => {
  nodes.push(N('crit', c, t, tg(c)));
  links.push(K('crit-ce', nid('crit', c), nid('ce', `CE.PA.${c[0]}`)));
});
IND.forEach(([c, t]) => {
  nodes.push(N('ind', c, t, tg(c)));
  links.push(K('ind-crit', nid('ind', c), nid('crit', c.slice(0, 3))));
});
DESC.forEach(([c, t]) => nodes.push(N('desc', c, t, { group: /^[A-Z]+/.exec(c)![0] })));
for (const [ce, ds] of Object.entries(CE_DESC))
  for (const d of ds) links.push(K('ce-desc', nid('ce', `CE.PA.${ce}`), nid('desc', d)));
SABER.forEach(([c, t, crs]) => {
  nodes.push(N('saber', c, t));
  crs.forEach((cr) => links.push(K('saber-crit', nid('saber', c), nid('crit', cr))));
});

const subject: Subject = {
  id: PA_ID,
  name: 'Proyectos Artísticos',
  kind: 'bach',
  course: '1.º Bachillerato de Artes (Aragón)',
  updatedAt: now,
  levels: [
    { key: 'ce', label: 'Competencia específica', plural: 'Competencias específicas' },
    { key: 'crit', label: 'Criterio de evaluación', plural: 'Criterios', graded: true },
    { key: 'ind', label: 'Indicador', plural: 'Indicadores', graded: true },
    { key: 'desc', label: 'Descriptor operativo', plural: 'Descriptores' },
    { key: 'saber', label: 'Saber básico', plural: 'Saberes' },
  ],
  relations: [
    { key: 'ind-crit', from: 'ind', to: 'crit', aggregate: true, needFrom: true },
    { key: 'crit-ce', from: 'crit', to: 'ce', aggregate: true, needFrom: true, needTo: true },
    { key: 'ce-desc', from: 'ce', to: 'desc', aggregate: true, needFrom: true },
    { key: 'saber-crit', from: 'saber', to: 'crit', needFrom: true },
  ],
  instruments: [
    { id: 'proy', name: 'Proyectos', weight: 45 },
    { id: 'cuad', name: 'Cuaderno de clase', weight: 25 },
    { id: 'din', name: 'Dinámica de aula', weight: 15 },
    { id: 'exam', name: 'Exámenes teórico-prácticos', weight: 15 },
  ],
  terms: [
    { id: 't1', name: '1.ª evaluación', weight: 30 },
    { id: 't2', name: '2.ª evaluación', weight: 30 },
    { id: 't3', name: '3.ª evaluación', weight: 40 },
  ],
  config: { passMark: 5, termDecimals: 2, finalDecimals: 0, minPerInstrument: true, latePenaltyPct: 0, absenceWarnPct: 20 },
};

export const pa = { subject, nodes, links };
