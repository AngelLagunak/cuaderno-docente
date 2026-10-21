import type { Activity, Grade, Stamp, Student, Term } from './model';

export type CellIn = string | number | boolean | Date | null | undefined;

/** Lee un CSV (separador «;», «,» o tabulador, con comillas). Quita el BOM. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Texto comparable: sin tildes, minúsculas, espacios simples. */
export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nota de una celda: número 0–10 (admite coma decimal). null = vacía; undefined = no válida. */
export function cellValue(c: CellIn): number | null | undefined {
  if (c == null || (typeof c === 'string' && c.trim() === '')) return null;
  const n = typeof c === 'number' ? c : Number(String(c).trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined;
}

export interface ImportPlan {
  headerRow: number;
  header: string[];
  /** Cómo se reconoce al alumno. */
  by: 'nia' | 'email' | 'name' | null;
  /** Columna → actividad (null = se ignora). */
  columns: { index: number; header: string; activityId: string | null; /** Columna de datos del alumno o de resultados: no se ofrece. */ skip?: boolean }[];
  /** Fila de datos → alumno (null = sin emparejar). */
  rows: { index: number; label: string; studentId: string | null }[];
}

const SKIP = /^(apellidos?|nombre|nia|correo|e-?mail|alumno|alumna|alumnado|ordinaria|via|oficial|calificacion|final|media|faltas)$/;

/**
 * Prepara la importación de una tabla de notas: busca la fila de cabecera, la forma de reconocer al alumnado
 * (NIA, correo o apellidos y nombre) y empareja cada columna con una actividad por su título. Admite el formato
 * que exporta la propia app («Título (1.ª evaluación)»).
 */
export function planImport(table: CellIn[][], students: Student[], activities: Activity[], terms: Term[]): ImportPlan {
  const text = table.map((r) => r.map((c) => String(c ?? '').trim()));
  const headerRow = Math.max(0, text.findIndex((r) => r.filter((c) => c !== '').length >= 2));
  const header = text[headerRow] ?? [];
  const h = header.map(norm);
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const cNia = col(/^nia$/), cMail = col(/correo|e-?mail/), cLast = col(/^apellidos?$/), cFirst = col(/^nombre$/), cFull = col(/^alumn(o|a|ado)$|apellidos,? nombre/);
  const live = students.filter((s) => !s.deleted);
  const byNia = new Map(live.filter((s) => s.nia).map((s) => [norm(s.nia), s.id]));
  const byMail = new Map(live.filter((s) => s.email).map((s) => [norm(s.email), s.id]));
  const byName = new Map<string, string>();
  for (const s of live) {
    byName.set(norm(`${s.lastName} ${s.firstName}`), s.id);
    byName.set(norm(`${s.lastName}, ${s.firstName}`), s.id);
    byName.set(norm(`${s.firstName} ${s.lastName}`), s.id);
  }
  const by: ImportPlan['by'] = cNia >= 0 ? 'nia' : cMail >= 0 ? 'email' : cLast >= 0 || cFull >= 0 ? 'name' : null;
  const rows = text.slice(headerRow + 1).map((r, i) => {
    const nameKey = cLast >= 0 ? norm(`${r[cLast]} ${cFirst >= 0 ? r[cFirst] : ''}`) : cFull >= 0 ? norm(r[cFull]) : '';
    const sid = (cNia >= 0 && byNia.get(norm(r[cNia]))) || (cMail >= 0 && byMail.get(norm(r[cMail]))) || (nameKey && byName.get(nameKey)) || null;
    const label = [cLast >= 0 ? r[cLast] : cFull >= 0 ? r[cFull] : '', cFirst >= 0 ? r[cFirst] : '', cNia >= 0 ? r[cNia] : '', cMail >= 0 ? r[cMail] : ''].filter(Boolean).join(' · ');
    return { index: headerRow + 1 + i, label: label || `Fila ${headerRow + 2 + i}`, studentId: sid };
  });

  const acts = activities.filter((a) => !a.deleted);
  const termName = new Map(terms.map((t) => [t.id, norm(t.name)]));
  const used = new Set([cNia, cMail, cLast, cFirst, cFull]);
  const columns = header.map((raw, index) => {
    const x = h[index];
    if (used.has(index) || !x || SKIP.test(x) || terms.some((t) => norm(t.name) === x)) return { index, header: raw, activityId: null, skip: true };
    const m = /^(.*?)\s*\(([^()]*)\)$/.exec(x);
    const [title, term] = m ? [m[1], m[2]] : [x, ''];
    const cands = acts.filter((a) => norm(a.title) === title);
    const hit = (term ? cands.find((a) => termName.get(a.termId) === term) : undefined) ?? (cands.length === 1 ? cands[0] : undefined);
    return { index, header: raw, activityId: hit?.id ?? null };
  });
  return { headerRow, header, by, columns, rows };
}

export interface ImportChange { studentId: string; activityId: string; value: number | null; current: number | null }

/** Cambios que produciría la importación: solo celdas válidas y distintas de la nota global actual. */
export function importChanges(plan: ImportPlan, table: CellIn[][], current: (studentId: string, activityId: string) => Grade | undefined) {
  const changes: ImportChange[] = [];
  let invalid = 0;
  for (const r of plan.rows) {
    if (!r.studentId) continue;
    for (const c of plan.columns) {
      if (!c.activityId) continue;
      const v = cellValue(table[r.index]?.[c.index]);
      if (v === undefined) { invalid++; continue; }
      if (v === null) continue; // celda vacía: no borra notas
      const cur = current(r.studentId, c.activityId)?.value ?? null;
      if (cur !== v) changes.push({ studentId: r.studentId, activityId: c.activityId, value: v, current: cur });
    }
  }
  return { changes, invalid };
}

/** Un borrado se puede eliminar del dispositivo tras 60 días, si ya se envió al servidor (o no se sincroniza). */
export function shouldPurge(r: Stamp, now: number, pushedAt: number): boolean {
  return !!r.deleted && r.updatedAt < now - 60 * 24 * 3600 * 1000 && r.updatedAt <= pushedAt;
}
