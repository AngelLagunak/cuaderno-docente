import { describe, expect, it } from 'vitest';
import { PD_SECTIONS, gradingText, parsePdTexts, pdBase, pdDocument, pdHtml, pdIssues, pdPrompt } from './pd';
import type { PdData } from './pd';
import type { LearningUnit } from './model';
import { pa } from '../catalogs/pa';
import { mm } from '../catalogs/mm';

const unit = (id: string, code: string, nodeIds: string[], termId = 't1'): LearningUnit => ({ id, subjectId: pa.subject.id, code, title: `Unidad ${code}`, termId, plannedSessions: 10, nodeIds, updatedAt: 0 });
const base = (p: Partial<PdData> = {}): PdData => ({ subject: pa.subject, nodes: pa.nodes, links: pa.links, units: [], activities: [], rubrics: [], sessions: [], ...p });

describe('programación didáctica', () => {
  it('tiene los 13 apartados de la orden (a–m)', () => {
    expect(PD_SECTIONS.map((s) => s.key).join('')).toBe('abcdefghijklm');
  });
  it('apartado a): cada competencia con sus criterios, concreciones y descriptores', () => {
    const html = pdHtml(base(), {});
    expect(html).toContain('CE.PA.1. Generar y perfeccionar ideas de proyecto');
    expect(html).toContain('<b>1.1</b>');
    expect(html).toContain('<b>1.1.1</b>');
    expect(html).toMatch(/Descriptores:<\/b> [A-Z]/);
  });
  it('avisa de lo que falta y deja de avisar cuando está', () => {
    const crit = pa.nodes.filter((n) => n.level === 'crit');
    const i0 = pdIssues(base(), {});
    expect(i0).toContain('Faltan las unidades didácticas (Planificar).');
    expect(i0.some((x) => x.startsWith('Apartado e)'))).toBe(true);
    const units = [unit('u1', 'UD1', crit.slice(0, 8).map((n) => n.id)), unit('u2', 'UD2', crit.slice(8).map((n) => n.id), 't2')];
    const texts = pdBase(pa.subject);
    const i1 = pdIssues(base({ units, planned: [30, 30, 30] }), { centre: 'EA', teacher: 'Yo', year: '2026/27', texts });
    expect(i1.filter((x) => !x.startsWith('Saberes'))).toEqual([]);
    const i2 = pdIssues(base({ units: units.slice(0, 1), planned: [5, 30, 30] }), { centre: 'EA', teacher: 'Yo', year: '2026/27', texts });
    expect(i2).toContain('Criterios en ninguna unidad: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4.');
    expect(i2).toContain('1.ª evaluación: las unidades piden 10 sesiones y solo hay 5 lectivas.');
  });
  it('apartado d): describe el cálculo real de la nota', () => {
    const t = gradingText(pa.subject).join(' ');
    expect(t).toContain('media de las competencias específicas');
    expect(t).toContain('Proyectos 45 %');
    expect(t).toContain('1.ª evaluación 30 %');
    expect(t).toContain('número entero');
    const m = gradingText(mm.subject).join(' ');
    expect(m).toContain('media ponderada de los instrumentos');
    expect(m).toContain('reducción del 30 %');
    expect(m).toContain('SS, AP, NT o SB');
  });
  it('escapa el texto y genera un documento descargable', () => {
    const doc = pdDocument(base(), { centre: 'A <b>&', texts: { h: 'Línea 1\nLínea 2' } });
    expect(doc).toContain('A &lt;b&gt;&amp;');
    expect(doc).toContain('<p>Línea 1</p><p>Línea 2</p>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
  });
  it('prompt y lectura de la respuesta de la IA', () => {
    const pr = pdPrompt(base({ units: [unit('u1', 'UD1', [])] }), {});
    expect(pr).toContain('CE.PA.1');
    expect(pr).toContain('UD1 Unidad UD1');
    expect(pr).toContain('"m":');
    expect(parsePdTexts('Aquí tienes:\n```json\n{ "e": "Inicial", "H": "Metodología", "z": "x" }\n```')).toEqual({ e: 'Inicial', h: 'Metodología' });
    expect(() => parsePdTexts('nada')).toThrow();
  });
});
