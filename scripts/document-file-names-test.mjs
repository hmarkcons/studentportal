// What a stored file is called on screen, and a requirement's files (src/lib/documentFileNames.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { documentFilePath, fileDisplayName, filesOfDocument, parseSourceNames, storedFileName } from "../src/lib/documentFileNames.ts";

const ID = "1f2e3d4c-5b6a-4789-a012-3456789abcde";

test("the name a file was uploaded with, read from where it is kept", () => {
  assert.equal(storedFileName(`s/${ID}-Passport_scan.pdf`), "Passport_scan.pdf");
  assert.equal(storedFileName(`s/${ID}-v3-Passport_scan.pdf`), "Passport_scan.pdf", "the student portal's versioned name");
  assert.equal(storedFileName(`s/${ID}-offer_letter-v1-Offer.pdf`), "Offer.pdf", "a university's letter");
  assert.equal(storedFileName("leave-certificates/x/1759912345678-sick_note.jpg"), "sick_note.jpg");
  assert.equal(storedFileName(`staff-agreements/x/returned/${ID}-1759912345678-signed.pdf`), "signed.pdf");
  assert.equal(storedFileName("c/proof-1759912345678-receipt.png"), "receipt.png");
  assert.equal(storedFileName("u/exchange-list.xlsx"), "list.xlsx");
  assert.equal(storedFileName(documentFilePath("s", ID, "front side.pdf", "a1b2c3d4")), "front side.pdf", "a new upload is kept under its own name");
  assert.equal(storedFileName("2026-report.pdf"), "2026-report.pdf", "a short number is part of the name");
  assert.equal(storedFileName(null), "file");
});

test("a joined file says what it was made from", () => {
  assert.equal(fileDisplayName("passport.pdf"), "passport.pdf");
  assert.equal(fileDisplayName("passport (+1 joined).pdf", ["front.jpg", "back.jpg"]), "passport (+1 joined).pdf — joined from 2 files: front.jpg, back.jpg");
  assert.deepEqual(parseSourceNames('["front.jpg","back.jpg"]'), ["front.jpg", "back.jpg"]);
  assert.equal(parseSourceNames('["only.jpg"]'), null, "one file is not joined");
  assert.equal(parseSourceNames("not json"), null);
  assert.equal(parseSourceNames(""), null);
});

test("a requirement's files, and one on record from before files were kept one by one", () => {
  const own = [{ id: "f1", name: "a.pdf", sources: null, path: "s/a.pdf", status: "verified", reason: null, uploadedAt: null, uploadedByRole: "student", verifiedAt: null }];
  assert.equal(filesOfDocument({ file_path: "s/a.pdf", status: "verified" }, own).length, 1, "its own file is not listed twice");
  const legacy = filesOfDocument({ file_path: `s/${ID}-old.pdf`, status: "rejected", rejected_reason: "blurred" }, []);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].id, null);
  assert.equal(legacy[0].name, "old.pdf");
  assert.equal(legacy[0].reason, "blurred");
  assert.deepEqual(filesOfDocument({ file_path: null, status: "missing" }, []), []);
});
