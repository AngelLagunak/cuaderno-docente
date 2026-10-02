import { useEffect, useState } from 'react';

const get = (k: string) => localStorage.getItem(k) ?? '';

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
  );
}
