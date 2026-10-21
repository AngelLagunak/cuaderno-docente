import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/** Botón «⋯» con las acciones menos frecuentes. Se cierra al elegir, al pulsar fuera o con Escape. */
export function Menu({ items, label = 'Más acciones' }: { items: [string, () => void, boolean?][]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="small icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="more" /></button>
      {open && (
        <div role="menu" className="menupop">
          {items.map(([l, f, disabled]) => <button key={l} role="menuitem" disabled={disabled} onClick={() => { setOpen(false); f(); }}>{l}</button>)}
        </div>
      )}
    </div>
  );
}
