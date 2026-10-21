import { describe, expect, it } from 'vitest';
import { fillXls, readCfb, readXls, writeCfb } from './xls';
import { NOMBRES_LIBREOFFICE, SIGAD_LISTADO } from './fixtures/xls';

const files: Record<string, string> = { 'sigad-listado.xls': SIGAD_LISTADO, 'nombres-libreoffice.xls': NOMBRES_LIBREOFFICE };
const fixture = (n: string) => Uint8Array.from(atob(files[n]), (c) => c.charCodeAt(0));

describe('xls (Excel 97-2003)', () => {
  it('lee el listado de SIGAD', () => {
    const [s, ...rest] = readXls(fixture('sigad-listado.xls'));
    expect(rest).toEqual([]);
    expect(s.name).toBe('Listado');
    expect(s.rows[0]).toEqual(['Apellido1', 'Apellido2', 'Nombre', 'Calificación']);
    expect(s.rows[1]).toEqual([1, 1, 1, null]);
    expect(s.rows).toHaveLength(16);
  });
  it('lee cadenas con tildes y celdas que faltan', () => {
    const [s] = readXls(fixture('nombres-libreoffice.xls'));
    expect(s.rows.slice(1)).toEqual([
      ['Prueba', 'García', 'Ana', null],
      ['Suspenso', 'Íñiguez', 'Luis Ángel', null],
      ['de la Fuente', 'Martín', 'María José', null],
    ]);
  });
  it('rellena la calificación sin tocar el resto (celdas en blanco con formato)', () => {
    const src = fixture('sigad-listado.xls');
    const out = fillXls(src, 0, [{ row: 1, col: 3, value: 7 }, { row: 2, col: 3, value: 4 }, { row: 3, col: 3, value: null }]);
    const [s] = readXls(out);
    expect(s.rows[0]).toEqual(['Apellido1', 'Apellido2', 'Nombre', 'Calificación']);
    expect(s.rows.slice(1, 5)).toEqual([[1, 1, 1, 7], [2, 2, 2, 4], [3, 3, 3, null], [4, 4, 4, null]]);
    // Se conservan los demás flujos del archivo
    expect([...readCfb(out).keys()].sort()).toEqual([...readCfb(src).keys()].sort());
  });
  it('añade celdas que no existían', () => {
    const out = fillXls(fixture('nombres-libreoffice.xls'), 0, [{ row: 2, col: 3, value: 9 }, { row: 3, col: 3, value: 5.5 }]);
    const [s] = readXls(out);
    expect(s.rows.slice(1).map((r) => r[3])).toEqual([null, 9, 5.5]);
    expect(s.rows[2][2]).toBe('Luis Ángel');
  });
  it('archivo compuesto con flujos grandes y pequeños', () => {
    const big = new Uint8Array(70000).map((_, i) => i % 251), small = new Uint8Array([1, 2, 3]);
    const f = readCfb(writeCfb([['Workbook', big], ['\u0005SummaryInformation', small], ['Vacío', new Uint8Array(0)]]));
    expect(f.get('Workbook')).toEqual(big);
    expect(f.get('\u0005SummaryInformation')).toEqual(small);
    expect(f.get('Vacío')).toEqual(new Uint8Array(0));
  });
  it('rechaza archivos que no son .xls', () => {
    expect(() => readXls(new TextEncoder().encode('Apellido1;Nombre'))).toThrow(/Excel 97-2003/);
  });
});
