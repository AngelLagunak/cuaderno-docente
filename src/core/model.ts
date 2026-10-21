export type ID = string;

export interface Stamp {
  updatedAt: number;
  deleted?: boolean;
  deviceId?: string;
}

export interface LevelDef {
  key: string;
  label: string;
  plural: string;
  graded?: boolean;
}

/** Relación muchos-a-muchos entre dos niveles. `aggregate`: el valor de `from` alimenta a `to`. */
export interface RelationDef {
  key: string;
  from: string;
  to: string;
  aggregate?: boolean;
  needFrom?: boolean; // cada nodo `from` debería tener al menos un enlace
  needTo?: boolean; // cada nodo `to` debería tener al menos un enlace
}

export interface Instrument { id: ID; name: string; weight: number }
export interface Term { id: ID; name: string; weight: number }

export interface SubjectConfig {
  passMark: number;
  termDecimals: number;
  finalDecimals: number;
  /** Nota final mínima tras redondear (SIGAD no admite 0). Por defecto 1. */
  minGrade?: number;
  /**
   * Nivel curricular del que sale la nota de cada evaluación (p. ej. 'ce': media de las competencias específicas).
   * null o vacío: media ponderada de instrumentos. undefined: aún no elegido (se aplica la migración de la materia).
   */
  gradeLevel?: string | null;
  /** Pérdida de evaluación continua: carpeta/dossier + prueba global (porcentajes). */
  lec?: { folderPct: number; examPct: number };
  /** Convocatoria extraordinaria: proyectos/trabajos + examen; `minEach` > 0 exige esa nota en ambas partes para hacer media. */
  extra?: { projectsPct: number; examPct: number; minEach: number };
  /** Entrega fuera de plazo sin justificar: no se puede mejorar (recuperar). */
  lateNoImprove?: boolean;
  /** Escala de la nota final: numérica o SS/AP/NT/SB. */
  scale?: 'num' | 'ssapntsb';
  /** Si true, una nota < passMark en algún instrumento marca la evaluación como no superada. */
  minPerInstrument: boolean;
  /** % de penalización por entrega tardía (0 = no se usa). */
  latePenaltyPct: number;
  /** % de faltas injustificadas que activa el aviso (por defecto 20). */
  absenceWarnPct?: number;
  /** Sesiones anuales previstas; 0 o vacío = usar las sesiones pasadas lista. */
  annualSessions?: number;
}

export interface Subject extends Stamp {
  id: ID;
  name: string;
  kind: 'bach' | 'fp';
  course: string;
  levels: LevelDef[];
  relations: RelationDef[];
  instruments: Instrument[];
  terms: Term[];
  config: SubjectConfig;
}

export interface CNode extends Stamp {
  id: ID;
  subjectId: ID;
  level: string;
  code: string;
  title: string;
  order: number;
  tags: string[];
  /** Descriptores: competencia clave a la que pertenecen (CCL, STEM, CD…). */
  group?: string;
}

export interface CLink extends Stamp {
  id: ID;
  subjectId: ID;
  relation: string;
  fromId: ID;
  toId: ID;
}

export const linkId = (subjectId: ID, relation: string, fromId: ID, toId: ID) =>
  `${subjectId}/${relation}:${fromId}>${toId}`;

export interface Group extends Stamp {
  id: ID; subjectId: ID; name: string; schoolYear: string; classroomCourseId?: string;
  /** Horario semanal (1 = lunes), para generar el calendario de sesiones y calcular las sesiones previstas. */
  timetable?: { weekday: number; slot: string }[];
  /** Festivos propios del grupo (antiguo): se suman a los del calendario escolar. */
  holidays?: string;
}
export interface Student extends Stamp {
  id: ID; groupId: ID; firstName: string; lastName: string; email?: string; nia?: string; classroomUserId?: string;
  /** Pérdida de evaluación continua (la decide el docente) y notas de la vía alternativa. */
  lec?: boolean;
  lecGrades?: { folder: number | null; exam: number | null };
  /** Notas de la convocatoria extraordinaria. */
  extra?: { projects: number | null; exam: number | null };
}

/** Una actividad pertenece a un instrumento y a un trimestre. Los nodos curriculares son opcionales. */
export interface Activity extends Stamp {
  id: ID;
  subjectId: ID;
  groupId: ID;
  termId: ID;
  instrumentId: ID;
  title: string;
  weight: number;
  nodeIds: ID[];
  unitId?: ID;
  classroomWorkId?: string;
  maxPoints?: number;
  /** Rúbrica traída de Classroom (solo lectura). */
  rubric?: RubricDef;
  /** Fila de la rúbrica de Classroom → elemento curricular que mide. */
  classroomRubricMap?: Record<string, ID>;
  /** La tarea de Classroom la creó la app (solo en esas se pueden escribir notas). */
  classroomCreated?: boolean;
  /** Rúbrica propia de la app. */
  rubricId?: ID;
  date?: string;
}

/**
 * Sin `nodeId`: nota global de la actividad (id `alumno|actividad`); guarda también la entrega tardía y el comentario.
 * Con `nodeId`: nota de un criterio en esa actividad (id `alumno|actividad|nodo`). Si hay alguna, la nota de la
 * actividad es su media y la global se ignora.
 */
export interface Grade extends Stamp {
  id: ID;
  studentId: ID;
  activityId: ID;
  nodeId?: ID;
  /** Nivel de la rúbrica propia (0 = primer nivel). */
  level?: number;
  value: number | null;
  /** Último valor traído de Classroom: si `value` sigue igual, Classroom puede actualizarla sin preguntar. */
  cls?: number | null;
  /** Recuperación: nota anterior (la que cuenta es `value`) y fecha AAAA-MM-DD. */
  prev?: number | null;
  recoveredAt?: string;
  late?: boolean;
  comment?: string;
  rubric?: RubricGrade[];
}

/** Unidad didáctica: la programa el docente (no se precarga). */
export interface LearningUnit extends Stamp {
  id: ID;
  subjectId: ID;
  code: string;
  title: string;
  termId: ID;
  plannedSessions: number;
  nodeIds: ID[];
}

/** Sesión de clase planificada (fecha + hora) con su unidad y tema. */
export interface Session extends Stamp {
  id: ID;
  groupId: ID;
  date: string; // AAAA-MM-DD
  slot: string;
  unitId?: ID;
  topic: string;
  notes?: string;
  /** Lo que se llegó a hacer y lo que queda pendiente para la sesión siguiente. */
  done?: string;
  pending?: string;
}

/** Calendario escolar de un curso (común a todas las materias y grupos). `id` = curso escolar, p. ej. «2026/27». */
export interface SchoolCalendar extends Stamp {
  id: string;
  start: string; // AAAA-MM-DD
  end: string;
  /** Días no lectivos: una fecha o «inicio..fin» por línea, con su nombre detrás. */
  holidays: string;
  /** Fechas de cada evaluación, en orden (1.ª, 2.ª…). */
  terms: { name: string; start: string; end: string }[];
}

export type AttStatus = 'P' | 'A' | 'R' | 'J';

/** Una fila por alumno y sesión (fecha + hora). Existir una fila implica que la sesión se pasó lista. */
export interface Attendance extends Stamp {
  id: ID; // `${studentId}|${date}|${slot}`
  studentId: ID;
  groupId: ID;
  date: string; // AAAA-MM-DD
  slot: string;
  status: AttStatus;
  note?: string;
}

export interface RubricDef {
  id: string;
  criteria: { id: string; title: string; levels: { id: string; title: string; points: number }[] }[];
}
export interface RubricLevel { label: string; value: number }
/** Rúbrica propia: niveles con su nota y una fila por criterio con el descriptor de cada nivel. */
export interface Rubric extends Stamp {
  id: ID;
  subjectId: ID;
  name: string;
  levels: RubricLevel[];
  rows: { nodeId: ID; text: string[] }[];
}

export const defaultLevels = (): RubricLevel[] => [
  { label: 'Insuficiente', value: 2.5 },
  { label: 'Suficiente', value: 5 },
  { label: 'Notable', value: 7.5 },
  { label: 'Sobresaliente', value: 10 },
];

export interface RubricGrade { criterionId: string; levelId?: string; points?: number | null }

export interface Message extends Stamp {
  id: ID;
  groupId: ID;
  kind: 'mail' | 'announcement';
  subject: string;
  body: string;
  targets: ID[];
  sentAt: number;
  status: 'ok' | 'error';
  info?: string;
}

export interface Template extends Stamp { id: ID; name: string; subject: string; body: string }
