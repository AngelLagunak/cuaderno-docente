import type { Activity, CNode, Grade, RubricDef, RubricGrade } from './model';
import type { StudentGrades } from './evaluation';

type Criterion = RubricDef['criteria'][number];

/** Código curricular al principio del título de una fila de rúbrica: «3.2 Explicar…», «CE.PA.1 …», «UD1.2: …». */
const codeOf = (title: string) => /^\s*([A-Za-z]{0,3}[\d.]*\d)(?=[\s:.)\-–]|$)/.exec(title)?.[1];

/**
 * Empareja cada fila de una rúbrica de Classroom con un elemento calificable cuyo código aparezca al principio
 * del título de la fila. Respeta lo que ya estaba emparejado.
 */
export function autoMap(rubric: RubricDef, nodes: CNode[], graded: Set<string>, current: RubricMapping = {}): Record<string, string[]> {
  const byCode = new Map(nodes.filter((n) => !n.deleted && graded.has(n.level)).map((n) => [n.code.toLowerCase(), n.id]));
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(current)) if (rowNodes(current, k).length) out[k] = rowNodes(current, k);
  for (const c of rubric.criteria) {
    if (out[c.id]?.length) continue;
    const code = codeOf(c.title)?.toLowerCase();
    const id = code ? byCode.get(code) : undefined;
    if (id) out[c.id] = [id];
  }
  return out;
}

export type RubricMapping = Record<string, string | string[]>;
/** Concreciones de una fila de la rúbrica (el emparejamiento antiguo guardaba una sola). */
export const rowNodes = (map: RubricMapping | undefined, rowId: string): string[] => {
  const v = map?.[rowId];
  return !v ? [] : Array.isArray(v) ? v.filter(Boolean) : [v];
};
/** Todas las concreciones que mide la rúbrica. */
export const mappedNodes = (map: RubricMapping | undefined): string[] => [...new Set(Object.keys(map ?? {}).flatMap((k) => rowNodes(map, k)))];

/** Nota 0–10 de una fila de rúbrica: puntos obtenidos sobre el máximo de la fila. */
export function rubricValue(c: Criterion, rg: RubricGrade): number | null {
  const max = Math.max(0, ...c.levels.map((l) => l.points));
  const pts = rg.points ?? c.levels.find((l) => l.id === rg.levelId)?.points ?? null;
  if (pts == null || max <= 0) return null;
  return Math.round((pts / max) * 1000) / 100;
}

/** Nota 0–10 a partir de los puntos de Classroom. */
export const pointsValue = (pts: number | null, max: number | null | undefined) =>
  pts == null || !max ? null : Math.round((pts / max) * 1000) / 100;

/** Cambio que llega de Classroom para una nota global (sin `nodeId`) o de un criterio. */
export interface Incoming { studentId: string; nodeId?: string; value: number }

/**
 * Decide qué hacer con un valor que llega de Classroom. `cls` guarda el último valor importado: si la nota de la
 * app sigue igual que ese valor (no se ha tocado aquí), Classroom manda; si se cambió en la app, es un conflicto.
 */
export function classify(cur: Grade | undefined, value: number): 'same' | 'apply' | 'conflict' {
  if (cur?.value === value) return 'same';
  if (!cur || cur.value == null || cur.value === cur.cls) return 'apply';
  return 'conflict';
}

/**
 * Notas por criterio que salen de las rúbricas de Classroom guardadas en la nota global de cada alumno
 * (`Grade.rubric`), según el emparejamiento fila → criterio de la actividad.
 */
export function rubricItems(a: Activity, students: string[], sgOf: (id: string) => StudentGrades): Incoming[] {
  if (!a.rubric || !a.classroomRubricMap) return [];
  const out: Incoming[] = [];
  for (const sid of students) {
    const raw = sgOf(sid).byActivity.get(a.id)?.rubric ?? [];
    // Una fila puede medir varias concreciones, y una concreción puede salir de varias filas (se hace la media).
    const acc = new Map<string, number[]>();
    for (const rg of raw) {
      const c = a.rubric.criteria.find((x) => x.id === rg.criterionId);
      const v = c ? rubricValue(c, rg) : null;
      if (v == null) continue;
      for (const nodeId of rowNodes(a.classroomRubricMap, rg.criterionId)) acc.set(nodeId, [...(acc.get(nodeId) ?? []), v]);
    }
    for (const [nodeId, vs] of acc) out.push({ studentId: sid, nodeId, value: Math.round((vs.reduce((x, y) => x + y, 0) / vs.length) * 100) / 100 });
  }
  return out;
}
