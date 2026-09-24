import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_UPLOAD_BYTES,
  MAX_PHOTO_BYTES,
  formatFileSize,
  limitHint,
  fileSizeError,
  shrunkNote,
  isShrinkableImage,
  reduceHint,
} from "../src/lib/fileSize.ts";
import { MAX_VIDEO_SIZE_BYTES } from "../src/lib/documentUpload.ts";
import { readFileSync } from "node:fs";

const MB = 1024 * 1024;

test("the limits are the ones the office set", () => {
  assert.equal(MAX_UPLOAD_BYTES, 5 * MB);
  assert.equal(MAX_PHOTO_BYTES, 500 * 1024);
});

// Storage enforces the same limits at the staging buckets (0275) that the app
// checks before and after. If one changed without the other, a file would pass
// the app's check and be refused by Storage with a message nobody wrote.
test("the staging buckets hold files to the same limits as the app", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0275_upload_staging.sql", import.meta.url), "utf8");
  const limit = (bucket) => Number(new RegExp(`\\('${bucket}', '${bucket}', false, (\\d+)\\)`).exec(sql)?.[1]);
  assert.equal(limit("upload-staging"), MAX_UPLOAD_BYTES);
  assert.equal(limit("upload-staging-video"), MAX_VIDEO_SIZE_BYTES);
});

test("a size is written the way a person would say it", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(900), "900 B");
  assert.equal(formatFileSize(512 * 1024), "512 KB");
  assert.equal(formatFileSize(2 * MB), "2 MB", "an exact figure drops the decimal");
  assert.equal(formatFileSize(4.23 * MB), "4.2 MB");
});

test("a size just over the limit is never written as being at it", () => {
  // 5.04 MB rounding to "5 MB" would read as allowed while being refused.
  assert.notEqual(formatFileSize(5.04 * MB), "5 MB");
  assert.equal(formatFileSize(5.04 * MB), "5.0 MB");
  // The message still names the limit, so the two numbers reading alike does
  // not leave the sentence self-contradictory.
  const msg = fileSizeError(5.04 * MB);
  assert.match(msg, /This file is 5\.0 MB\. The limit is 5 MB/);
});

test("a negative or broken size does not crash the message", () => {
  assert.equal(formatFileSize(-5), "0 B");
  assert.equal(formatFileSize(NaN), "0 B");
  assert.equal(formatFileSize(Infinity), "0 B");
});

test("the limit is mentioned up front in one wording", () => {
  assert.equal(limitHint(), "max 5 MB");
  assert.equal(limitHint(MAX_PHOTO_BYTES), "max 500 KB");
});

test("a file at or under the limit is not refused", () => {
  assert.equal(fileSizeError(0), null);
  assert.equal(fileSizeError(MAX_UPLOAD_BYTES), null, "exactly at the limit is allowed");
  assert.equal(fileSizeError(MAX_UPLOAD_BYTES - 1), null);
});

test("a refusal names the file's own size, not just the limit", () => {
  const msg = fileSizeError(6.1 * MB);
  assert.match(msg, /This file is 6\.1 MB/);
  assert.match(msg, /limit is 5 MB per document/);
  assert.match(msg, /Reduce it and try again/);
});

test("the noun follows what is being uploaded", () => {
  assert.match(fileSizeError(MB, 500 * 1024, "photo"), /per photo/);
  assert.match(fileSizeError(3 * MB, 2 * MB, "agreement"), /per agreement/);
});

test("a shrunk file says what happened to it", () => {
  assert.equal(
    shrunkNote(7.2 * MB, 3.1 * MB),
    "Reduced from 7.2 MB to 3.1 MB to fit the 5 MB limit."
  );
});

test("only formats a browser can re-encode count as shrinkable", () => {
  for (const t of ["image/jpeg", "image/png", "image/webp", "image/JPEG"]) {
    assert.equal(isShrinkableImage(t), true, t);
  }
  // HEIC needs a decoder no browser ships; a PDF cannot be resized at all.
  for (const t of ["image/heic", "image/heif", "application/pdf", "application/msword", "text/csv"]) {
    assert.equal(isShrinkableImage(t), false, t);
  }
});

test("a phone capture with no reported type falls back to its extension", () => {
  assert.equal(isShrinkableImage("", "IMG_0421.JPG"), true);
  assert.equal(isShrinkableImage(null, "scan.png"), true);
  assert.equal(isShrinkableImage(undefined, "passport.heic"), false);
  assert.equal(isShrinkableImage("", "bank.pdf"), false);
  assert.equal(isShrinkableImage("", "no-extension"), false);
});

test("a reported type wins over a misleading extension", () => {
  // A PDF saved as "scan.jpg" must not be handed to a canvas.
  assert.equal(isShrinkableImage("application/pdf", "scan.jpg"), false);
});

test("a codec suffix on the type does not break the check", () => {
  assert.equal(isShrinkableImage("image/jpeg; charset=binary"), true);
});

test("a file that cannot be shrunk says what to do about it instead", () => {
  assert.match(reduceHint("application/pdf"), /compress-PDF tool/);
  assert.match(reduceHint("", "statement.pdf"), /compress-PDF tool/);
  assert.match(reduceHint("image/heic"), /Most Compatible/);
  assert.match(reduceHint("", "photo.HEIF"), /Most Compatible/);
  assert.match(reduceHint("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx"), /save it as a PDF/);
  assert.equal(reduceHint("image/jpeg", "a.jpg"), null, "a shrinkable image needs no advice");
});
