/** Decoders for the classic game's data formats (derived from static analysis). */

export interface Palette {
  /** 256 RGB triples. */
  rgb: Uint8Array;
}

export interface Bitmap {
  width: number;
  height: number;
  /** Palette indices, top-down. */
  pixels: Uint8Array;
  palette?: Palette;
}

export interface Sprite {
  width: number;
  height: number;
  /** Palette indices, top-down. Index 0 is drawn as transparent. */
  pixels: Uint8Array;
  /** Per-sprite byte whose meaning is not established. */
  flag: number;
  /** Per-sprite 32-bit field whose meaning is not established. */
  extra: number;
}

export const BOARD_COLUMNS = 20;
export const BOARD_ROWS = 20;
export const BOARD_COUNT = 50;

export function decodePcx(b: Uint8Array): Bitmap {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 128 + 769 || b[0] !== 10 || b[2] !== 1 || b[3] !== 8 || b[65] !== 1) {
    throw new Error("unsupported PCX (need 8-bit, 1 plane, RLE)");
  }
  const width = dv.getUint16(8, true) - dv.getUint16(4, true) + 1;
  const height = dv.getUint16(10, true) - dv.getUint16(6, true) + 1;
  const bytesPerLine = dv.getUint16(66, true);
  if (width <= 0 || height <= 0 || bytesPerLine < width) throw new Error("bad PCX dimensions");
  const lines = new Uint8Array(bytesPerLine * height);
  let i = 128;
  let o = 0;
  while (o < lines.length && i < b.length) {
    let v = b[i++]!;
    let n = 1;
    if (v >= 0xc0) {
      n = v - 0xc0;
      v = b[i++]!;
    }
    while (n-- > 0 && o < lines.length) lines[o++] = v;
  }
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) pixels.set(lines.subarray(y * bytesPerLine, y * bytesPerLine + width), y * width);
  const palette = b[b.length - 769] === 0x0c ? { rgb: b.slice(b.length - 768) } : undefined;
  return { width, height, pixels, palette };
}

export function decodeSbk(b: Uint8Array): Sprite[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = dv.getInt32(0, true);
  if (count < 0 || count > 1000) throw new Error("implausible sprite count");
  const sprites: Sprite[] = [];
  let p = 4;
  for (let k = 0; k < count; k++) {
    if (p + 13 > b.length) throw new Error("truncated sprite bank");
    const width = dv.getInt32(p, true);
    const height = dv.getInt32(p + 4, true);
    const flag = b[p + 8]!;
    const extra = dv.getInt32(p + 9, true);
    p += 13;
    if (width < 0 || height < 0 || width * height > b.length - p) throw new Error("corrupt sprite bank");
    // Rows are stored bottom-up in the file; flip to top-down.
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      pixels.set(b.subarray(p + y * width, p + (y + 1) * width), (height - 1 - y) * width);
    }
    p += width * height;
    sprites.push({ width, height, pixels, flag, extra });
  }
  if (p !== b.length) throw new Error("trailing bytes after sprite bank");
  return sprites;
}

/** Boards: 50 grids of 20x20 brick codes, row-major, one byte per cell. */
export function decodeBoards(b: Uint8Array): Uint8Array[] {
  if (b.length !== BOARD_COUNT * BOARD_COLUMNS * BOARD_ROWS) throw new Error("unexpected board file size");
  const size = BOARD_COLUMNS * BOARD_ROWS;
  return Array.from({ length: BOARD_COUNT }, (_, i) => b.slice(i * size, (i + 1) * size));
}
