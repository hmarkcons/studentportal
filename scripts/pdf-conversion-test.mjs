// Every stored file downloaded as a PDF (src/lib/pdfConversion.ts): what each
// file is, and what its PDF is called.
import test from "node:test";
import assert from "node:assert/strict";
import { conversionKind, extensionOf, keptAsItIsNote, nameFromUrl, pdfName } from "../src/lib/pdfConversion.ts";

test("each kind of file, by its name", () => {
  const cases = {
    "passport.pdf": "pdf",
    "Scan.PDF": "pdf",
    "photo.jpg": "image",
    "photo.JPEG": "image",
    "screenshot.png": "image",
    "card.webp": "image",
    "IMG_0001.HEIC": "heic",
    "notes.txt": "text",
    "data.json": "text",
    "marks.csv": "csv",
    "cv.docx": "docx",
    "fees.xlsx": "xlsx",
    "old.doc": "none",
    "old.xls": "none",
    "slides.pptx": "none",
    "archive.zip": "none",
    "consent.mp4": "none",
  };
  for (const [name, kind] of Object.entries(cases)) assert.equal(conversionKind(name), kind, name);
});

test("a name that says nothing falls back to the file's type", () => {
  assert.equal(conversionKind("download", "application/pdf"), "pdf");
  assert.equal(conversionKind("download", "image/png"), "image");
  assert.equal(conversionKind("download", "image/heic"), "heic");
  assert.equal(conversionKind("download", "text/plain; charset=utf-8"), "text");
  assert.equal(conversionKind("download", "text/csv"), "csv");
  assert.equal(conversionKind("download", "application/zip"), "none");
  assert.equal(conversionKind("download", null), "none");
  // The name wins over a type that disagrees: storage often says octet-stream.
  assert.equal(conversionKind("cv.docx", "application/octet-stream"), "docx");
});

test("the PDF keeps the file's own name", () => {
  assert.equal(pdfName("Payment Receipt - Padova.jpg"), "Payment Receipt - Padova.pdf");
  assert.equal(pdfName("passport.pdf"), "passport.pdf");
  assert.equal(pdfName("archive.tar.gz"), "archive.tar.pdf");
  assert.equal(pdfName("README"), "README.pdf");
  assert.equal(pdfName(""), "document.pdf");
  assert.equal(pdfName(".hidden"), "document.pdf");
});

test("a stored file's name from its signed link", () => {
  assert.equal(
    nameFromUrl("https://x.supabase.co/storage/v1/object/sign/documents/aa/fee-receipts/bb/ab12cd34/Payment_Receipt.pdf?token=abc"),
    "Payment_Receipt.pdf"
  );
  assert.equal(nameFromUrl("https://x.supabase.co/storage/v1/object/sign/documents/s/3f2b9c1e-1111-4222-8333-944455556666-passport%20scan.jpg?token=t"), "passport scan.jpg");
  assert.equal(nameFromUrl("https://x.supabase.co/storage/v1/object/sign/documents/s/1731650000000-cv.docx?token=t"), "cv.docx");
  assert.equal(nameFromUrl("/relative/path/letter.png"), "letter.png");
});

test("what a person is told when a file comes down as it is", () => {
  assert.match(keptAsItIsNote("archive.zip"), /A \.zip file cannot be turned into a PDF, so archive\.zip was downloaded as it is/);
  assert.match(keptAsItIsNote("cv.docx", "the file is damaged"), /could not be turned into a PDF \(the file is damaged\)/);
  assert.equal(extensionOf("a/b/c.TXT"), "txt");
  assert.equal(extensionOf("noext"), "");
});
