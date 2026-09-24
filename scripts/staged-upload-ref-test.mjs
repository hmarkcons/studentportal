import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGING_BUCKET,
  STAGING_VIDEO_BUCKET,
  makeStagedRef,
  parseStagedRef,
  safeStagingName,
  stagedAtFromName,
  stagingPath,
} from "../src/lib/stagedUploadRef.ts";

const ME = "4f1c2b9e-7d7a-4d8f-9a53-2f0c6b1e8a11";
const SOMEONE_ELSE = "0a9b8c7d-1111-4222-8333-944455556666";
const NOW = 1790000000000;

const refFor = (userId, name, bucket = STAGING_BUCKET) =>
  makeStagedRef(bucket, stagingPath(userId, name, NOW, "a1b2c3d4e5f60718"), name);

// ------------------------------------------------------------ round trip

test("a reference built here reads back to the same file", () => {
  const got = parseStagedRef(refFor(ME, "Passport scan.pdf"), ME);
  assert.deepEqual(got, {
    bucket: STAGING_BUCKET,
    path: `${ME}/${NOW}-a1b2c3d4e5f60718-Passport_scan.pdf`,
    fileName: "Passport scan.pdf",
    stagedAt: NOW,
  });
});

test("the original name survives, however unusual — the path keeps a safe one", () => {
  const name = "Transcript: Final (MOFA) ✓ 2026.pdf";
  const got = parseStagedRef(refFor(ME, name), ME);
  assert.equal(got.fileName, name);
  assert.match(got.path, /^[^:]+$/, "no colon can reach the path");
  assert.doesNotMatch(got.path.split("/")[1], /[^A-Za-z0-9._-]/);
});

// ---------------------------------------------------------- what is refused

test("someone else's staged file is refused", () => {
  const theirs = refFor(SOMEONE_ELSE, "their.pdf");
  assert.ok("error" in parseStagedRef(theirs, ME));
});

test("a document field cannot take a file from the 40 MB video bucket", () => {
  const video = refFor(ME, "consent.webm", STAGING_VIDEO_BUCKET);
  assert.ok("error" in parseStagedRef(video, ME));
  assert.equal(parseStagedRef(video, ME, { allowVideo: true }).bucket, STAGING_VIDEO_BUCKET);
});

test("a bucket that is not a staging bucket is refused", () => {
  const path = stagingPath(ME, "x.pdf", NOW, "a1b2c3d4e5f60718");
  assert.ok("error" in parseStagedRef(makeStagedRef("documents", path, "x.pdf"), ME));
});

test("a path that climbs out, nests deeper or is shaped wrongly is refused", () => {
  for (const path of [
    `${ME}/../${SOMEONE_ELSE}/${NOW}-a1b2c3d4e5f60718-x.pdf`,
    `${ME}/sub/${NOW}-a1b2c3d4e5f60718-x.pdf`,
    `${ME}/x.pdf`,
    `/${ME}/${NOW}-a1b2c3d4e5f60718-x.pdf`,
    `${ME}/${NOW}-short-x.pdf`,
  ]) {
    assert.ok("error" in parseStagedRef(makeStagedRef(STAGING_BUCKET, path, "x.pdf"), ME), path);
  }
});

test("anything that is not a reference is refused, not thrown", () => {
  for (const v of ["", "staged:", "staged:upload-staging", "hello", `staged:upload-staging:${ME}/x:%E0%A4%A`]) {
    assert.ok("error" in parseStagedRef(v, ME), JSON.stringify(v));
  }
});

// ----------------------------------------------------------------- sweeping

test("a staged file's age is read from its name, and other names are left alone", () => {
  assert.equal(stagedAtFromName(`${NOW}-a1b2c3d4e5f60718-x.pdf`), NOW);
  assert.equal(stagedAtFromName("x.pdf"), null);
});

test("a name that cleans to nothing still gets one", () => {
  assert.equal(safeStagingName("✓✓✓"), "file");
  assert.equal(safeStagingName("..hidden"), "hidden");
});
