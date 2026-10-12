// A student's Gmail recovery details (src/lib/gmailRecovery.ts, 0332).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupCodesFileError,
  countBackupCodes,
  parseBackupCodes,
  recoveryEmailError,
  parseRecoveryDetails,
  mergeRecovery,
  withoutPart,
  onFileSummary,
  partsOnFile,
  codesDownloadName,
  statusFromRow,
  BACKUP_CODES_MAX_BYTES,
} from "../src/lib/gmailRecovery.ts";

// As Google writes it, two columns of five, with a Windows line ending and a byte-order mark.
const GOOGLE_FILE =
  "﻿SAVE YOUR BACKUP CODES\r\nKeep these backup codes somewhere safe but accessible.\r\n\r\n" +
  "1. 1234 5678\t\t2. 2345 6789\r\n3. 3456 7890\t\t4. 4567 8901\r\n5. 5678 9012\t\t6. 6789 0123\r\n" +
  "7. 7890 1234\t\t8. 8901 2345\r\n9. 9012 3456\t\t10. 0123 4567\r\n\r\n(student.name@gmail.com)\r\n\r\n" +
  "* You can only use each backup code once.\r\n* These codes were generated on: Oct 12, 2026\r\n";

test("Google's file is read as ten codes, tidied", () => {
  const parsed = parseBackupCodes(GOOGLE_FILE);
  assert.ok("text" in parsed);
  assert.equal(parsed.count, 10);
  assert.ok(parsed.text.startsWith("SAVE YOUR BACKUP CODES\n"), "no byte-order mark, no carriage returns");
  assert.ok(!parsed.text.includes("\r"));
});

test("codes run together count too; a year or a phone number does not", () => {
  assert.equal(countBackupCodes("12345678\n87654321"), 2);
  assert.equal(countBackupCodes("generated on Oct 12, 2026"), 0);
  assert.equal(countBackupCodes("+92 300 1234567"), 0);
  assert.equal(countBackupCodes("123456789"), 0, "nine digits is not a code");
});

test("the wrong text file is refused, not kept", () => {
  assert.match(parseBackupCodes("Dear student, welcome").error, /No backup codes/);
  assert.match(parseBackupCodes("   \n ").error, /empty/);
  assert.match(parseBackupCodes("PK\u0003\u0004 1234 5678").error, /not a text file/);
});

test("only a small .txt can be the codes file", () => {
  assert.equal(backupCodesFileError({ name: "Backup-codes-ali.txt", size: 600 }), null);
  assert.equal(backupCodesFileError({ name: "CODES.TXT", size: 600 }), null);
  assert.match(backupCodesFileError({ name: "codes.pdf", size: 600 }), /\.txt/);
  assert.match(backupCodesFileError({ name: "codes.txt", size: 0 }), /empty/);
  assert.match(backupCodesFileError({ name: "codes.txt", size: BACKUP_CODES_MAX_BYTES + 1 }), /too large/);
});

test("a recovery email is one address", () => {
  assert.equal(recoveryEmailError("ali.khan@yahoo.com"), null);
  assert.equal(recoveryEmailError(""), null, "blank keeps what is saved");
  assert.ok(recoveryEmailError("ali.khan"));
  assert.ok(recoveryEmailError("a@x.com, b@x.com"));
  assert.ok(recoveryEmailError("ali khan@yahoo.com"));
});

test("a blank field keeps what is saved, and a new file replaces the codes", () => {
  const stored = { email: "old@x.com", phone: "+92 300 1111111", codes: "1111 2222", codesFileName: "old.txt" };
  assert.deepEqual(mergeRecovery(stored, { email: " ", phone: "", codes: null }), stored);
  assert.deepEqual(mergeRecovery(stored, { email: "new@x.com", codes: { text: "3333 4444", fileName: "new.txt" } }), {
    email: "new@x.com",
    phone: "+92 300 1111111",
    codes: "3333 4444",
    codesFileName: "new.txt",
  });
});

test("removing the codes takes their file name with them", () => {
  const stored = { email: "a@x.com", phone: null, codes: "1111 2222", codesFileName: "c.txt" };
  assert.deepEqual(withoutPart(stored, "codes"), { email: "a@x.com", phone: null, codes: null, codesFileName: null });
  assert.deepEqual(withoutPart(stored, "email"), { ...stored, email: null });
});

test("what read_gmail_recovery returns becomes details; anything else is nothing", () => {
  assert.deepEqual(parseRecoveryDetails({ email: "a@x.com", phone: null, codes: "1111 2222", codes_file_name: "c.txt" }), {
    email: "a@x.com",
    phone: null,
    codes: "1111 2222",
    codesFileName: "c.txt",
  });
  assert.deepEqual(parseRecoveryDetails(null), { email: null, phone: null, codes: null, codesFileName: null });
  assert.equal(parseRecoveryDetails({ email: "  " }).email, null);
});

test("what is on file is said in words", () => {
  assert.equal(onFileSummary({ hasEmail: false, hasPhone: false, hasCodes: false }), null);
  assert.equal(onFileSummary({ hasEmail: false, hasPhone: false, hasCodes: true }), "Backup codes");
  assert.equal(onFileSummary({ hasEmail: true, hasPhone: false, hasCodes: true }), "Recovery email and backup codes");
  assert.equal(onFileSummary({ hasEmail: true, hasPhone: true, hasCodes: true }), "Recovery email, recovery mobile and backup codes");
  assert.deepEqual(partsOnFile({ hasEmail: false, hasPhone: true, hasCodes: true }), ["phone", "codes"]);
});

test("the codes download under their own file name when it is a .txt", () => {
  assert.equal(codesDownloadName({ codesFileName: "Backup-codes-ali.txt" }), "Backup-codes-ali.txt");
  assert.equal(codesDownloadName({ codesFileName: null }), "gmail-backup-codes.txt");
  assert.equal(codesDownloadName({ codesFileName: "x.exe" }), "gmail-backup-codes.txt");
});

test("the status row is renamed for the page; none means the viewer cannot see the student", () => {
  assert.equal(statusFromRow(null), null);
  assert.deepEqual(
    statusFromRow({ has_email: true, has_phone: false, has_codes: true, updated_at: "2026-10-12T10:00:00Z", updated_by_name: "Imran", can_open: false }),
    { hasEmail: true, hasPhone: false, hasCodes: true, updatedAt: "2026-10-12T10:00:00Z", updatedByName: "Imran", canOpen: false },
  );
});
