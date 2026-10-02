import type { CNode, Subject } from '../core/model';

export const MM_ID = 'mm-2joy';
const now = Date.now();

const UD: [string, string, string[]][] = [
  ['UD1', '1.ª eval.', [
    'Selecciona el material de moldeo flexible adecuado según las características del modelo original.',
    'Realiza moldes de alginato y silicona sin oclusiones de aire y con registros precisos.',
    'Respeta las pautas de seguridad e higiene en la preparación y colada de materiales de laboratorio.']],
  ['UD2', '1.ª eval.', [
    'Prepara y verifica archivos digitales garantizando su viabilidad para corte láser, mecanizado CNC o impresión 3D.',
    'Ajusta parámetros de corte, fresado e impresión considerando el material de trabajo.',
    'Repasa y da acabado manual al prototipo obtenido garantizando la fidelidad dimensional.']],
  ['UD3', '1.ª eval.', [
    'Captura la geometría de una pieza real mediante escáner 3D logrando una malla limpia y coherente.',
    'Edita y repara errores de geometría en archivos escaneados.',
    'Utiliza el modelo digitalizado correctamente como referencia espacial para el diseño de un elemento joyero.']],
  ['UD4', '2.ª eval.', [
    'Opera la vulcanizadora cumpliendo rigurosamente las normas de seguridad térmica y mecánica.',
    'Ejecuta el corte del caucho con bisturí manteniendo la integridad del modelo y facilitando el desmoldeo.',
    'Obtiene reproducciones homogéneas en cera exentas de burbujas, rechupados o deformaciones.']],
  ['UD5', '2.ª eval.', [
    'Diseña y ensambla un árbol de fundición garantizando la correcta fluidez del metal fundido.',
    'Calcula las proporciones de metal y revestimiento necesarias para la colada.',
    'Aplica los protocolos de seguridad personal e instrumental durante la fase de fundición y acabado de piezas.']],
];

const nodes: CNode[] = [];
let order = 0;
for (const [ud, ev, items] of UD)
  items.forEach((t, i) =>
    nodes.push({
      id: `${MM_ID}/aspecto:${ud}.${i + 1}`, subjectId: MM_ID, level: 'aspecto',
      code: `${ud}.${i + 1}`, title: t, order: order++, tags: [ud, ev], updatedAt: now,
    })
  );

const subject: Subject = {
  id: MM_ID,
  name: 'Modelado y Maquetismo II',
  kind: 'fp',
  course: '2.º Joyería Artística (CFGS)',
  updatedAt: now,
  levels: [{ key: 'aspecto', label: 'Aspecto evaluable', plural: 'Aspectos', graded: true }],
  relations: [],
  instruments: [
    { id: 'prac', name: 'Prácticas de aula y pruebas', weight: 60 },
    { id: 'proy', name: 'Proyectos personales', weight: 30 },
    { id: 'expo', name: 'Exposiciones, memorias y dossier', weight: 10 },
  ],
  // Pesos de evaluación no indicados en la programación: provisional 50/50.
  terms: [
    { id: 't1', name: '1.ª evaluación', weight: 50 },
    { id: 't2', name: '2.ª evaluación', weight: 50 },
  ],
  config: { passMark: 5, termDecimals: 1, finalDecimals: 1, minPerInstrument: false, latePenaltyPct: 30 },
};

export const mm = { subject, nodes, links: [] };
