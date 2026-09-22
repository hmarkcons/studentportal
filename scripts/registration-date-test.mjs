import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGISTRATION_MIN,
  byRegistrationDate,
  registrationDateBounds,
  registrationDateError,
  registrationTimestamp,
} from "../src/lib/registrationDate.ts";

const karachiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

test("accepts a plain ISO day", () => {
  assert.equal(registrationDateError("2026-01-31"), null);
});

test("accepts today, which is the common case for a same-day import", () => {
  assert.equal(registrationDateError(karachiToday()), null);
});

test("accepts a blank, which means the day of the import", () => {
  assert.equal(registrationDateError(""), null);
  assert.equal(registrationDateError(null), null);
  assert.equal(registrationDateError(undefined), null);
});

test("rejects a date written the way a Pakistani office writes one", () => {
  // 31/01/2026 is what somebody types into a text-formatted cell. Accepting it
  // would mean guessing between day-first and month-first, and guessing wrong
  // on 03/04/2026 files the student a month out with no way to tell.
  assert.match(registrationDateError("31/01/2026") ?? "", /YYYY-MM-DD/);
  assert.match(registrationDateError("Jan 31, 2026") ?? "", /YYYY-MM-DD/);
});

test("rejects a day that does not exist, which the pattern alone allows", () => {
  assert.match(registrationDateError("2026-02-31") ?? "", /not a real date/);
  assert.match(registrationDateError("2026-13-01") ?? "", /not a real date/);
});

test("rejects a date in the future", () => {
  const [y, m, d] = karachiToday().split("-");
  assert.match(registrationDateError(`${Number(y) + 1}-${m}-${d}`) ?? "", /future/);
});

test("rejects a year typed short enough to be a mistake", () => {
  assert.match(registrationDateError("1926-01-31") ?? "", /before 2000/);
  assert.equal(registrationDateError(REGISTRATION_MIN), null);
});

test("bounds an input to the same range the server enforces", () => {
  const bounds = registrationDateBounds();
  assert.equal(bounds.min, REGISTRATION_MIN);
  assert.equal(bounds.max, karachiToday());
  assert.equal(bounds.suppressHydrationWarning, true);
});

test("stamps a day so UTC and Karachi agree which day it is", () => {
  // The whole point: the first of a month must not render as the last of the
  // previous one, or the student is filed under the wrong month in the
  // registered-students table for good.
  const stamped = registrationTimestamp("2026-01-01");
  assert.equal(new Date(stamped).toISOString().slice(0, 10), "2026-01-01");
  assert.equal(new Date(stamped).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }), "2026-01-01");
  assert.equal(new Date(stamped).toLocaleDateString("en-CA", { timeZone: "UTC" }), "2026-01-01");
});

test("stamps the last day of a month the same way", () => {
  const stamped = registrationTimestamp("2026-01-31");
  assert.equal(new Date(stamped).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }), "2026-01-31");
  assert.equal(new Date(stamped).toLocaleDateString("en-CA", { timeZone: "UTC" }), "2026-01-31");
});

test("orders a batch by registration date, earliest first", () => {
  const rows = [
    { name: "Sara", day: "2026-01-20" },
    { name: "Ali", day: "2026-01-12" },
    { name: "Bilal", day: "2026-02-02" },
  ];
  assert.deepEqual(
    byRegistrationDate(rows, (r) => r.day).map((r) => r.name),
    ["Ali", "Sara", "Bilal"]
  );
});

test("keeps the sheet's own order when two registered on the same day", () => {
  // Nothing else distinguishes them, and the order they were typed in is
  // usually the order they were processed. A sort that reshuffled ties would
  // hand out different Student IDs on a re-run of the same file.
  const rows = [
    { name: "first-in-sheet", day: "2026-01-12" },
    { name: "second-in-sheet", day: "2026-01-12" },
    { name: "third-in-sheet", day: "2026-01-12" },
  ];
  assert.deepEqual(
    byRegistrationDate(rows, (r) => r.day).map((r) => r.name),
    ["first-in-sheet", "second-in-sheet", "third-in-sheet"]
  );
});

test("does not mutate the array it was given", () => {
  const rows = [{ day: "2026-03-01" }, { day: "2026-01-01" }];
  byRegistrationDate(rows, (r) => r.day);
  assert.equal(rows[0].day, "2026-03-01");
});
