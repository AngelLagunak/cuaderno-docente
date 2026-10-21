import { useState } from 'react';
import { db, uid } from '../data/db';
import { copyStructure, newSubject } from '../core/subjects';
import type { Template } from '../core/subjects';
import type { Subject } from '../core/model';

const KINDS: [Subject['kind'], string][] = [['bach', 'Bachillerato'], ['eso', 'ESO'], ['fp', 'Formación Profesional / Artes Plásticas'], ['otra', 'Otra']];

/** Crear una asignatura: plantilla LOMLOE, FP, copia de otra asignatura o vacía. El currículo se carga después. */
export function NewSubject({ subjects, onDone }: { subjects: Subject[]; onDone: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [kind, setKind] = useState<Subject['kind']>('bach');
  const [tpl, setTpl] = useState<Template | 'copy'>('lomloe');
  const [from, setFrom] = useState(subjects[0]?.id ?? '');

  async function create() {
    const id = uid();
    const src = subjects.find((s) => s.id === from);
    const s = tpl === 'copy' && src ? { ...copyStructure(src, id, name.trim(), course.trim()), kind } : newSubject(id, name.trim(), course.trim(), kind, tpl === 'copy' ? 'empty' : tpl);
    await db.subjects.put(s);
    onDone(id);
  }
  return (
    <div className="card form">
      <b>Nueva asignatura</b>
      <input placeholder="Nombre (ej.: Dibujo Artístico I)" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Curso (ej.: 1.º Bachillerato de Artes)" value={course} onChange={(e) => setCourse(e.target.value)} />
      <select value={kind} onChange={(e) => setKind(e.target.value as Subject['kind'])}>
        {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label><input type="radio" style={{ width: 'auto' }} checked={tpl === 'lomloe'} onChange={() => setTpl('lomloe')} /> LOMLOE: competencias específicas, criterios, descriptores y saberes (nota = media de las competencias)</label>
      <label><input type="radio" style={{ width: 'auto' }} checked={tpl === 'fp'} onChange={() => setTpl('fp')} /> FP: resultados de aprendizaje y criterios de evaluación</label>
      {subjects.length > 0 && (
        <label><input type="radio" style={{ width: 'auto' }} checked={tpl === 'copy'} onChange={() => setTpl('copy')} /> Copiar instrumentos, evaluaciones y cálculo de
          {' '}<select value={from} onChange={(e) => { setFrom(e.target.value); setTpl('copy'); }}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      )}
      <label><input type="radio" style={{ width: 'auto' }} checked={tpl === 'empty'} onChange={() => setTpl('empty')} /> Vacía (la estructura se define en Configuración)</label>
      <p className="mute">Después: carga el currículo en Currículo → «Cargar con IA», revisa instrumentos y evaluaciones en Configuración y crea los grupos.</p>
      <div className="row">
        <button className="on" disabled={!name.trim()} onClick={create}>Crear</button>
        <button onClick={() => onDone()}>Cancelar</button>
      </div>
    </div>
  );
}
