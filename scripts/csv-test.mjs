import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCsvBytes, parseCsvWithHeader, readCsvFile } from "../src/lib/csv.ts";

// "Università degli Studi di Brescia" as Excel on Windows saves it in a CSV:
// Windows-1252, the "à" one byte (0xE0) that is not UTF-8.
const ANSI = Buffer.from("name\nUniversit\xe0 degli Studi di Brescia\n", "latin1");

test("a CSV saved by Excel in Windows-1252 keeps its accents", () => {
  assert.equal(decodeCsvBytes(ANSI), "name\nUniversità degli Studi di Brescia\n");
  assert.equal(parseCsvWithHeader(decodeCsvBytes(ANSI))[0].name, "Università degli Studi di Brescia");
  // Windows-1252's own characters, which Latin-1 lacks.
  assert.equal(decodeCsvBytes(Buffer.from([0x80, 0x20, 0x96])), "€ –");
});

test("a UTF-8 CSV is read as UTF-8, its byte-order mark dropped", () => {
  const utf8 = Buffer.from('﻿name,stipend_amount\nUniversità,"Up to €7,000 — fuori sede"\n', "utf8");
  const text = decodeCsvBytes(utf8);
  assert.equal(text.charCodeAt(0), "n".charCodeAt(0), "the BOM would otherwise become part of the first header");
  assert.deepEqual(parseCsvWithHeader(text)[0], { name: "Università", stipend_amount: "Up to €7,000 — fuori sede" });
});

test("nothing is ever turned into the replacement character", async () => {
  // file.text() would have given "Universit� degli Studi di Brescia".
  const text = await readCsvFile(new Blob([ANSI]));
  assert.ok(!text.includes("�"), JSON.stringify(text));
});
