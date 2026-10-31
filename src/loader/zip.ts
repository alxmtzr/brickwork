import { crc32, inflateRaw } from "./inflate.ts";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const u16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

export function looksLikeZip(b: Uint8Array): boolean {
  return b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);
}

/** Read every entry of a ZIP archive, verifying each entry's CRC-32. */
export function readZip(b: Uint8Array): ZipEntry[] {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a ZIP archive (no end-of-central-directory record)");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out: ZipEntry[] = [];
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
    const method = u16(b, p + 10);
    const crc = u32(b, p + 16);
    const csize = u32(b, p + 20);
    const usize = u32(b, p + 24);
    const nlen = u16(b, p + 28);
    const elen = u16(b, p + 30);
    const clen = u16(b, p + 32);
    const lho = u32(b, p + 42);
    const name = decoder.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    if (u32(b, lho) !== 0x04034b50) throw new Error(`corrupt ZIP local header for ${name}`);
    const dataStart = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
    const raw = b.subarray(dataStart, dataStart + csize);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = inflateRaw(raw, 0).data;
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    if (data.length !== usize) throw new Error(`size mismatch for ${name}`);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`);
    out.push({ name, data });
  }
  return out;
}
