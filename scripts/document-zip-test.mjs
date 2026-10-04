// "Download all" on a student's Documents tab: what each file and folder is
// called in the ZIP, and the one-page PDF a picture becomes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extensionForType, extensionOf, safeName, zipFileName, zipPaths } from "../src/lib/documentZip.ts";
import { jpegToPdf } from "../src/lib/jpegPdf.ts";

test("a checklist name becomes a file name every system accepts", () => {
  assert.equal(safeName("CV / Resume"), "CV - Resume");
  assert.equal(safeName("Bachelors — certificate — University of Karachi"), "Bachelors - certificate - University of Karachi");
  assert.equal(safeName('Offer letter: "final"?'), "Offer letter final");
  assert.equal(safeName("Passport. "), "Passport");
  assert.equal(safeName("Università di Bologna"), "Università di Bologna", "letters beyond English are kept");
  assert.equal(safeName("CON"), "CON_", "a name Windows reserves is changed");
  assert.equal(safeName("   "), "Document");
  assert.equal(safeName("x".repeat(300)).length, 120);
});

test("the extension is read from the stored file, and from the server's type when it has none", () => {
  assert.equal(extensionOf("abc/123-v2-My_CV.PDF"), "pdf");
  assert.equal(extensionOf("abc/123-photo.jpeg"), "jpeg");
  assert.equal(extensionOf("abc/123-noextension"), "");
  assert.equal(extensionOf("abc/123-weird.name.with.dots.docx"), "docx");
  assert.equal(extensionOf(null), "");
  assert.equal(extensionForType("application/pdf"), "pdf");
  assert.equal(extensionForType("image/jpeg; charset=binary"), "jpg");
  assert.equal(extensionForType("application/octet-stream"), "");
});

test("each section is a numbered folder, each file named after its checklist item", () => {
  const paths = zipPaths([
    { sectionNumber: 1, sectionLabel: "Admission", name: "CV / Resume", ext: "pdf" },
    { sectionNumber: 1, sectionLabel: "Admission", name: "Transcript", ext: "pdf" },
    { sectionNumber: 1, sectionLabel: "Admission", name: "Transcript", ext: "pdf" },
    { sectionNumber: 1, sectionLabel: "Admission", name: "transcript", ext: "pdf" },
    { sectionNumber: 2, sectionLabel: "Visa", name: "Transcript", ext: "pdf" },
    { sectionNumber: 2, sectionLabel: "Visa", name: "Bank statement", ext: "docx" },
    { sectionNumber: 3, sectionLabel: "Travel / Arrival", name: "Ticket", ext: "" },
  ]);
  assert.deepEqual(paths, [
    "1. Admission/CV - Resume.pdf",
    "1. Admission/Transcript.pdf",
    "1. Admission/Transcript (2).pdf",
    "1. Admission/transcript (3).pdf",
    "2. Visa/Transcript.pdf",
    "2. Visa/Bank statement.docx",
    "3. Travel - Arrival/Ticket",
  ]);
});

test("the ZIP is named after the student, with the intake when they have had more than one", () => {
  assert.equal(zipFileName("Ali Khan", "HMC-2026-IT-0012", null), "Ali Khan - HMC-2026-IT-0012 - Documents.zip");
  assert.equal(zipFileName("Ali Khan", null, "Fall 2027"), "Ali Khan - Documents - Fall 2027.zip");
  assert.equal(zipFileName("Ali / Khan", null, null), "Ali - Khan - Documents.zip");
});

test("a picture becomes a one-page A4 PDF whose cross-references point at its objects", () => {
  // Not a real JPEG — the PDF carries the bytes as they are, so any will do here.
  const jpeg = new Uint8Array(1000).map((_, i) => i % 256);
  const pdf = jpegToPdf(jpeg, 3000, 4000);
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/, "a tall picture is on an upright page");
  assert.match(text, /\/Width 3000 \/Height 4000 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length 1000/);
  assert.ok(Buffer.from(pdf).includes(Buffer.from(jpeg)), "the picture's bytes are carried unchanged");

  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 5);
  entries.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1}`));

  // Fitted inside the margin, centred, in proportion.
  const [w, h, x, y] = text.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/).slice(1).map(Number);
  assert.ok(Math.abs(w / h - 0.75) < 0.001, "proportions kept");
  assert.ok(x >= 24 && y >= 24 && x + w <= 595.28 - 23.99 && y + h <= 841.89 - 23.99, JSON.stringify({ w, h, x, y }));
});

test("a wide picture is on a page turned on its side", () => {
  const text = Buffer.from(jpegToPdf(new Uint8Array(10), 4000, 3000)).toString("latin1");
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.throws(() => jpegToPdf(new Uint8Array(10), 0, 100));
});
