// Iconos de trazo (24×24), heredan el color del texto.
const P = { home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18', cal: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01', check: 'M20 6 9 17l-5-5', back: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M16 11l2 2 4-4',
  chev: 'm9 18 6-6-6-6', left: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', chart: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7' } as const;
export type IconName = keyof typeof P;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name]} />
    </svg>
  );
}
