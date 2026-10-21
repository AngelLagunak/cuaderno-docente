import { describe, expect, it } from 'vitest';
import { review } from './curriculum';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const count = (level: string) => pa.nodes.filter((x) => x.level === level).length;

describe('catálogo de Proyectos Artísticos', () => {
  it('tiene 5 CE, 15 criterios y 29 indicadores', () => {
    expect(count('ce')).toBe(5);
    expect(count('crit')).toBe(15);
    expect(count('ind')).toBe(29);
  });
  it('enlaza cada indicador con su criterio', () => {
    for (const n of pa.nodes.filter((x) => x.level === 'ind')) {
      const l = pa.links.filter((k) => k.relation === 'ind-crit' && k.fromId === n.id);
      expect(l.map((k) => k.toId)).toEqual([`pa-1bach/crit:${n.code.slice(0, 3)}`]);
    }
  });
  it('todos los enlaces apuntan a nodos existentes', () => {
    const ids = new Set(pa.nodes.map((x) => x.id));
    for (const l of pa.links) {
      expect(ids.has(l.fromId)).toBe(true);
      expect(ids.has(l.toId)).toBe(true);
    }
  });
  it('no genera avisos en el panel de revisión', () => {
    expect(review(pa.subject, pa.nodes, pa.links)).toEqual([]);
  });
});

describe('review', () => {
  it('avisa de un criterio sin competencia específica', () => {
    const links = pa.links.filter((l) => !(l.relation === 'crit-ce' && l.fromId === 'pa-1bach/crit:5.4'));
    const issues = review(pa.subject, pa.nodes, links);
    expect(issues.map((i) => i.nodeId)).toEqual(['pa-1bach/crit:5.4']);
  });
  it('ignora los enlaces borrados', () => {
    const links = pa.links.map((l) => (l.fromId === 'pa-1bach/ind:1.1.1' ? { ...l, deleted: true } : l));
    expect(review(pa.subject, pa.nodes, links).map((i) => i.nodeId)).toEqual(['pa-1bach/ind:1.1.1']);
  });
  it('Modelado y Maquetismo no tiene relaciones que revisar', () => {
    expect(review(mm.subject, mm.nodes, [])).toEqual([]);
  });
});
