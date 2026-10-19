import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seed } from './data/db';
import { startAutoSync, syncNow, useSyncStatus } from './data/sync';
import { Attendance } from './ui/Attendance';
import { Comms } from './ui/Comms';
import { Config } from './ui/Config';
import { Curriculum } from './ui/Curriculum';
import { Groups } from './ui/Groups';
import { Notebook } from './ui/Notebook';
import { Planner } from './ui/Planner';
import { Reports } from './ui/Reports';
import { Settings } from './ui/Settings';

const TABS = [
  ['notes', 'Cuaderno'],
  ['att', 'Asistencia'],
  ['rep', 'Informes'],
  ['comm', 'Comunicación'],
  ['groups', 'Grupos'],
  ['plan', 'Planificador'],
  ['curr', 'Currículo'],
  ['config', 'Configuración'],
  ['conn', 'Conexión'],
] as const;
type Tab = (typeof TABS)[number][0];

function SyncBar() {
  const st = useSyncStatus();
  const t = st.last ? new Date(st.last).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const label = st.state === 'off' ? '⚪ Sin sincronizar (configura Conexión)'
    : st.state === 'offline' ? '🔴 Sin conexión' + (st.pending ? ` · ${st.pending} pendientes` : '')
    : st.state === 'syncing' ? '🔄 Sincronizando…'
    : st.state === 'error' ? `⚠ Error: ${st.msg ?? ''}`
    : st.pending ? `🟠 ${st.pending} cambios pendientes` : `🟢 Sincronizado ${t}`;
  return <button className="small noprint" onClick={() => syncNow()} title="Sincronizar ahora">{label}</button>;
}

export function App() {
  const [tab, setTab] = useState<Tab>('notes');
  const [sid, setSid] = useState('');
  const subjects = useLiveQuery(() => db.subjects.toArray());

  useEffect(() => {
    navigator.storage?.persist?.();
    seed().catch(console.error);
    return startAutoSync();
  }, []);

  const subject = subjects?.find((s) => s.id === sid) ?? subjects?.[0];

  return (
    <div className="wrap">
      <h1 className="noprint">Cuaderno docente</h1>
      <div className="row noprint">
        <select value={subject?.id ?? ''} onChange={(e) => setSid(e.target.value)}>
          {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <SyncBar />
      </div>
      <div className="tabs noprint">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'conn' && <Settings />}
      {subject && tab === 'notes' && <Notebook key={subject.id} subject={subject} />}
      {subject && tab === 'att' && <Attendance key={subject.id} subject={subject} />}
      {subject && tab === 'comm' && <Comms key={subject.id} subject={subject} />}
      {subject && tab === 'rep' && <Reports key={subject.id} subject={subject} />}
      {subject && tab === 'groups' && <Groups key={subject.id} subject={subject} />}
      {subject && tab === 'plan' && <Planner key={subject.id} subject={subject} />}
      {subject && tab === 'curr' && <Curriculum key={subject.id} subject={subject} />}
      {subject && tab === 'config' && <Config key={subject.id} subject={subject} />}
    </div>
  );
}
