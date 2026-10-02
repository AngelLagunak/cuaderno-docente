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
  /** Si true, una nota < passMark en algún instrumento marca la evaluación como no superada. */
  minPerInstrument: boolean;
  /** % de penalización por entrega tardía (0 = no se usa). */
  latePenaltyPct: number;
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

export interface Group extends Stamp { id: ID; subjectId: ID; name: string; schoolYear: string }
export interface Student extends Stamp { id: ID; groupId: ID; firstName: string; lastName: string; email?: string; nia?: string }

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
  date?: string;
}

export interface Grade extends Stamp {
  id: ID;
  studentId: ID;
  activityId: ID;
  value: number | null;
  late?: boolean;
  comment?: string;
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
