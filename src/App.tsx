import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seed } from './data/db';
import { Curriculum } from './ui/Curriculum';
import { Settings } from './ui/Settings';
import { Summary } from './ui/Summary';

export function App() {
  const [tab, setTab] = useState<'curr' | 'ajustes'>('curr');
  const [sid, setSid] = useState<string>('');
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
        <button className={tab === 'curr' ? 'on' : ''} onClick={() => setTab('curr')}>Currículo</button>
        <button className={tab === 'ajustes' ? 'on' : ''} onClick={() => setTab('ajustes')}>Ajustes</button>
      </div>
      {tab === 'ajustes' && <Settings />}
      {tab === 'curr' && subject && (
        <>
          <Summary subject={subject} />
          <Curriculum key={subject.id} subject={subject} />
        </>
      )}
    </div>
  );
}
