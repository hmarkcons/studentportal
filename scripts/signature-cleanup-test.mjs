// A photographed signature, cleaned (src/lib/signatureCleanup.ts): the paper
// out — shadow and all — the ink kept, dust dropped, cropped to the signature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSignature, cropDrawnSignature } from "../src/lib/signatureCleanup.ts";

/** A photo of a page: lit on the left, in shadow on the right, with a little grain. */
function page(width, height, { shadow = true } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const grain = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 9) - 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 248 at the left edge falling to 150 at the right: a phone's shadow.
      const l = (shadow ? 248 - (98 * x) / width : 248) + grain();
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = l;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Ink laid along a line, `thick` pixels wide. */
function stroke(img, x0, y0, x1, y1, thick, rgb) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const painted = new Set();
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(x0 + ((x1 - x0) * s) / steps);
    const cy = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = 0; dy < thick; dy++) {
      for (let dx = 0; dx < thick; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const i = (y * img.width + x) * 4;
        // Ink keeps some of the light falling on it, as a real pen stroke does.
        const light = img.data[i] / 255;
        img.data[i] = rgb[0] * (0.6 + 0.4 * light);
        img.data[i + 1] = rgb[1] * (0.6 + 0.4 * light);
        img.data[i + 2] = rgb[2] * (0.6 + 0.4 * light);
        painted.add(y * img.width + x);
      }
    }
  }
  return painted.size;
}

function signature(img, rgb = [35, 35, 40]) {
  let area = 0;
  area += stroke(img, 40, 100, 120, 40, 4, rgb);
  area += stroke(img, 120, 40, 170, 110, 4, rgb);
  area += stroke(img, 170, 110, 260, 60, 4, rgb);
  area += stroke(img, 260, 60, 360, 95, 4, rgb); // through the deepest shadow
  return area;
}

const inked = (img) => {
  let n = 0;
  for (let p = 3; p < img.data.length; p += 4) if (img.data[p] > 24) n++;
  return n;
};

test("the paper goes, the ink stays — even in the shadow", () => {
  const img = page(400, 160);
  const area = signature(img);
  const out = cleanSignature(img);
  assert.equal(out.ok, true, out.error);
  const n = inked(out.image);
  assert.ok(n >= area * 0.85 && n <= area * 1.8, `ink ${n} for a signature of ${area} pixels: no shadow wedge, no lost strokes`);
  assert.equal(out.ink, "black");
});

test("it is cropped to the signature, with a small margin", () => {
  const img = page(400, 160);
  signature(img);
  const out = cleanSignature(img);
  assert.ok(out.image.width < 400 && out.image.width > 320, String(out.image.width));
  assert.ok(out.image.height < 160 && out.image.height > 70, String(out.image.height));
  // The corners of the crop are the margin: transparent.
  assert.equal(out.image.data[3], 0);
  assert.equal(out.image.data[out.image.data.length - 1], 0);
});

test("dust is dropped", () => {
  const img = page(400, 160, { shadow: false });
  const area = signature(img);
  for (const [x, y] of [[10, 10], [390, 150], [200, 150], [15, 140]]) {
    const i = (y * 400 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 60;
  }
  const out = cleanSignature(img);
  assert.ok(inked(out.image) <= area * 1.8);
  // The signature with its margin is about 344 × 94; a speck at an edge would stretch it to the page.
  assert.ok(out.image.width < 370 && out.image.height < 120, `${out.image.width} × ${out.image.height}: a speck at an edge would have stretched the crop`);
});

test("a blue pen stays blue", () => {
  const img = page(400, 160, { shadow: false });
  signature(img, [30, 55, 175]);
  const out = cleanSignature(img);
  assert.equal(out.ok, true);
  assert.equal(out.ink, "blue");
});

test("a blank page, or a dark photo, is said plainly", () => {
  const blank = cleanSignature(page(400, 160));
  assert.equal(blank.ok, false);
  assert.match(blank.error, /could not find a signature/);
  const dark = page(200, 100, { shadow: false });
  for (let i = 0; i < dark.data.length; i += 4) dark.data[i] = dark.data[i + 1] = dark.data[i + 2] = 20;
  assert.equal(cleanSignature(dark).ok, false);
  assert.equal(cleanSignature({ data: new Uint8ClampedArray(10 * 5 * 4), width: 10, height: 5 }).ok, false);
});

test("a stronger clean-up takes out a faint smudge the gentle one keeps", () => {
  const img = page(400, 160, { shadow: false });
  signature(img);
  stroke(img, 40, 140, 360, 140, 3, [205, 205, 205]); // a faint pencil guideline
  const gentle = inked(cleanSignature(img, { strength: 0 }).image);
  const strong = inked(cleanSignature(img, { strength: 1 }).image);
  assert.ok(strong < gentle, `${strong} < ${gentle}`);
});

test("a drawn signature is only cropped; an empty pad is nothing", () => {
  const pad = { data: new Uint8ClampedArray(300 * 120 * 4), width: 300, height: 120 };
  for (let x = 50; x < 250; x++) {
    for (let y = 58; y < 62; y++) {
      const i = (y * 300 + x) * 4;
      pad.data[i + 3] = 255;
    }
  }
  const out = cropDrawnSignature(pad);
  assert.ok(out && out.width > 200 && out.width < 230 && out.height < 30, JSON.stringify(out && [out.width, out.height]));
  assert.equal(cropDrawnSignature({ data: new Uint8ClampedArray(300 * 120 * 4), width: 300, height: 120 }), null);
});
