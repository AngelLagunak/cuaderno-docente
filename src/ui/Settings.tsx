import { useEffect, useState } from 'react';
import { callScript } from '../data/api';
import { autoOn, exportAll, importAll, syncNow, useSyncStatus } from '../data/sync';

const get = (k: string) => localStorage.getItem(k) ?? '';


function SyncPanel() {
  const st = useSyncStatus();
  const [auto, setAuto] = useState(autoOn());
  const [msg, setMsg] = useState('');
  return (
    <div className="card">
      <b>Sincronización y copias</b>
      <p className="mute">Los datos se guardan en este dispositivo y se sincronizan con un archivo de tu Drive. Gana el cambio más reciente de cada registro.</p>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem('syncAuto', e.target.checked ? '1' : '0'); }} /> Sincronizar automáticamente (cada minuto, al volver la conexión y al salir)</label>
      <div className="row">
        <button className="on" onClick={() => syncNow()} disabled={st.state === 'syncing'}>Sincronizar ahora</button>
        <button onClick={async () => { setMsg('Copiando…'); try { const r = await callScript<{ name: string; kept: number }>('backup.run'); setMsg(`Copia ${r.name} (${r.kept} guardadas)`); } catch (e) { setMsg('Error: ' + (e as Error).message); } }}>Copia en Drive ahora</button>
      </div>
      <p className="mute">{st.state === 'ok' ? `Última sincronización: ${st.last ? new Date(st.last).toLocaleTimeString('es-ES') : ''}. ` : ''}{st.msg ?? ''} · {st.pending} cambios pendientes</p>
      <div className="row">
        <button onClick={exportAll}>Exportar todo (JSON)</button>
        <label className="mute">Importar JSON <input type="file" accept=".json,application/json" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try { setMsg(`${await importAll(await f.text())} registros importados.`); } catch (err) { setMsg('Error: ' + (err as Error).message); }
          e.target.value = '';
        }} /></label>
      </div>
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
    </>
  );
}
