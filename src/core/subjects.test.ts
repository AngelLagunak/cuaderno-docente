import { describe, expect, it } from 'vitest';
import { copyStructure, curriculumRecords, newSubject, parseCurriculum } from './subjects';
import { review } from './curriculum';
import { pa } from '../catalogs/pa';

const answer = `Aquí tienes el currículo:
\`\`\`json
{ "competencias": [
  { "codigo": "CE.DT.1", "texto": "Analizar formas.", "descriptores": ["CCL2", "STEM4"],
    "criterios": [ { "codigo": "1.1", "texto": "Describe formas." }, { "codigo": "1.2", "texto": "Compara formas." } ] },
  { "codigo": "CE.DT.2", "texto": "Representar.", "descriptores": ["STEM4", "XX9"], "criterios": [ { "codigo": "2.1", "texto": "Dibuja." } ] },
  { "codigo": "", "texto": "sin código" } ],
  "saberes": [ { "codigo": "A.1", "texto": "Geometría plana." } ],
  "descriptores": [ { "codigo": "XX9", "texto": "Descriptor de otra etapa." }, { "codigo": "CCL2", "texto": "texto de la IA" } ] }
\`\`\``;

describe('asignaturas nuevas', () => {
  it('plantilla LOMLOE: niveles, relaciones y nota por competencias', () => {
    const s = newSubject('x', 'Dibujo Técnico I', '1.º Bachillerato', 'bach', 'lomloe');
    expect(s.levels.map((l) => l.key)).toEqual(['ce', 'crit', 'desc', 'saber']);
    expect(s.config.gradeLevel).toBe('ce');
    expect(newSubject('y', 'Módulo', 'CFGM', 'fp', 'fp').levels.map((l) => l.key)).toEqual(['ra', 'crit']);
    expect(newSubject('z', 'Otra', '', 'otra', 'empty').levels).toEqual([]);
  });
  it('copia la estructura de otra asignatura con otro id', () => {
    const c = copyStructure(pa.subject, 'pa2', 'Proyectos (copia)', '1.º BA');
    expect(c).toMatchObject({ id: 'pa2', name: 'Proyectos (copia)', instruments: pa.subject.instruments, terms: pa.subject.terms });
    expect(c.levels).not.toBe(pa.subject.levels);
  });
  it('lee el currículo de la IA y crea elementos y vínculos sin duplicar', () => {
    const p = parseCurriculum(answer);
    expect(p.ces.map((c) => c.code)).toEqual(['CE.DT.1', 'CE.DT.2']);
    const s = newSubject('dt', 'Dibujo Técnico I', '1.º Bachillerato', 'bach', 'empty');
    const r = curriculumRecords(s, p, []);
    expect(r.subject.levels.map((l) => l.key)).toEqual(['ce', 'crit', 'desc', 'saber']);
    expect(r.nodes.map((n) => `${n.level}:${n.code}`)).toEqual(['ce:CE.DT.1', 'crit:1.1', 'crit:1.2', 'desc:CCL2', 'desc:STEM4', 'ce:CE.DT.2', 'crit:2.1', 'desc:XX9', 'saber:A.1']);
    expect(r.nodes.find((n) => n.code === 'CCL2')!.title).toMatch(/^Comprende, interpreta/); // Bachillerato: texto oficial
    expect(r.nodes.find((n) => n.code === 'XX9')).toMatchObject({ title: 'Descriptor de otra etapa.', group: 'XX' });
    expect(r.links).toHaveLength(3 + 2 + 2);
    expect(review(r.subject, r.nodes, r.links)).toEqual([]);
    const again = curriculumRecords(r.subject, p, r.nodes);
    expect(again.nodes).toEqual([]);
  });
  it('avisa si la respuesta no es un JSON con competencias', () => {
    expect(() => parseCurriculum('No lo encuentro')).toThrow(/JSON/);
    expect(() => parseCurriculum('{"a": 1}')).toThrow(/competencias/);
    expect(() => parseCurriculum('{"competencias": [}')).toThrow(/no es válido/);
  });
});
