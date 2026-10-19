import type { RubricDef, RubricGrade } from '../core/model';

export interface CCourse { id: string; name: string; section: string }
export interface CStudent { userId: string; givenName: string; familyName: string; fullName: string; email: string }
export interface CWork { id: string; title: string; maxPoints: number | null; state: string; workType: string; dueDate: string }
export interface CGrades {
  maxPoints: number | null;
  rubric: RubricDef | null;
  rubricError: string;
  submissions: { userId: string; state: string; late: boolean; assignedGrade: number | null; draftGrade: number | null; rubricGrades: RubricGrade[] }[];
}

/** Llama al Apps Script. Lanza Error con el mensaje del servidor si falla. */
export async function callScript<T = unknown>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const url = (localStorage.getItem('scriptUrl') ?? '').trim();
  const token = (localStorage.getItem('scriptToken') ?? '').trim();
  if (!url || !token) throw new Error('Configura la URL y el token en la pestaña Conexión.');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...data }),
  });
  const txt = await r.text();
  let j: { ok: boolean; error?: string; data?: unknown };
  try { j = JSON.parse(txt); } catch { throw new Error(`Respuesta no válida del servidor (HTTP ${r.status}): ${txt.slice(0, 160) || 'vacía'}`); }
  if (!j.ok) throw new Error(j.error === '403' ? 'Token incorrecto (403).' : String(j.error ?? 'Error desconocido'));
  return j.data as T;
}
