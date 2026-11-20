// No upload in the portal opens the camera instead of the file picker
// (2026-11-20). A file input with a capture attribute does exactly that on a
// phone — Android and iPhone alike skip the picker and start the camera — so
// a student could not upload a document or a photo they already had. The
// office's choice is the phone's own file picker only.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(path);
  }
  return out;
}

test("no file input asks for the camera (capture=…)", () => {
  const offenders = [];
  for (const file of sources("src")) {
    const text = readFileSync(file, "utf8");
    // capture= as a JSX attribute or a DOM property, in any form.
    for (const m of text.matchAll(/\bcapture\s*=\s*[{"']|\.capture\s*=|setAttribute\(\s*["']capture["']/g)) {
      offenders.push(`${file}: ${text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(offenders, []);
});
