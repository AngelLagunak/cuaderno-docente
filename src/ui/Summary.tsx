import type { Subject } from '../core/model';

export function Summary({ subject }: { subject: Subject }) {
  const c = subject.config;
  return (
    <div className="card">
      <b>{subject.course}</b>
      <p className="mute">
        Instrumentos: {subject.instruments.map((i) => `${i.name} ${i.weight} %`).join(' · ')}
      </p>
      {c.gradeLevel && (
        <p className="mute">
          Nota de cada evaluación: media de {subject.levels.find((l) => l.key === c.gradeLevel)?.plural.toLowerCase()} evaluadas. Los instrumentos ponderan las medidas de cada criterio.
        </p>
      )}
      <p className="mute">
        Evaluaciones: {subject.terms.map((t) => `${t.name} ${t.weight} %`).join(' · ')}
      </p>
      <p className="mute">
        Aprobado ≥ {c.passMark}. Final con {c.finalDecimals} decimales.
        {c.minPerInstrument ? (c.gradeLevel ? ' Aviso si alguna parte no llega al aprobado.' : ' Cada instrumento debe llegar al aprobado.') : ''}
        {c.latePenaltyPct ? ` Entrega tardía: −${c.latePenaltyPct} %.` : ''}
      </p>
    </div>
  );
}
