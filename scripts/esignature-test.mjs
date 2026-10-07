// A signature given in the portal, as the server takes it (src/lib/esignature.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPortalESigned, signatureFromPng, signedLineText, SIGNATURE_MAX_BYTES } from "../src/lib/esignature.ts";

/** The first bytes of a PNG: its signature and IHDR, which is all that is read. */
function png(width, height, colourType = 6) {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([73, 72, 68, 82], 12); // IHDR
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  b[24] = 8;
  b[25] = colourType;
  return b;
}

test("a transparent PNG of a signature's shape is read for its size", () => {
  assert.deepEqual(signatureFromPng(png(900, 260)), { width: 900, height: 260 });
  assert.deepEqual(signatureFromPng(png(400, 160, 4)), { width: 400, height: 160 });
});

test("anything else is refused, saying so", () => {
  assert.match(signatureFromPng(new TextEncoder().encode("<svg onload=alert(1)>".padEnd(64, " "))).error, /not a signature image/);
  const jpeg = png(900, 260);
  jpeg[0] = 0xff;
  assert.match(signatureFromPng(jpeg).error, /not a signature image/);
  assert.match(signatureFromPng(png(900, 260, 2)).error, /still has its background/, "no transparency: the paper is still in it");
  assert.match(signatureFromPng(png(5, 5)).error, /usable size/);
  assert.match(signatureFromPng(png(9000, 300)).error, /usable size/);
  assert.match(signatureFromPng(png(100, 1000)).error, /does not look like a signature/);
  assert.match(signatureFromPng(new Uint8Array(SIGNATURE_MAX_BYTES + 1)).error, /too large/);
});

test("the line under the signature says who, when in Pakistan time, and how", () => {
  // 10:15 UTC is 3:15 pm in Karachi.
  assert.equal(
    signedLineText("Ali Raza", new Date("2026-10-07T10:15:00Z")),
    "Signed electronically by Ali Raza on 7 October 2026 at 3:15 pm (Pakistan time), in the HMARK student portal."
  );
  // 21:30 UTC on the 7th is already the 8th in Karachi.
  assert.match(signedLineText("Sara", new Date("2026-10-07T21:30:00Z")), /on 8 October 2026 at 2:30 am/);
});

test("an e-signed copy is told from an uploaded one by its name", () => {
  assert.equal(isPortalESigned("s/agreements/a-signed-1700000000000-e-signed.pdf"), true);
  assert.equal(isPortalESigned("s/agreements/a-signed-1700000000000-scan.pdf"), false);
  assert.equal(isPortalESigned(null), false);
});
