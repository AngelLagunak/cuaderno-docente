import { useEffect, useState } from 'react';
import { callScript } from '../data/api';
import { autoOn, exportAll, restoreBackup, syncNow, useSyncStatus } from '../data/sync';
import { parseBackup } from '../core/io';
import type { Backup } from '../core/io';

const get = (k: string) => localStorage.getItem(k) ?? '';


function SyncPanel() {
  const st = useSyncStatus();
  const [auto, setAuto] = useState(autoOn());
  const [msg, setMsg] = useState('');
  return (
    <div className="card">
      <b>Sincronización y copias en Drive</b>
      <p className="mute">Los datos se guardan en este dispositivo y se sincronizan con un archivo de tu Drive. Gana el cambio más reciente de cada registro.</p>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem('syncAuto', e.target.checked ? '1' : '0'); }} /> Sincronizar automáticamente (cada minuto, al volver la conexión y al salir)</label>
      <div className="row">
        <button className="on" onClick={() => syncNow()} disabled={st.state === 'syncing'}>Sincronizar ahora</button>
        <button onClick={async () => { setMsg('Copiando…'); try { const r = await callScript<{ name: string; kept: number }>('backup.run'); setMsg(`Copia ${r.name} (${r.kept} guardadas)`); } catch (e) { setMsg('Error: ' + (e as Error).message); } }}>Copia en Drive ahora</button>
      </div>
      <p className="mute">{st.state === 'ok' ? `Última sincronización: ${st.last ? new Date(st.last).toLocaleTimeString('es-ES') : ''}. ` : ''}{st.msg ?? ''} · {st.pending} cambios pendientes</p>
      {msg && <p className="mute">{msg}</p>}
    </div>
  );
}

const NAMES: Record<string, string> = { students: 'alumnos', grades: 'notas', activities: 'actividades', groups: 'grupos', subjects: 'asignaturas', nodes: 'elementos del currículo', attendance: 'registros de asistencia', sessions: 'sesiones', units: 'unidades', rubrics: 'rúbricas' };

/** Copia de seguridad en un archivo: descargar y restaurar (combinando o volviendo a ella). */
export function BackupPanel() {
  const last = Number(localStorage.getItem('lastBackup') || 0);
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const [bk, setBk] = useState<{ name: string; data: Backup } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [msg, setMsg] = useState('');
  const [, force] = useState(0);
  const count = (t: string) => bk?.data.tables[t]?.filter((r) => !r.deleted).length ?? 0;

  async function pick(f?: File) {
    if (!f) return;
    setMsg('');
    try { setBk({ name: f.name, data: parseBackup(await f.text()) }); } catch (e) { setBk(null); setMsg((e as Error).message); }
  }
  async function run() {
    if (!bk) return;
    if (mode === 'replace' && !confirm('Todo volverá a como estaba en la copia y se borrará lo creado después (también en los demás dispositivos al sincronizar). ¿Continuar?')) return;
    const n = await restoreBackup(bk.data, mode);
    setBk(null);
    setMsg(n ? `Copia restaurada: ${n} registros.` : 'No había nada que restaurar: el dispositivo ya tenía lo de la copia o algo más reciente.');
  }
  return (
    <div className="card form">
      <b>Copia de seguridad en un archivo</b>
      <p className={days == null || days > 14 ? 'warn' : 'mute'}>
        {days == null ? 'Aún no has descargado ninguna copia en este dispositivo.' : `Última copia descargada: hace ${days === 0 ? 'menos de un día' : `${days} días`}.`} Guarda el archivo fuera del móvil (Drive, ordenador…).
      </p>
      <div className="row"><button className="on" onClick={async () => { await exportAll(); force((x) => x + 1); }}>Descargar copia</button></div>
      <label>Restaurar desde un archivo (copia descargada o «cuaderno-docente-db.json» de Drive)
        <input type="file" accept=".json,application/json" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {bk && (
        <>
          <p className="mute">{bk.name}{bk.data.exportedAt ? ` · del ${new Date(bk.data.exportedAt).toLocaleString('es-ES')}` : ''}: {Object.keys(NAMES).map((t) => count(t) && `${count(t)} ${NAMES[t]}`).filter(Boolean).join(', ') || 'vacía'}.</p>
          <label><input type="radio" style={{ width: 'auto' }} checked={mode === 'merge'} onChange={() => setMode('merge')} /> Combinar: recupera lo que falte o sea más reciente en la copia; no se pierde nada de lo hecho después.</label>
          <label><input type="radio" style={{ width: 'auto' }} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Volver a la copia: todo queda como en la copia y se borra lo creado después.</label>
          <div className="row"><button className="on" onClick={run}>Restaurar</button><button onClick={() => setBk(null)}>Cancelar</button></div>
        </>
      )}
      {msg && <p className="mute">{msg}</p>}
    </div>
  );
}

export function Settings() {
  const [url, setUrl] = useState(get('scriptUrl'));
  const [token, setToken] = useState(get('scriptToken'));
  const [online, setOnline] = useState(navigator.onLine);
  const [result, setResult] = useState('');

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  async function ping() {
    localStorage.setItem('scriptUrl', url.trim());
    localStorage.setItem('scriptToken', token.trim());
    setResult('Conectando…');
    try {
      const r = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ping', token: token.trim() }),
      });
      setResult(JSON.stringify(await r.json(), null, 2));
    } catch (e) {
      setResult('Error: ' + String(e));
    }
  }

  return (
    <>
    <div className="card">
      <p>Conexión: {online ? '🟢 con conexión' : '🔴 sin conexión'}</p>
      <label>URL del Apps Script
        <input className="full" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
      </label>
      <label>Token
        <input className="full" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button onClick={ping}>Probar conexión</button>
      {result && <pre>{result}</pre>}
    </div>
    <SyncPanel />
    <BackupPanel />
    </>
  );
}
