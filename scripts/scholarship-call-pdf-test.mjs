import test from "node:test";
import assert from "node:assert/strict";
import { guessLanguage, callFilename, MAX_CALL_PDF_BYTES } from "../src/lib/scholarshipCallPdf.ts";

test("an English call is recognised from its own address", () => {
  assert.equal(guessLanguage("https://www.unibg.it/en/bandi/scholarship-call.pdf"), "en");
  assert.equal(guessLanguage("https://erdis.it/files/call_EN.pdf"), "en");
  assert.equal(guessLanguage("https://esu.pd.it/english/bando.pdf"), "en");
});

test("an Italian call is recognised too, so a student is warned before opening it", () => {
  // Most regions publish in Italian only. Forty pages of bando nobody can read
  // is worth flagging before it is opened, not after.
  assert.equal(guessLanguage("https://www.ardis.fvg.it/bando-2026.pdf"), "it");
  assert.equal(guessLanguage("https://erdis.it/it/notizie/borsa.pdf"), "it");
});

test("an address that says nothing returns unknown rather than guessing", () => {
  assert.equal(guessLanguage("https://example.org/upload/schede/1782713728.pdf"), "unknown");
});

test("the stored file is named after the body and the year, not the region's serial number", () => {
  assert.equal(callFilename("DSU Toscana", "2026/2027", "https://x/1782713728.pdf"), "DSU-Toscana-20262027-call.pdf");
  assert.equal(callFilename("ER.GO", "2026/2027", "https://x/a.pdf"), "ER-GO-20262027-call.pdf");
});

test("accents and apostrophes do not end up in a storage key", () => {
  // A path with a quote in it is a path something downstream will mangle.
  assert.equal(callFilename("ADSU L'Aquila", "2026/2027", "https://x/a.pdf"), "ADSU-L-Aquila-20262027-call.pdf");
  assert.equal(callFilename("Università di Pavia", null, "https://x/a.pdf"), "Universita-di-Pavia-call.pdf");
  for (const name of ["ADSU L'Aquila", "Università di Pavia", "ER.GO", "ARDiS FVG"]) {
    assert.match(callFilename(name, "2026/2027", "https://x/a.pdf"), /^[A-Za-z0-9.-]+$/, name);
  }
});

test("a body with no academic year still gets a usable name", () => {
  assert.equal(callFilename("ERSU Catania", null, "https://x/a.pdf"), "ERSU-Catania-call.pdf");
  assert.equal(callFilename("", null, "https://x/a.pdf"), "call-call.pdf");
});

test("the size ceiling is a call document, not a video", () => {
  assert.equal(MAX_CALL_PDF_BYTES, 25 * 1024 * 1024);
});
