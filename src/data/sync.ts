import { useSyncExternalStore } from 'react';
import type { Table } from 'dexie';
import { db } from './db';
import { callScript } from './api';
import type { Stamp } from '../core/model';
import { restorePlan, shouldPurge } from '../core/io';
import type { Backup } from '../core/io';

const TABLES = ['subjects', 'nodes', 'links', 'groups', 'students', 'activities', 'grades', 'units', 'attendance', 'messages', 'templates', 'rubrics', 'sessions', 'calendars', 'snapshots'];
type Rec = Stamp & { id: string; _v?: number };
const tab = (t: string) => (db as unknown as Record<string, Table<Rec, string>>)[t];

export interface SyncStatus { state: 'off' | 'idle' | 'syncing' | 'ok' | 'error' | 'offline'; last?: number; pending: number; msg?: string }
let st: SyncStatus = { state: 'off', pending: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<SyncStatus>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useSyncStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st);

const num = (k: string) => Number(localStorage.getItem(k) || 0);
export const configured = () => !!(localStorage.getItem('scriptUrl') && localStorage.getItem('scriptToken'));
export const autoOn = () => localStorage.getItem('syncAuto') !== '0';

export async function pendingCount() {
  const since = num('syncPushAt');
  let n = 0;
  for (const t of TABLES) n += await tab(t).filter((r) => r.updatedAt > since).count();
  return n;
}

/** Aplica registros remotos: gana el más reciente por registro. */
export async function applyRemote(pull: Record<string, Rec[]>) {
  let n = 0;
  for (const [t, rows] of Object.entries(pull)) {
    const T = tab(t);
    if (!T) continue;
    const cur = await T.bulkGet(rows.map((r) => r.id));
    const upd = rows.filter((r, i) => !cur[i] || cur[i]!.updatedAt < r.updatedAt).map((r) => { const c = { ...r }; delete c._v; return c; });
    if (upd.length) { await T.bulkPut(upd); n += upd.length; }
  }
  return n;
}

/**
 * Lo precargado por versiones antiguas (updatedAt 0) nunca se sube al servidor. Se marca una vez por dispositivo,
 * después de recibir lo remoto, para que llegue a Drive y a los demás dispositivos.
 */
async function adoptPreloaded() {
  if (localStorage.getItem('preloadAdopted')) return 0;
  const now = Date.now();
  let n = 0;
  for (const t of TABLES) {
    const rows = await tab(t).filter((r) => !r.updatedAt).toArray();
    if (rows.length) { await tab(t).bulkPut(rows.map((r) => ({ ...r, updatedAt: now }))); n += rows.length; }
  }
  localStorage.setItem('preloadAdopted', '1');
  return n;
}

let running = false;
export async function syncNow() {
  if (running) return;
  if (!configured()) { set({ state: 'off', msg: 'Configura la conexión' }); return; }
  if (!navigator.onLine) { set({ state: 'offline' }); return; }
  running = true;
  let again = false;
  set({ state: 'syncing' });
  try {
    const startedAt = Date.now();
    const since = num('syncSince');
    const pushAt = num('syncPushAt');
    // Envío en lotes de ~100 registros para no saturar al Apps Script.
    const chunks: Record<string, Rec[]>[] = [];
    let cur: Record<string, Rec[]> = {};
    let n = 0;
    let pushed = 0;
    for (const t of TABLES) {
      const rows = await tab(t).filter((r) => r.updatedAt > pushAt).toArray();
      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100);
        if (n > 0 && n + part.length > 100) { chunks.push(cur); cur = {}; n = 0; }
        (cur[t] ??= []).push(...part);
        n += part.length;
        pushed += part.length;
      }
    }
    if (n > 0 || chunks.length === 0) chunks.push(cur);
    let version = since;
    let pulled = 0;
    for (const push of chunks) {
      set({ msg: `Sincronizando… (${chunks.indexOf(push) + 1}/${chunks.length})` });
      const res = await callScript<{ version: number; pull: Record<string, Rec[]> }>('sync', { since: version, push });
      pulled += await applyRemote(res.pull);
      version = res.version;
    }
    localStorage.setItem('syncSince', String(version));
    localStorage.setItem('syncPushAt', String(startedAt));
    again = (await adoptPreloaded()) > 0;
    set({ state: 'ok', last: Date.now(), pending: await pendingCount(), msg: `${pushed} enviados, ${pulled} recibidos` });
  } catch (e) {
    set({ state: 'error', msg: (e as Error).message, pending: await pendingCount().catch(() => 0) });
  } finally {
    running = false;
  }
  if (again) await syncNow();
}

/** Elimina del dispositivo los borrados de hace más de 60 días que ya se enviaron al servidor. */
export async function purgeDeleted() {
  const now = Date.now();
  const pushedAt = configured() ? num('syncPushAt') : now;
  let n = 0;
  for (const t of TABLES) {
    const ids = await tab(t).filter((r) => shouldPurge(r, now, pushedAt)).primaryKeys();
    if (ids.length) { await tab(t).bulkDelete(ids); n += ids.length; }
  }
  return n;
}

export async function exportAll() {
  const tables: Record<string, Rec[]> = {};
  for (const t of TABLES) tables[t] = await tab(t).toArray();
  const blob = new Blob([JSON.stringify({ app: 'cuaderno-docente', exportedAt: new Date().toISOString(), tables })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cuaderno-docente-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  localStorage.setItem('lastBackup', String(Date.now()));
}

/** Restaura una copia (exportación o db.json de Drive): combinar o volver a ella. Devuelve los registros guardados. */
export async function restoreBackup(backup: Backup, mode: 'merge' | 'replace') {
  const current: Record<string, Rec[]> = {};
  for (const t of TABLES) current[t] = await tab(t).toArray();
  const plan = restorePlan(current, backup.tables, mode, Date.now());
  let n = 0;
  await db.transaction('rw', TABLES.map(tab), async () => {
    for (const [t, rows] of Object.entries(plan)) { await tab(t).bulkPut(rows); n += rows.length; }
  });
  return n;
}

export function startAutoSync() {
  const tick = () => { if (autoOn()) syncNow(); };
  const refresh = () => pendingCount().then((pending) => set({ pending, ...(configured() ? {} : { state: 'off' as const }) })).catch(() => {});
  const onVis = () => { if (document.visibilityState === 'hidden') tick(); };
  const onOff = () => set({ state: 'offline' });
  refresh();
  tick();
  const a = setInterval(tick, 60_000);
  const b = setInterval(refresh, 10_000);
  window.addEventListener('online', tick);
  window.addEventListener('offline', onOff);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(a); clearInterval(b);
    window.removeEventListener('online', tick);
    window.removeEventListener('offline', onOff);
    document.removeEventListener('visibilitychange', onVis);
  };
}
