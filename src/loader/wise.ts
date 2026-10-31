import { crc32, inflateRaw } from "./inflate.ts";
import { looksLikeZip, readZip } from "./zip.ts";

export type GameFiles = Map<string, Uint8Array>;

const u16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n));

function peOverlayStart(b: Uint8Array): number {
  if (b[0] !== 0x4d || b[1] !== 0x5a) throw new Error("not a Windows executable");
  const pe = u32(b, 0x3c);
  if (ascii(b, pe, 4) !== "PE\0\0") throw new Error("not a PE file");
  const sections = u16(b, pe + 6);
  const optSize = u16(b, pe + 20);
  let end = 0;
  for (let i = 0; i < sections; i++) {
    const s = pe + 24 + optSize + i * 40;
    end = Math.max(end, u32(b, s + 20) + u32(b, s + 16));
  }
  return end;
}

interface Stream {
  offset: number;
  data: Uint8Array;
}

/**
 * Walk the back-to-back DEFLATE+CRC32 streams appended to the installer.
 * The first stream starts shortly after the executable image; each next
 * stream starts right after the previous stream's 4-byte CRC.
 */
function carveStreams(b: Uint8Array): Stream[] {
  const start = peOverlayStart(b);
  const streams: Stream[] = [];
  let off = -1;
  for (let probe = start; probe < Math.min(b.length - 8, start + 1024); probe++) {
    const s = tryStream(b, probe);
    if (s) {
      off = probe;
      streams.push({ offset: probe, data: s.data });
      off = s.next;
      break;
    }
  }
  if (off < 0) throw new Error("no installer payload found after the executable image");
  for (;;) {
    const s = tryStream(b, off);
    if (!s) break;
    streams.push({ offset: off, data: s.data });
    off = s.next;
  }
  return streams;
}

function tryStream(b: Uint8Array, off: number): { data: Uint8Array; next: number } | undefined {
  if (off + 8 > b.length) return undefined;
  try {
    const r = inflateRaw(b, off);
    if (r.data.length < 16 || r.end + 4 > b.length) return undefined;
    if (u32(b, r.end) !== crc32(r.data)) return undefined;
    return { data: r.data, next: r.end + 4 };
  } catch {
    return undefined;
  }
}

/** Names listed in the installer script, in install order. */
function scriptNames(script: Uint8Array): string[] {
  const text = new TextDecoder("latin1").decode(script);
  const names: string[] = [];
  for (const m of text.matchAll(/%MAINDIR%\\([^\0%\\]+?\.[A-Za-z0-9]{2,3})\0/g)) {
    const n = m[1]!;
    if (!/^(INSTALL\.LOG|BACKUP)$/i.test(n)) names.push(n);
  }
  return names;
}

function signatureOk(name: string, d: Uint8Array): boolean {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "pcx":
      return d[0] === 10 && d[2] === 1;
    case "wav":
      return ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "WAVE";
    case "mds":
      return ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "MIDS";
    case "exe":
      return d[0] === 0x4d && d[1] === 0x5a;
    case "bds":
      return d.length === 20000;
    case "sbk": {
      // count, then count records of (w, h, flag, extra, w*h pixels) consuming the file exactly
      if (d.length < 4) return false;
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      const count = dv.getInt32(0, true);
      let p = 4;
      for (let i = 0; i < count; i++) {
        if (p + 13 > d.length) return false;
        const w = dv.getInt32(p, true);
        const h = dv.getInt32(p + 4, true);
        if (w < 0 || h < 0) return false;
        p += 13 + w * h;
      }
      return p === d.length;
    }
    default:
      return true;
  }
}

/**
 * Extract the data files from a Wise installer. The install script lists file
 * names in order; they are paired with the payload streams in the same order.
 * Pairing is accepted only if EVERY file passes a format check, so a wrong
 * alignment fails loudly instead of producing mislabelled data.
 */
export function extractWiseInstaller(b: Uint8Array): GameFiles {
  const streams = carveStreams(b);
  if (streams.length < 2) throw new Error("installer payload too small");
  const names = scriptNames(streams[0]!.data);
  if (names.length === 0) throw new Error("installer script lists no files");
  for (let first = 1; first + names.length <= streams.length; first++) {
    const files: GameFiles = new Map();
    let ok = true;
    for (let i = 0; i < names.length; i++) {
      const data = streams[first + i]!.data;
      if (!signatureOk(names[i]!, data)) {
        ok = false;
        break;
      }
      files.set(names[i]!.toLowerCase(), data);
    }
    if (ok) return files;
  }
  throw new Error("could not pair installer file names with payload streams");
}

/**
 * Accept a dropped file: a Wise installer .exe, or a ZIP (possibly nested, e.g.
 * an archive wrapper around the original zip) that contains one.
 */
export function loadGameFiles(input: Uint8Array, depth = 0): GameFiles {
  if (depth > 3) throw new Error("archive nesting too deep");
  if (looksLikeZip(input)) {
    for (const entry of readZip(input)) {
      const isZip = looksLikeZip(entry.data);
      const isExe = /\.exe$/i.test(entry.name) && entry.data[0] === 0x4d;
      if (!isZip && !isExe) continue;
      try {
        return loadGameFiles(entry.data, depth + 1);
      } catch {
        // try the next candidate entry
      }
    }
    throw new Error("no recognizable game installer found inside the archive");
  }
  return extractWiseInstaller(input);
}
