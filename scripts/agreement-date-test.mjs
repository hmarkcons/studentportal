// The date an agreement carries (0310): how a posted date is read, and how
// each kind of agreement prints it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agreementDateShort,
  agreementToday,
  readAgreementDate,
  staffAgreementDateText,
  studentAgreementDateText,
} from "../src/lib/agreementDate.ts";

test("an agreement is dated today in Karachi unless another day is chosen", () => {
  // 20:30 UTC on 2 October is already 3 October in Karachi.
  assert.equal(agreementToday(new Date("2026-10-02T20:30:00Z")), "2026-10-03");
  assert.deepEqual(readAgreementDate("", "2026-10-03"), { date: "2026-10-03" });
  assert.deepEqual(readAgreementDate(null, "2026-10-03"), { date: "2026-10-03" });
});

test("any real day is accepted, past or future", () => {
  assert.deepEqual(readAgreementDate("2026-09-15", "x"), { date: "2026-09-15" });
  assert.deepEqual(readAgreementDate("2027-01-10", "x"), { date: "2027-01-10" });
});

test("a day that does not exist, or a mistyped year, is refused", () => {
  assert.ok("error" in readAgreementDate("2026-02-30", "x"));
  assert.ok("error" in readAgreementDate("15/09/2026", "x"));
  assert.match(readAgreementDate("0202-10-03", "x").error ?? "", /check the year/);
});

test("each kind of agreement prints it as it always has", () => {
  assert.equal(studentAgreementDateText("2026-10-03"), "03-October-2026");
  assert.equal(staffAgreementDateText("2026-10-03"), "3 October 2026");
  assert.equal(agreementDateShort("2026-10-03"), "3 Oct 2026");
});
