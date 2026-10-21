import { describe, expect, it } from 'vitest';
import { criteriaText, criterionLevel } from './report';
import { migrateSubject } from './curriculum';
import type { Profile } from './evaluation';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const prof = (vals: Record<string, number | null>): Profile => ({ nodes: new Map(Object.entries(vals)), groups: new Map() });

describe('criteriaText ({{criterio}})', () => {
  const p = prof({ 'pa-1bach/crit:1.1': 7.25, 'pa-1bach/crit:3.2': 4, 'pa-1bach/crit:5.4': null, 'pa-1bach/ind:1.1.1': 9, 'pa-1bach/ce:CE.PA.1': 6 });
  it('lista los criterios evaluados con su nota, sin concreciones ni CE', () => {
    const t = criteriaText(pa.subject, pa.nodes, p);
    expect(t.split('\n')).toHaveLength(2);
    expect(t).toMatch(/^- 1\.1 Generar y perfeccionar ideas de proyecto.*…: 7,3$/m);
    expect(t).toMatch(/^- 3\.2 Explicar.*: 4,0$/m);
  });
  it('{{criterios_pendientes}} solo incluye los suspensos', () => {
    expect(criteriaText(pa.subject, pa.nodes, p, true)).toMatch(/^- 3\.2 .*: 4,0$/);
    expect(criteriaText(pa.subject, pa.nodes, prof({ 'pa-1bach/crit:1.1': 8 }), true)).toBe('(ninguno)');
  });
  it('avisa cuando no hay nada evaluado', () => {
    expect(criteriaText(pa.subject, pa.nodes, prof({}))).toBe('(sin criterios evaluados)');
  });
  it('en Modelado y Maquetismo usa los aspectos evaluables', () => {
    expect(criterionLevel(mm.subject)).toBe('aspecto');
    expect(criteriaText(mm.subject, mm.nodes, prof({ 'mm-2joy/aspecto:UD1.1': 6 }))).toMatch(/^- UD1\.1 Selecciona/);
  });
});

describe('migrateSubject', () => {
  it('renombra «Indicador» a «Concreción» en materias ya guardadas', () => {
    const old = { ...pa.subject, levels: pa.subject.levels.map((l) => (l.key === 'ind' ? { ...l, label: 'Indicador', plural: 'Indicadores' } : l)) };
    const m = migrateSubject(old)!;
    expect(m.levels.find((l) => l.key === 'ind')).toMatchObject({ label: 'Concreción', plural: 'Concreciones', graded: true });
  });
  it('no toca materias ya renombradas o con nombres propios', () => {
    expect(migrateSubject(pa.subject)).toBeNull();
    const custom = { ...pa.subject, levels: pa.subject.levels.map((l) => (l.key === 'ind' ? { ...l, label: 'Subcriterio' } : l)) };
    expect(migrateSubject(custom)).toBeNull();
    expect(migrateSubject(mm.subject)).toBeNull();
  });
});
