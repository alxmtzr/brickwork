/**
 * Raw DEFLATE (RFC 1951) decoder that reports how many input bytes it consumed.
 * Needed because installer payloads are concatenated streams without length fields.
 */

export class InflateError extends Error {}

export interface InflateResult {
  data: Uint8Array;
  /** Offset in `src` just past the last byte of the DEFLATE stream. */
  end: number;
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  count: Uint16Array;
  symbol: Uint16Array;
}

function buildHuffman(lengths: ArrayLike<number>, n: number): Huffman {
  const count = new Uint16Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]!]!++;
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len]! + count[len]!;
  const symbol = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const l = lengths[i]!;
    if (l !== 0) symbol[offs[l]!++] = i;
  }
  return { count, symbol };
}

let fixedLit: Huffman | undefined;
let fixedDist: Huffman | undefined;

export function inflateRaw(src: Uint8Array, start = 0, maxOutput = 64 << 20): InflateResult {
  let pos = start;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(Math.min(Math.max(src.length * 3, 1024), maxOutput));
  let outLen = 0;

  const bits = (need: number): number => {
    let val = bitBuf;
    while (bitCnt < need) {
      if (pos >= src.length) throw new InflateError("unexpected end of input");
      val |= src[pos++]! << bitCnt;
      bitCnt += 8;
    }
    bitBuf = val >>> need;
    bitCnt -= need;
    return val & ((1 << need) - 1);
  };

  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const c = h.count[len]!;
      if (code - c < first) return h.symbol[index + (code - first)]!;
      index += c;
      first += c;
      first <<= 1;
      code <<= 1;
    }
    throw new InflateError("invalid Huffman code");
  };

  const put = (b: number): void => {
    if (outLen === out.length) {
      if (outLen >= maxOutput) throw new InflateError("output limit exceeded");
      const bigger = new Uint8Array(Math.min(out.length * 2, maxOutput));
      bigger.set(out);
      out = bigger;
    }
    out[outLen++] = b;
  };

  const codes = (lit: Huffman, dist: Huffman): void => {
    for (;;) {
      let sym = decode(lit);
      if (sym < 256) {
        put(sym);
      } else if (sym === 256) {
        return;
      } else {
        sym -= 257;
        if (sym >= 29) throw new InflateError("bad length symbol");
        const len = LENGTH_BASE[sym]! + bits(LENGTH_EXTRA[sym]!);
        const ds = decode(dist);
        if (ds >= 30) throw new InflateError("bad distance symbol");
        const d = DIST_BASE[ds]! + bits(DIST_EXTRA[ds]!);
        if (d > outLen) throw new InflateError("distance too far back");
        for (let i = 0; i < len; i++) put(out[outLen - d]!);
      }
    }
  };

  let last: number;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > src.length) throw new InflateError("truncated stored block");
      const len = src[pos]! | (src[pos + 1]! << 8);
      const nlen = src[pos + 2]! | (src[pos + 3]! << 8);
      if (len !== (~nlen & 0xffff)) throw new InflateError("stored block length mismatch");
      pos += 4;
      if (pos + len > src.length) throw new InflateError("truncated stored block");
      for (let i = 0; i < len; i++) put(src[pos + i]!);
      pos += len;
    } else if (type === 1) {
      if (!fixedLit || !fixedDist) {
        const l = new Uint8Array(288);
        l.fill(8, 0, 144);
        l.fill(9, 144, 256);
        l.fill(7, 256, 280);
        l.fill(8, 280, 288);
        fixedLit = buildHuffman(l, 288);
        fixedDist = buildHuffman(new Uint8Array(30).fill(5), 30);
      }
      codes(fixedLit, fixedDist);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new InflateError("bad dynamic block counts");
      const lengths = new Uint8Array(320);
      for (let i = 0; i < ncode; i++) lengths[CLEN_ORDER[i]!] = bits(3);
      const clen = buildHuffman(lengths.subarray(0, 19), 19);
      const all = new Uint8Array(nlen + ndist);
      let idx = 0;
      while (idx < nlen + ndist) {
        const sym = decode(clen);
        if (sym < 16) {
          all[idx++] = sym;
        } else {
          let prev = 0;
          let rep: number;
          if (sym === 16) {
            if (idx === 0) throw new InflateError("repeat with no previous length");
            prev = all[idx - 1]!;
            rep = 3 + bits(2);
          } else if (sym === 17) {
            rep = 3 + bits(3);
          } else {
            rep = 11 + bits(7);
          }
          if (idx + rep > nlen + ndist) throw new InflateError("too many code lengths");
          while (rep--) all[idx++] = prev;
        }
      }
      if (all[256] === 0) throw new InflateError("missing end-of-block code");
      codes(buildHuffman(all.subarray(0, nlen), nlen), buildHuffman(all.subarray(nlen), ndist));
    } else {
      throw new InflateError("reserved block type");
    }
  } while (!last);

  return { data: out.slice(0, outLen), end: pos };
}

let crcTable: Uint32Array | undefined;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
