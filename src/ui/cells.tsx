import { useState } from 'react';
import type { Num } from '../core/evaluation';
import type { Grade } from '../core/model';

export const fmt = (v: Num, d: number) => (v == null ? '—' : v.toFixed(d).replace('.', ','));
export const raw = (v: Num | undefined) => (v == null ? '' : String(v).replace('.', ','));
/** Nota escrita a mano: null si está vacía, undefined si no es válida (0–10). */
export const parse = (t: string): Num | undefined => {
  const s = t.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined;
};

/** Casilla de nota: se guarda al salir o con Intro. `stamp` refresca el valor cuando cambia fuera. */
export function Cell({ value, stamp, label, onSave }: { value: Num | undefined; stamp?: number; label: string; onSave: (v: number | null) => void }) {
  const [bad, setBad] = useState(false);
  return (
    <input
      className={'cell' + (bad ? ' bad' : '')}
      inputMode="decimal"
      defaultValue={raw(value)}
      key={stamp ?? 0}
      aria-label={label}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={(e) => {
        const v = parse(e.target.value);
        if (v === undefined) { setBad(true); e.target.value = raw(value); return; }
        setBad(false);
        if (v !== (value ?? null)) onSave(v);
      }}
    />
  );
}

/** Marca de recuperación: la nota que cuenta es la nueva; se guarda la anterior. */
export function RecMark({ g, d = 1 }: { g?: Grade; d?: number }) {
  if (!g?.recoveredAt) return null;
  return <span className="recm" title={`Recuperada el ${g.recoveredAt}. Antes: ${fmt(g.prev ?? null, d)}`}>R</span>;
}
