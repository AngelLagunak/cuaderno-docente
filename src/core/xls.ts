/**
 * Lectura y relleno de hojas Excel 97-2003 (.xls, BIFF8 dentro de un archivo compuesto OLE), lo justo para el
 * listado de calificaciones de SIGAD: se lee la tabla y se escriben números en celdas concretas conservando el resto
 * del archivo tal cual (formatos, anchos, otras hojas).
 */

export type XCell = string | number | boolean | null;
export interface XSheet { name: string; rows: XCell[][] }

const END = 0xfffffffe, FREE = 0xffffffff, FATSECT = 0xfffffffd, NOSTREAM = 0xffffffff;

// ---------- Archivo compuesto (CFB) ----------

export function readCfb(buf: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0xe011cfd0 || v.getUint32(4, true) !== 0xe11ab1a1) throw new Error('No es un archivo .xls de Excel 97-2003.');
  const ss = 1 << v.getUint16(30, true), ms = 1 << v.getUint16(32, true);
  const cutoff = v.getUint32(56, true);
  const sector = (id: number) => buf.subarray((id + 1) * ss, (id + 2) * ss);
  const fatIds: number[] = [];
  for (let i = 0; i < 109; i++) { const x = v.getUint32(76 + i * 4, true); if (x < FATSECT) fatIds.push(x); }
  for (let d = v.getUint32(68, true), n = 0; d < FATSECT && n < 10000; n++) {
    const s = new DataView(buf.buffer, buf.byteOffset + (d + 1) * ss, ss);
    for (let i = 0; i < ss / 4 - 1; i++) { const x = s.getUint32(i * 4, true); if (x < FATSECT) fatIds.push(x); }
    d = s.getUint32(ss - 4, true);
  }
  const fat: number[] = [];
  for (const id of fatIds) { const s = new DataView(buf.buffer, buf.byteOffset + (id + 1) * ss, ss); for (let i = 0; i < ss / 4; i++) fat.push(s.getUint32(i * 4, true)); }
  const chain = (start: number, next: number[], max: number) => {
    const out: number[] = [];
    for (let x = start; x < FATSECT && out.length < max; x = next[x] ?? END) out.push(x);
    return out;
  };
  const concat = (parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const readChain = (start: number) => concat(chain(start, fat, fat.length).map(sector));
  const dir = readChain(v.getUint32(48, true));
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = dv.getUint16(o + 64, true);
    let name = '';
    for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(dv.getUint16(o + i * 2, true));
    entries.push({ name, type: dir[o + 66], start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const mini = root ? readChain(root.start) : new Uint8Array(0);
  const mfStart = v.getUint32(60, true);
  const mfBytes = mfStart < FATSECT ? readChain(mfStart) : new Uint8Array(0);
  const mfv = new DataView(mfBytes.buffer, mfBytes.byteOffset, mfBytes.byteLength);
  const minifat: number[] = [];
  for (let i = 0; i + 4 <= mfBytes.length; i += 4) minifat.push(mfv.getUint32(i, true));
  const out = new Map<string, Uint8Array>();
  for (const e of entries) {
    if (e.type !== 2) continue;
    const data = e.size < cutoff
      ? concat(chain(e.start, minifat, minifat.length).map((id) => mini.subarray(id * ms, (id + 1) * ms)))
      : readChain(e.start);
    out.set(e.name, data.slice(0, e.size));
  }
  return out;
}

/** Archivo compuesto v3 (sectores de 512 bytes) con los flujos dados en la raíz. */
export function writeCfb(streams: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
  const SS = 512, MS = 64, CUT = 4096;
  const big = streams.filter(([, d]) => d.length >= CUT), small = streams.filter(([, d]) => d.length < CUT);
  const ceil = (a: number, b: number) => Math.ceil(a / b);
  const miniSecs = small.map(([, d]) => ceil(d.length, MS));
  const miniTotal = miniSecs.reduce((s, n) => s + n, 0);
  const miniContainer = ceil(miniTotal * MS, SS);
  const miniFatSecs = ceil(miniTotal * 4, SS);
  const dirSecs = ceil((streams.length + 1) * 128, SS);
  const bigSecs = big.map(([, d]) => ceil(d.length, SS));
  const data = bigSecs.reduce((s, n) => s + n, 0) + miniContainer + miniFatSecs + dirSecs;
  let fatSecs = 1;
  while (ceil((data + fatSecs) * 4, SS) > fatSecs) fatSecs++;
  if (fatSecs > 109) throw new Error('Archivo demasiado grande.');
  const total = data + fatSecs;
  const out = new Uint8Array((total + 1) * SS);
  const v = new DataView(out.buffer);
  const fat = new Array<number>(fatSecs * (SS / 4)).fill(FREE);
  let next = 0;
  const alloc = (n: number) => { const s = next; for (let i = 0; i < n; i++) fat[s + i] = i === n - 1 ? END : s + i + 1; next += n; return n ? s : END; };
  const put = (sec: number, bytes: Uint8Array) => out.set(bytes, (sec + 1) * SS);

  const starts = new Map<string, number>();
  big.forEach(([name, d], i) => { const s = alloc(bigSecs[i]); starts.set(name, s); put(s, d); });
  const miniStream = new Uint8Array(miniContainer * SS);
  const minifat = new Array<number>(miniFatSecs * (SS / 4)).fill(FREE);
  let m = 0;
  small.forEach(([name, d], i) => {
    const n = miniSecs[i];
    starts.set(name, n ? m : END);
    for (let k = 0; k < n; k++) minifat[m + k] = k === n - 1 ? END : m + k + 1;
    miniStream.set(d, m * MS);
    m += n;
  });
  const rootStart = alloc(miniContainer);
  if (miniContainer) put(rootStart, miniStream);
  const mfStart = alloc(miniFatSecs);
  if (miniFatSecs) { const b = new Uint8Array(miniFatSecs * SS); const bv = new DataView(b.buffer); minifat.forEach((x, i) => bv.setUint32(i * 4, x, true)); put(mfStart, b); }
  const dirStart = alloc(dirSecs);
  const fatStart = next;
  for (let i = 0; i < fatSecs; i++) fat[fatStart + i] = FATSECT;

  // Directorio: raíz + flujos encadenados como hermanos derechos, en el orden que exige el formato.
  const dir = new Uint8Array(dirSecs * SS);
  const dv = new DataView(dir.buffer);
  const cmp = (a: string, b: string) => a.length - b.length || (a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0);
  const sorted = [...streams].sort((a, b) => cmp(a[0], b[0]));
  const entry = (i: number, name: string, type: number, child: number, right: number, start: number, size: number) => {
    const o = i * 128;
    for (let k = 0; k < name.length; k++) dv.setUint16(o + k * 2, name.charCodeAt(k), true);
    dv.setUint16(o + 64, (name.length + 1) * 2, true);
    dir[o + 66] = type; dir[o + 67] = 1;
    dv.setUint32(o + 68, NOSTREAM, true); dv.setUint32(o + 72, right, true); dv.setUint32(o + 76, child, true);
    dv.setUint32(o + 116, start, true); dv.setUint32(o + 120, size, true);
  };
  entry(0, 'Root Entry', 5, sorted.length ? 1 : NOSTREAM, NOSTREAM, miniContainer ? rootStart : END, miniTotal * MS);
  sorted.forEach(([name, d], i) => entry(i + 1, name, 2, NOSTREAM, i + 1 < sorted.length ? i + 2 : NOSTREAM, starts.get(name)!, d.length));
  for (let i = sorted.length + 1; i < dirSecs * 4; i++) { dv.setUint32(i * 128 + 68, NOSTREAM, true); dv.setUint32(i * 128 + 72, NOSTREAM, true); dv.setUint32(i * 128 + 76, NOSTREAM, true); }
  put(dirStart, dir);
  const fb = new Uint8Array(fatSecs * SS); const fv = new DataView(fb.buffer);
  fat.forEach((x, i) => fv.setUint32(i * 4, x, true));
  put(fatStart, fb);

  // Cabecera
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (out[i] = b));
  v.setUint16(24, 0x3e, true); v.setUint16(26, 3, true); v.setUint16(28, 0xfffe, true);
  v.setUint16(30, 9, true); v.setUint16(32, 6, true);
  v.setUint32(44, fatSecs, true); v.setUint32(48, dirStart, true); v.setUint32(56, CUT, true);
  v.setUint32(60, miniFatSecs ? mfStart : END, true); v.setUint32(64, miniFatSecs, true);
  v.setUint32(68, END, true); v.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) v.setUint32(76 + i * 4, i < fatSecs ? fatStart + i : FREE, true);
  return out;
}

// ---------- Registros BIFF8 ----------

interface Rec { sid: number; data: Uint8Array }
const R = { BOF: 0x809, EOF: 0x0a, BOUNDSHEET: 0x85, SST: 0xfc, CONTINUE: 0x3c, LABELSST: 0xfd, LABEL: 0x204, NUMBER: 0x203, RK: 0x27e, MULRK: 0xbd, BLANK: 0x201, MULBLANK: 0xbe, BOOLERR: 0x205, FORMULA: 0x06, STRING: 0x207, INDEX: 0x20b, DBCELL: 0xd7, DIMENSIONS: 0x200, ROW: 0x208 };
const CELL = new Set([R.LABELSST, R.LABEL, R.NUMBER, R.RK, R.MULRK, R.BLANK, R.MULBLANK, R.BOOLERR, R.FORMULA]);

function records(s: Uint8Array): Rec[] {
  const out: Rec[] = [];
  const v = new DataView(s.buffer, s.byteOffset, s.byteLength);
  for (let i = 0; i + 4 <= s.length;) {
    const sid = v.getUint16(i, true), len = v.getUint16(i + 2, true);
    out.push({ sid, data: s.subarray(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}
const dvOf = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);

function rk(x: number) {
  let n: number;
  if (x & 2) n = x >> 2;
  else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, x & 0xfffffffc, true); n = b.getFloat64(0, true); }
  return x & 1 ? n / 100 : n;
}

/** Cadenas compartidas (SST), que pueden seguir en registros CONTINUE. */
function sst(parts: Uint8Array[]): string[] {
  let si = 0, pos = 8;
  const more = () => { while (si < parts.length && pos >= parts[si].length) { si++; pos = 0; } return si < parts.length; };
  const u8 = () => { more(); return parts[si]?.[pos++] ?? 0; };
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() + u16() * 65536);
  const skip = (n: number) => { for (let i = 0; i < n; i++) u8(); };
  const count = parts[0].length >= 8 ? dvOf(parts[0]).getUint32(4, true) : 0;
  const out: string[] = [];
  for (let k = 0; k < count && more(); k++) {
    let n = u16();
    const f = u8();
    let high = f & 1;
    const runs = f & 8 ? u16() : 0, ext = f & 4 ? u32() : 0;
    let s = '';
    while (n > 0) {
      if (pos >= parts[si].length) { si++; pos = 0; if (si >= parts.length) break; high = parts[si][pos++] & 1; }
      s += String.fromCharCode(high ? parts[si][pos] | (parts[si][pos + 1] << 8) : parts[si][pos]);
      pos += high ? 2 : 1; n--;
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

function str16(d: Uint8Array, o: number): string {
  const v = dvOf(d), n = v.getUint16(o, true), high = d[o + 2] & 1;
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(high ? v.getUint16(o + 3 + i * 2, true) : d[o + 3 + i]);
  return s;
}

interface Book { stream: Uint8Array; recs: Rec[]; sheets: { name: string; bof: number; eof: number }[]; strings: string[]; other: [string, Uint8Array][] }

function openBook(buf: Uint8Array): Book {
  const files = readCfb(buf);
  const name = files.has('Workbook') ? 'Workbook' : files.has('Book') ? 'Book' : '';
  if (!name) throw new Error('El archivo no contiene una hoja de cálculo.');
  const stream = files.get(name)!;
  const recs = records(stream);
  const bofAt = new Map<number, number>();
  for (let i = 0, off = 0; i < recs.length; off += 4 + recs[i].data.length, i++) if (recs[i].sid === R.BOF) bofAt.set(off, i);
  const sheets: Book['sheets'] = [];
  let strings: string[] = [];
  const firstEof = recs.findIndex((r) => r.sid === R.EOF);
  for (let i = 0; i < firstEof; i++) {
    const r = recs[i];
    if (r.sid === R.BOUNDSHEET) {
      const bof = bofAt.get(dvOf(r.data).getUint32(0, true));
      if (bof == null || r.data[5] !== 0) continue; // solo hojas de cálculo
      let eof = bof + 1;
      while (eof < recs.length && recs[eof].sid !== R.EOF) eof++;
      sheets.push({ name: str8(r.data, 6), bof, eof });
    } else if (r.sid === R.SST) {
      const parts = [r.data];
      for (let j = i + 1; recs[j]?.sid === R.CONTINUE; j++) parts.push(recs[j].data);
      strings = sst(parts);
    }
  }
  return { stream, recs, sheets, strings, other: [...files].filter(([k]) => k !== name) };
}

/** Nombre corto (BOUNDSHEET): longitud de 1 byte + marca + caracteres. */
function str8(d: Uint8Array, o: number) {
  const n = d[o], high = d[o + 1] & 1;
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(high ? d[o + 2 + i * 2] | (d[o + 3 + i * 2] << 8) : d[o + 2 + i]);
  return s;
}

/** Lee todas las hojas como tablas (fila × columna). */
export function readXls(buf: Uint8Array): XSheet[] {
  const b = openBook(buf);
  return b.sheets.map((sh) => {
    const rows: XCell[][] = [];
    const set = (r: number, c: number, x: XCell) => { (rows[r] ??= [])[c] = x; };
    for (let i = sh.bof + 1; i < sh.eof; i++) {
      const { sid, data: d } = b.recs[i];
      if (!CELL.has(sid)) continue;
      const v = dvOf(d), r = v.getUint16(0, true), c = v.getUint16(2, true);
      if (sid === R.LABELSST) set(r, c, b.strings[v.getUint32(6, true)] ?? '');
      else if (sid === R.LABEL) set(r, c, str16(d, 6));
      else if (sid === R.NUMBER) set(r, c, v.getFloat64(6, true));
      else if (sid === R.RK) set(r, c, rk(v.getUint32(6, true)));
      else if (sid === R.MULRK) for (let k = 0, o = 4; o + 6 <= d.length - 2; k++, o += 6) set(r, c + k, rk(v.getUint32(o + 2, true)));
      else if (sid === R.BOOLERR) set(r, c, d[7] ? null : !!d[6]);
      else if (sid === R.FORMULA) {
        if (v.getUint16(12, true) !== 0xffff) set(r, c, v.getFloat64(6, true));
        else if (d[6] === 0 && b.recs[i + 1]?.sid === R.STRING) set(r, c, str16(b.recs[i + 1].data, 0));
      }
    }
    const width = Math.max(0, ...rows.map((r) => r?.length ?? 0));
    return { name: sh.name, rows: Array.from(rows, (r) => Array.from({ length: width }, (_, c) => r?.[c] ?? null)) };
  });
}

const rec = (sid: number, data: Uint8Array): Rec => ({ sid, data });
function numberRec(r: number, c: number, xf: number, x: number) {
  const d = new Uint8Array(14), v = dvOf(d);
  v.setUint16(0, r, true); v.setUint16(2, c, true); v.setUint16(4, xf, true); v.setFloat64(6, x, true);
  return rec(R.NUMBER, d);
}
function blankRec(r: number, c: number, xf: number) {
  const d = new Uint8Array(6), v = dvOf(d);
  v.setUint16(0, r, true); v.setUint16(2, c, true); v.setUint16(4, xf, true);
  return rec(R.BLANK, d);
}
function rkRec(r: number, c: number, xf: number, x: number) {
  const d = new Uint8Array(10), v = dvOf(d);
  v.setUint16(0, r, true); v.setUint16(2, c, true); v.setUint16(4, xf, true); v.setUint32(6, x, true);
  return rec(R.RK, d);
}

/**
 * Copia del libro con números escritos en celdas de una hoja (fila y columna desde 0). `null` deja la celda vacía.
 * El resto del archivo no cambia.
 */
export function fillXls(buf: Uint8Array, sheet: number, values: { row: number; col: number; value: number | null }[]): Uint8Array<ArrayBuffer> {
  const b = openBook(buf);
  const sh = b.sheets[sheet];
  if (!sh) throw new Error('Hoja no encontrada.');
  const want = new Map(values.map((x) => [`${x.row},${x.col}`, x.value]));
  const done = new Set<string>();
  const cell = (r: number, c: number, xf: number, orig: Rec[]): Rec[] => {
    const k = `${r},${c}`;
    if (!want.has(k)) return orig;
    done.add(k);
    const x = want.get(k)!;
    return [x == null ? blankRec(r, c, xf) : numberRec(r, c, xf, x)];
  };
  const out: Rec[] = [];
  const keep = new Set<number>(); // índices originales de BOF, para recolocar las posiciones de las hojas
  const newIndex = new Map<number, number>();
  let lastCell = -1, lastRow = -1, xfDefault = 15;
  for (let i = 0; i < b.recs.length; i++) {
    const r0 = b.recs[i];
    const inSheet = i > sh.bof && i < sh.eof;
    if (r0.sid === R.BOF) { keep.add(i); newIndex.set(i, out.length); }
    if (inSheet && (r0.sid === R.INDEX || r0.sid === R.DBCELL)) continue; // índices de posiciones: se quedarían desfasados
    if (!inSheet || !CELL.has(r0.sid)) {
      if (inSheet && r0.sid === R.STRING && b.recs[i - 1]?.sid === R.FORMULA && out[out.length - 1]?.sid !== R.FORMULA) continue;
      if (inSheet && r0.sid === R.ROW) lastRow = out.length;
      out.push(r0);
      continue;
    }
    const v = dvOf(r0.data), r = v.getUint16(0, true), c = v.getUint16(2, true);
    if (r0.sid === R.MULBLANK || r0.sid === R.MULRK) {
      const step = r0.sid === R.MULBLANK ? 2 : 6;
      const last = v.getUint16(r0.data.length - 2, true);
      const hit = [...want.keys()].some((k) => { const [wr, wc] = k.split(',').map(Number); return wr === r && wc >= c && wc <= last; });
      if (!hit) out.push(r0);
      else for (let k = 0; c + k <= last; k++) {
        const xf = v.getUint16(4 + k * step, true);
        const orig = r0.sid === R.MULBLANK ? blankRec(r, c + k, xf) : rkRec(r, c + k, xf, v.getUint32(6 + k * step, true));
        out.push(...cell(r, c + k, xf, [orig]));
      }
    } else out.push(...cell(r, c, v.getUint16(4, true), [r0]));
    xfDefault = v.getUint16(4, true);
    lastCell = out.length;
  }
  // Celdas que no existían: al final de las celdas de la hoja (el orden por filas no es obligatorio para leerlas).
  const missing = values.filter((x) => !done.has(`${x.row},${x.col}`) && x.value != null);
  if (missing.length) {
    const at = lastCell >= 0 ? lastCell : lastRow + 1;
    out.splice(at, 0, ...missing.map((x) => numberRec(x.row, x.col, xfDefault, x.value!)));
    for (const [i, j] of newIndex) if (j >= at) newIndex.set(i, j + missing.length);
    const dim = out.findIndex((x, j) => x.sid === R.DIMENSIONS && j > newIndex.get(sh.bof)!);
    if (dim >= 0) {
      const d = out[dim].data.slice(), v = dvOf(d);
      v.setUint32(0, Math.min(v.getUint32(0, true), ...missing.map((x) => x.row)), true);
      v.setUint32(4, Math.max(v.getUint32(4, true), ...missing.map((x) => x.row + 1)), true);
      v.setUint16(8, Math.min(v.getUint16(8, true), ...missing.map((x) => x.col)), true);
      v.setUint16(10, Math.max(v.getUint16(10, true), ...missing.map((x) => x.col + 1)), true);
      out[dim] = rec(R.DIMENSIONS, d);
    }
  }
  // Posiciones de las hojas (BOUNDSHEET) en el nuevo flujo.
  const offsets: number[] = [];
  for (let i = 0, off = 0; i < out.length; off += 4 + out[i].data.length, i++) offsets.push(off);
  const origOff = new Map<number, number>();
  for (let i = 0, off = 0; i < b.recs.length; off += 4 + b.recs[i].data.length, i++) if (keep.has(i)) origOff.set(off, i);
  for (let i = 0; i < out.length && out[i].sid !== R.EOF; i++) {
    if (out[i].sid !== R.BOUNDSHEET) continue;
    const d = out[i].data.slice(), v = dvOf(d);
    const oi = origOff.get(v.getUint32(0, true));
    if (oi == null) continue;
    v.setUint32(0, offsets[newIndex.get(oi)!], true);
    out[i] = rec(R.BOUNDSHEET, d);
  }
  const size = out.reduce((s, r) => s + 4 + r.data.length, 0);
  const stream = new Uint8Array(size), sv = dvOf(stream);
  for (let i = 0, off = 0; i < out.length; i++) {
    sv.setUint16(off, out[i].sid, true); sv.setUint16(off + 2, out[i].data.length, true);
    stream.set(out[i].data, off + 4);
    off += 4 + out[i].data.length;
  }
  return writeCfb([['Workbook', stream], ...b.other]);
}
