import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seed } from './data/db';
import { Attendance } from './ui/Attendance';
import { Config } from './ui/Config';
import { Curriculum } from './ui/Curriculum';
import { Groups } from './ui/Groups';
import { Notebook } from './ui/Notebook';
import { Planner } from './ui/Planner';
import { Settings } from './ui/Settings';

const TABS = [
  ['notes', 'Cuaderno'],
  ['att', 'Asistencia'],
  ['groups', 'Grupos'],
  ['plan', 'Planificador'],
  ['curr', 'Currículo'],
  ['config', 'Configuración'],
  ['conn', 'Conexión'],
] as const;
type Tab = (typeof TABS)[number][0];

export function App() {
  const [tab, setTab] = useState<Tab>('notes');
  const [sid, setSid] = useState('');
  const subjects = useLiveQuery(() => db.subjects.toArray());

  useEffect(() => {
    navigator.storage?.persist?.();
    seed().catch(console.error);
  }, []);

  const subject = subjects?.find((s) => s.id === sid) ?? subjects?.[0];

  return (
    <div className="wrap">
      <h1>Cuaderno docente</h1>
      <div className="row">
        <select value={subject?.id ?? ''} onChange={(e) => setSid(e.target.value)}>
          {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'conn' && <Settings />}
      {subject && tab === 'notes' && <Notebook key={subject.id} subject={subject} />}
      {subject && tab === 'att' && <Attendance key={subject.id} subject={subject} />}
      {subject && tab === 'groups' && <Groups key={subject.id} subject={subject} />}
      {subject && tab === 'plan' && <Planner key={subject.id} subject={subject} />}
      {subject && tab === 'curr' && <Curriculum key={subject.id} subject={subject} />}
      {subject && tab === 'config' && <Config key={subject.id} subject={subject} />}
    </div>
  );
}
