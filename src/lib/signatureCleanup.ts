// A signature photographed on paper, made into a clean signature: the paper
// taken out (transparent), the ink kept, specks of dust dropped, and the
// picture cropped to the signature. Pure — it works on the pixels a canvas
// gives (RGBA, row by row) — so the unit tests (scripts/signature-cleanup-test.mjs)
// run it under plain Node, and the portal runs the same code in the browser.
//
// A phone photo is not white paper and black ink: the light falls off across
// the page and a hand or a phone casts a shadow, so a fixed "lighter than X is
// paper" leaves a grey wedge of shadow in the signature. Instead the paper's
// own brightness is estimated around every pixel — the ink taken out of the
// picture by a widening (a thin stroke vanishes under its brighter
// neighbours), then smoothed — and a pixel is ink by how much darker it is
// than the paper around it, not by how dark it is.

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

export type CleanResult =
  | { ok: true; image: Rgba; inkPixels: number; ink: "black" | "blue" }
  | { ok: false; error: string };

const BLACK_INK = [17, 24, 39] as const;
const BLUE_INK = [23, 46, 130] as const;

/** Each pixel's brightness, 0–255; a transparent one counts as white paper. */
function luminance({ data, width, height }: Rgba): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const a = data[i + 3] / 255;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    out[p] = l * a + 255 * (1 - a);
  }
  return out;
}

/** The brightest value within `radius` along each row, then each column (a widening of the light). */
function maxFilter(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, len: number, count: number, stride: number, step: number) => {
    // A sliding-window maximum per line, kept by a queue of candidates.
    const queue = new Int32Array(len);
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      let head = 0;
      let tail = 0;
      for (let i = 0; i < len + radius; i++) {
        if (i < len) {
          const v = from[base + i * step];
          while (tail > head && from[base + queue[tail - 1] * step] <= v) tail--;
          queue[tail++] = i;
        }
        const centre = i - radius;
        if (centre >= 0) {
          while (queue[head] < centre - radius) head++;
          to[base + centre * step] = from[base + queue[head] * step];
        }
      }
    }
  };
  pass(src, tmp, width, height, width, 1);
  pass(tmp, out, height, width, 1, width);
  return out;
}

/** The average within `radius` along each row, then each column. */
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, len: number, count: number, stride: number, step: number) => {
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      let sum = 0;
      let n = 0;
      for (let i = -radius; i < len + radius; i++) {
        const add = i + radius;
        if (add < len && add >= 0) {
          sum += from[base + add * step];
          n++;
        }
        const drop = i - radius - 1;
        if (drop >= 0 && drop < len) {
          sum -= from[base + drop * step];
          n--;
        }
        if (i >= 0 && i < len) to[base + i * step] = sum / Math.max(1, n);
      }
    }
  };
  pass(src, tmp, width, height, width, 1);
  pass(tmp, out, height, width, 1, width);
  return out;
}

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** Drops ink islands smaller than `minArea` pixels — dust, paper grain, a stray dot of shadow. */
function dropSpecks(alpha: Uint8ClampedArray, width: number, height: number, minArea: number) {
  const seen = new Uint8Array(alpha.length);
  const stack = new Int32Array(alpha.length);
  const members: number[] = [];
  for (let start = 0; start < alpha.length; start++) {
    if (seen[start] || alpha[start] === 0) continue;
    members.length = 0;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const p = stack[--top];
      members.push(p);
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (!seen[q] && alpha[q] > 0) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    if (members.length < minArea) for (const p of members) alpha[p] = 0;
  }
}

/** The smallest box around everything more than faintly inked, with a margin. */
export function inkBounds(alpha: Uint8ClampedArray, width: number, height: number, margin: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: Math.max(0, minX - margin),
    y: Math.max(0, minY - margin),
    width: Math.min(width, maxX + margin + 1) - Math.max(0, minX - margin),
    height: Math.min(height, maxY + margin + 1) - Math.max(0, minY - margin),
  };
}

/** The ink in the same colour throughout, its strength as opacity, cropped to the signature. */
function compose(alpha: Uint8ClampedArray, width: number, height: number, ink: readonly [number, number, number]): Rgba | null {
  const box = inkBounds(alpha, width, height, Math.round(Math.max(width, height) * 0.02) + 2);
  if (!box) return null;
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const a = alpha[(box.y + y) * width + box.x + x];
      const o = (y * box.width + x) * 4;
      data[o] = ink[0];
      data[o + 1] = ink[1];
      data[o + 2] = ink[2];
      data[o + 3] = a;
    }
  }
  return { data, width: box.width, height: box.height };
}

/**
 * The photographed signature, cleaned. `strength` (0–1, default 0.5) is how
 * readily a faint mark counts as paper: higher takes out more shadow and
 * grain, lower keeps fainter strokes. The ink comes out black, or blue when
 * the pen was clearly blue.
 */
export function cleanSignature(image: Rgba, { strength = 0.5 }: { strength?: number } = {}): CleanResult {
  const { width, height, data } = image;
  if (width < 20 || height < 10) return { ok: false, error: "That picture is too small to hold a signature." };

  const lum = luminance(image);
  const minSide = Math.min(width, height);
  const widen = Math.min(18, Math.max(3, Math.round(minSide / 50)));
  const paper = boxBlur(maxFilter(lum, width, height, widen), width, height, widen * 2);

  const s = Math.min(1, Math.max(0, strength));
  const lo = 0.07 + 0.16 * s;
  const hi = lo + 0.2;
  const alpha = new Uint8ClampedArray(width * height);
  let blueVotes = 0;
  let votes = 0;
  for (let p = 0; p < alpha.length; p++) {
    const bg = paper[p];
    // Not paper at all — a dark desk at the edge of the photo: nothing to read there.
    if (bg < 60) continue;
    const darkness = 1 - lum[p] / bg;
    const a = smoothstep(lo, hi, darkness);
    if (a <= 0.02) continue;
    alpha[p] = Math.round(a * 255);
    if (a > 0.9) {
      const i = p * 4;
      votes++;
      if (data[i + 2] > data[i] + 25 && data[i + 2] > data[i + 1] + 10) blueVotes++;
    }
  }

  dropSpecks(alpha, width, height, Math.max(5, Math.round((minSide * minSide) / 60000)));

  let inkPixels = 0;
  for (let p = 0; p < alpha.length; p++) if (alpha[p] > 24) inkPixels++;
  if (inkPixels < Math.max(30, (width * height) / 20000)) {
    return { ok: false, error: "We could not find a signature in that picture. Sign in dark ink on plain white paper, and take the photo close up." };
  }
  if (inkPixels > width * height * 0.45) {
    return { ok: false, error: "That picture is mostly dark, so the signature cannot be picked out. Photograph it on plain white paper, in good light." };
  }

  const ink = votes > 0 && blueVotes / votes > 0.6 ? "blue" : "black";
  const out = compose(alpha, width, height, ink === "blue" ? BLUE_INK : BLACK_INK);
  if (!out) return { ok: false, error: "We could not find a signature in that picture." };
  return { ok: true, image: out, inkPixels, ink };
}

/**
 * A signature drawn in the portal: already ink on nothing, so only cropped.
 * Null when nothing has been drawn worth calling a signature.
 */
export function cropDrawnSignature(image: Rgba): Rgba | null {
  const { width, height, data } = image;
  const alpha = new Uint8ClampedArray(width * height);
  let inked = 0;
  for (let p = 0; p < alpha.length; p++) {
    alpha[p] = data[p * 4 + 3];
    if (alpha[p] > 24) inked++;
  }
  if (inked < 60) return null;
  const box = inkBounds(alpha, width, height, Math.round(Math.max(width, height) * 0.02) + 2);
  if (!box) return null;
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * width + box.x) * 4;
    out.set(data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { data: out, width: box.width, height: box.height };
}
