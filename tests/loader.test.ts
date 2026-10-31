import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";

import { crc32, inflateRaw } from "../src/loader/inflate.ts";
import { loadGameFiles } from "../src/loader/wise.ts";
import { BOARD_COLUMNS, BOARD_ROWS, decodeBoards, decodePcx, decodeSbk } from "../src/loader/formats.ts";

function pseudoRandom(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

test("inflateRaw matches zlib for stored, fixed and dynamic blocks", () => {
  const text = new TextEncoder().encode("abcabcabc ".repeat(500) + "tail");
  const inputs = [new Uint8Array(0), new Uint8Array([1, 2, 3]), text, pseudoRandom(5000, 7), pseudoRandom(70000, 9)];
  for (const level of [0, 1, 6, 9]) {
    for (const input of inputs) {
      const packed = deflateRawSync(input, { level });
      const padded = new Uint8Array(packed.length + 10);
      padded.set(packed, 3);
      const r = inflateRaw(padded, 3);
      assert.deepEqual(r.data, input);
      assert.equal(r.end, 3 + packed.length, "reports exactly the bytes it consumed");
    }
  }
});

test("inflateRaw rejects corrupt and truncated input", () => {
  const packed = deflateRawSync(pseudoRandom(2000, 3));
  assert.throws(() => inflateRaw(packed.subarray(0, packed.length >> 1)));
  assert.throws(() => inflateRaw(new Uint8Array([0xff, 0xff, 0xff])));
});

test("crc32 known value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

const zipPath = process.env["BRICKWORK_TEST_FILE"];
test("real game download unpacks and decodes", { skip: zipPath ? false : "set BRICKWORK_TEST_FILE to run" }, () => {
  const bytes = new Uint8Array(readFileSync(zipPath!));
  const files = loadGameFiles(bytes);
  assert.ok(files.size >= 48, `expected 48+ files, got ${files.size}`);
  for (const name of ["dxball.exe", "default.bds", "mainmenu.pcx", "mball2.sbk", "boing.wav"]) {
    assert.ok(files.has(name), `missing ${name}`);
  }
  const exe = files.get("dxball.exe")!;
  assert.equal(createHash("sha256").update(exe).digest("hex").length, 64);

  const menu = decodePcx(files.get("mainmenu.pcx")!);
  assert.equal(menu.width, 640);
  assert.equal(menu.height, 480);
  assert.ok(menu.palette);

  assert.equal(decodeSbk(files.get("mball2.sbk")!).length, 166);

  const boards = decodeBoards(files.get("default.bds")!);
  assert.equal(boards.length, 50);
  assert.equal(boards[0]!.length, BOARD_COLUMNS * BOARD_ROWS);
});
