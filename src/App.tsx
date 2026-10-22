import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seed } from './data/db';
import { purgeDeleted, startAutoSync, syncNow, useSyncStatus } from './data/sync';
import { Attendance } from './ui/Attendance';
import { Comms } from './ui/Comms';
import { Config } from './ui/Config';
import { Curriculum } from './ui/Curriculum';
import { Groups } from './ui/Groups';
import { Notebook } from './ui/Notebook';
import { Planner } from './ui/Planner';
import { Reports } from './ui/Reports';
import { Settings } from './ui/Settings';
import { SchoolCalendar } from './ui/SchoolCalendar';
import { NewSubject } from './ui/NewSubject';
import { Today } from './ui/Today';
import { Progress } from './ui/Progress';
import { Icon } from './ui/icons';
import type { IconName } from './ui/icons';
import { setCurrentGroup, useCurrentGroupId } from './ui/hooks';

type View = 'hoy' | 'notes' | 'plan' | 'seg' | 'more' | 'att' | 'groups' | 'rep' | 'comm' | 'curr' | 'config' | 'cal' | 'conn' | 'new';

const MAIN: [View, string, IconName][] = [['hoy', 'Hoy', 'home'], ['notes', 'Cuaderno', 'grid'], ['plan', 'Planificar', 'cal']];
const SECTIONS: { title: string; items: [View, string, string][] }[] = [
  { title: 'Alumnado', items: [['groups', 'Grupos y alumnos', 'Alumnado, NIA, importar de Classroom'], ['att', 'Asistencia', 'Pasar lista y resumen de faltas'], ['rep', 'Informes', 'Perfil competencial y boletines'], ['comm', 'Comunicación con el alumnado', 'Correos y avisos en el tablón de Classroom']] },
  { title: 'Programación', items: [['seg', 'Seguimiento', 'Avance de las sesiones y resultados del grupo'], ['curr', 'Currículo', 'Competencias, criterios, objetivos y versiones'], ['config', 'Evaluación y configuración', 'Instrumentos, evaluaciones y cálculo'], ['cal', 'Calendario escolar', 'Festivos, evaluaciones y sesiones previstas'], ['new', 'Nueva asignatura', 'Plantilla LOMLOE, FP o copia']] },
  { title: 'Datos', items: [['conn', 'Conexión y copias', 'Sincronización, Classroom y copia de seguridad']] },
];
const TITLE: Record<View, string> = { hoy: 'Hoy', notes: 'Cuaderno', plan: 'Planificar', seg: 'Seguimiento', more: 'Más', att: 'Asistencia', groups: 'Grupos y alumnos', rep: 'Informes', comm: 'Comunicación', curr: 'Currículo', config: 'Evaluación y configuración', cal: 'Calendario escolar', conn: 'Conexión y copias', new: 'Nueva asignatura' };
/** Pantallas que trabajan sobre una asignatura y un grupo (llevan el selector arriba). */
const WITH_CONTEXT = new Set<View>(['notes', 'plan', 'seg', 'att', 'groups', 'rep', 'comm', 'curr', 'config']);

function SyncBar() {
  const st = useSyncStatus();
  const t = st.last ? new Date(st.last).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const [label, cls] = st.state === 'off' ? ['Sin sincronizar', 'off']
    : st.state === 'offline' ? ['Sin conexión' + (st.pending ? ` · ${st.pending} pendientes` : ''), 'bad']
    : st.state === 'syncing' ? ['Sincronizando…', 'off']
    : st.state === 'error' ? [`Error de sincronización`, 'bad']
    : st.pending ? [`${st.pending} cambios pendientes`, 'off'] : [`Sincronizado ${t}`, 'ok'];
  return <button className={'sync noprint ' + cls} onClick={() => syncNow()} title={st.msg ?? 'Sincronizar ahora'}><span className="dot" />{label}</button>;
}

const readLS = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export function App() {
  const [view, setView] = useState<View>('hoy');
  const [sid, setSidState] = useState(readLS('subjectId'));
  const setSid = (id: string) => { setSidState(id); writeLS('subjectId', id); };
  const [gid] = useCurrentGroupId();
  // Lo que se abre desde Hoy: una lista concreta o una actividad para calificar.
  const [attPreset, setAttPreset] = useState<{ date: string; slot: string } | undefined>();
  const [focusAct, setFocusAct] = useState<string | undefined>();
  const all = useLiveQuery(() => db.subjects.toArray());
  const groupsAll = useLiveQuery(() => db.groups.toArray());
  const subjects = all?.filter((s) => !s.deleted);
  const groups = (groupsAll ?? []).filter((g) => !g.deleted);

  useEffect(() => {
    navigator.storage?.persist?.();
    seed().then(purgeDeleted).catch(console.error);
    return startAutoSync();
  }, []);

  const subject = subjects?.find((s) => s.id === sid) ?? subjects?.[0];
  const go = (v: View) => { setView(v); setAttPreset(undefined); setFocusAct(undefined); window.scrollTo(0, 0); };
  const ctxValue = `${subject?.id ?? ''}|${groups.some((g) => g.id === gid && g.subjectId === subject?.id) ? gid : groups.find((g) => g.subjectId === subject?.id)?.id ?? ''}`;
  const section = view === 'seg' ? 'plan' : MAIN.some(([v]) => v === view) ? view : 'more';

  const context = subjects && WITH_CONTEXT.has(view) && (
    <select className="ctx" aria-label="Grupo y asignatura" value={ctxValue} onChange={(e) => { const [s, g] = e.target.value.split('|'); setSid(s); if (g) setCurrentGroup(g); }}>
      {subjects.map((s) => {
        const gs = groups.filter((g) => g.subjectId === s.id);
        return gs.length
          ? gs.map((g) => <option key={g.id} value={`${s.id}|${g.id}`}>{g.name} · {s.name}</option>)
          : <option key={s.id} value={`${s.id}|`}>{s.name} (sin grupos)</option>;
      })}
    </select>
  );

  return (
    <div className="shell">
      <nav className="side noprint" aria-label="Secciones">
        <b className="brand">Cuaderno docente</b>
        {[...MAIN, ['seg', 'Seguimiento', 'chart'] as [View, string, IconName]].map(([v, l, i]) => <button key={v} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}><Icon name={i} /> {l}</button>)}
        {SECTIONS.map((s) => (
          <div key={s.title} className="sidegroup">
            <span>{s.title}</span>
            {s.items.filter(([v]) => v !== 'seg').map(([v, l]) => <button key={v} aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>{l}</button>)}
          </div>
        ))}
      </nav>

      <main className="main">
        <header className="topbar noprint">
          <h1>{TITLE[view]}</h1>
          <SyncBar />
        </header>
        {context && <div className="row noprint">{context}</div>}

        {view === 'hoy' && <Today nav={{
          attendance: (s, g, date, slot) => { setSid(s); setCurrentGroup(g); setView('att'); setAttPreset({ date, slot }); window.scrollTo(0, 0); },
          grade: (s, g, a) => { setSid(s); setCurrentGroup(g); setView('notes'); setFocusAct(a); window.scrollTo(0, 0); },
          notebook: (s, g) => { setSid(s); setCurrentGroup(g); go('notes'); },
          go: (v) => go(v),
        }} />}
        {view === 'more' && (
          <div className="more">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="sec">{s.title}</h2>
                <div className="card list">
                  {s.items.map(([v, l, h]) => (
                    <button key={v} className="li" onClick={() => go(v)}>
                      <span><b>{l}</b><span className="mute">{h}</span></span>
                      <Icon name="chev" size={18} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {view === 'new' && <NewSubject subjects={subjects ?? []} onDone={(id) => { if (id) { setSid(id); go('config'); } else go('more'); }} />}
        {view === 'conn' && <Settings />}
        {view === 'cal' && <SchoolCalendar />}
        {subject && view === 'notes' && <Notebook key={subject.id + (focusAct ?? '')} subject={subject} focusAct={focusAct} onProgress={() => go('seg')} />}
        {subject && view === 'att' && <Attendance key={subject.id + JSON.stringify(attPreset ?? '')} subject={subject} preset={attPreset} />}
        {subject && view === 'seg' && <Progress key={subject.id} subject={subject} />}
        {subject && view === 'comm' && <Comms key={subject.id} subject={subject} />}
        {subject && view === 'rep' && <Reports key={subject.id} subject={subject} />}
        {subject && view === 'groups' && <Groups key={subject.id} subject={subject} />}
        {subject && view === 'plan' && <Planner key={subject.id} subject={subject} onProgress={() => go('seg')} />}
        {subject && view === 'curr' && <Curriculum key={subject.id} subject={subject} />}
        {subject && view === 'config' && <Config key={subject.id} subject={subject} />}
      </main>

      <nav className="bnav noprint" aria-label="Secciones">
        {[...MAIN, ['more', 'Más', 'more'] as [View, string, IconName]].map(([v, l, i]) => (
          <button key={v} aria-current={section === v ? 'page' : undefined} onClick={() => go(v)}><Icon name={i} size={22} />{l}</button>
        ))}
      </nav>
    </div>
  );
}
