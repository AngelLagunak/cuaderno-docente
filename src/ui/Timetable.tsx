import type { Group } from '../core/model';

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
type TT = NonNullable<Group['timetable']>;

/** Horario semanal: una casilla por día y hora de clase con el grupo. */
export function TimetableGrid({ value, onChange }: { value: TT; onChange: (tt: TT) => void }) {
  const has = (wd: number, slot: string) => value.some((t) => t.weekday === wd && t.slot === slot);
  const toggle = (wd: number, slot: string) => onChange(has(wd, slot) ? value.filter((t) => !(t.weekday === wd && t.slot === slot)) : [...value, { weekday: wd, slot }]);
  return (
    <div className="tw">
      <table className="t">
        <thead><tr><th>Hora</th>{DAYS.map((d) => <th key={d}>{d.slice(0, 3)}</th>)}</tr></thead>
        <tbody>
          {['1', '2', '3', '4', '5', '6', '7'].map((h) => (
            <tr key={h}><td>{h}.ª</td>{DAYS.map((_, i) => (
              <td key={i}><input type="checkbox" aria-label={`${DAYS[i]} ${h}.ª hora`} style={{ width: 'auto' }} checked={has(i + 1, h)} onChange={() => toggle(i + 1, h)} /></td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
