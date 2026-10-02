import { useEffect, useState } from 'react';

const get = (k: string) => localStorage.getItem(k) ?? '';

export function App() {
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
        body: JSON.stringify({ action: 'ping', token: token.trim() })
      });
      setResult(JSON.stringify(await r.json(), null, 2));
    } catch (e) {
      setResult('Error: ' + String(e));
    }
  }

  const box = { display: 'block', width: '100%', padding: 8, margin: '4px 0 12px', boxSizing: 'border-box' as const };
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h1>Cuaderno docente</h1>
      <p>Fase 0 · Estado: {online ? '🟢 con conexión' : '🔴 sin conexión'}</p>
      <label>URL del Apps Script
        <input style={box} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
      </label>
      <label>Token
        <input style={box} type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button onClick={ping} style={{ padding: '10px 16px' }}>Probar conexión</button>
      <pre style={{ background: '#f2f2f2', padding: 12, whiteSpace: 'pre-wrap' }}>{result}</pre>
    </div>
  );
}
