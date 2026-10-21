import { describe, expect, it } from 'vitest';
import { copyStructure, curriculumRecords, newSubject, objectivesRecords, parseCurriculum, parseObjectives } from './subjects';
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

describe('objetivos de etapa', () => {
  it('lee la lista pegada y añade nivel, relación y objetivos sin duplicar', () => {
    const items = parseObjectives('```\n**a)** Ejercer la ciudadanía democrática,\ndesde una perspectiva global.\nb) Consolidar una madurez personal.\n- ñ) Fomentar una actitud responsable.\n# Fuente: BOA\n```');
    expect(items).toEqual([
      { code: 'a', text: 'Ejercer la ciudadanía democrática, desde una perspectiva global.' },
      { code: 'b', text: 'Consolidar una madurez personal.' },
      { code: 'ñ', text: 'Fomentar una actitud responsable.' },
    ]);
    const r = objectivesRecords(pa.subject, items, pa.nodes);
    expect(r.subject.levels[r.subject.levels.length - 1]).toMatchObject({ key: 'obj', plural: 'Objetivos de etapa' });
    expect(r.subject.relations[r.subject.relations.length - 1]).toMatchObject({ key: 'ce-obj', from: 'ce', to: 'obj' });
    expect(r.nodes.map((n) => n.id)).toEqual(['pa-1bach/obj:a', 'pa-1bach/obj:b', 'pa-1bach/obj:ñ']);
    const again = objectivesRecords(r.subject, items, [...pa.nodes, ...r.nodes]);
    expect(again.nodes).toEqual([]);
    expect(again.subject.relations).toHaveLength(r.subject.relations.length);
  });
});
