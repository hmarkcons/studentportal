import { readFileSync } from "fs";
import path from "path";

// The HMARK wordmark (1667x617, ratio ~2.702:1) — read once from the same
// file the app UI serves at /hmark-logo.png, so there's a single asset to
// keep in sync rather than a separate copy baked in for PDFs.
let cached: string | null = null;

export function getBrandLogoDataUri(): string {
  if (!cached) {
    const buf = readFileSync(path.join(process.cwd(), "public", "hmark-logo.png"));
    cached = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return cached;
}

export const BRAND_LOGO_RATIO = 1667 / 617;
