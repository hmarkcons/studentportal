import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERVIEW_PLATFORMS,
  INTERVIEW_PLATFORM_LABELS,
  INTERVIEW_STATUSES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_TONE,
  platformLabel,
  platformNeedsName,
  interviewStatusLabel,
  isUpcomingStatus,
  interviewTimes,
  localWallTimeToInstant,
  instantToLocalWallTime,
  isInterviewTimezone,
  timezoneLabel,
  interviewFieldsError,
  STUDENT_TIMEZONE,
} from "../src/lib/interviews.ts";

// ---------------------------------------------------------------- timezone
// The whole point of the feature: a university quotes its own clock, the
// student reads Karachi, and nobody should have to do the arithmetic.

test("a time quoted in Rome converts to the right instant in November", () => {
  // Rome is UTC+1 in November, so 14:00 Rome is 13:00 UTC.
  assert.equal(localWallTimeToInstant("2026-11-28T14:00", "Europe/Rome"), "2026-11-28T13:00:00.000Z");
});

test("...and the right one in July, when Rome is an hour further ahead", () => {
  // Summer time: UTC+2, so 14:00 Rome is 12:00 UTC. Converting by a fixed
  // offset would put this an hour out for half the year.
  assert.equal(localWallTimeToInstant("2026-07-28T14:00", "Europe/Rome"), "2026-07-28T12:00:00.000Z");
});

test("a time quoted in Karachi is that time, since Pakistan has no daylight saving", () => {
  assert.equal(localWallTimeToInstant("2026-11-28T14:00", "Asia/Karachi"), "2026-11-28T09:00:00.000Z");
});

test("a time west of UTC converts the other way", () => {
  // New York is UTC-5 in November: 09:00 there is 14:00 UTC.
  assert.equal(localWallTimeToInstant("2026-11-28T09:00", "America/New_York"), "2026-11-28T14:00:00.000Z");
});

test("a time on the far side of the dateline converts correctly", () => {
  // Auckland is UTC+13 in late November (summer time), so 09:00 the 28th
  // there is 20:00 UTC on the 27th — the previous day.
  const iso = localWallTimeToInstant("2026-11-28T09:00", "Pacific/Auckland");
  assert.equal(iso, "2026-11-27T20:00:00.000Z");
});

test("the conversion round-trips back to what staff typed", () => {
  for (const [local, zone] of [
    ["2026-11-28T14:00", "Europe/Rome"],
    ["2026-07-04T09:30", "America/New_York"],
    ["2026-01-15T16:45", "Australia/Sydney"],
    ["2026-06-30T23:15", "Europe/London"],
  ]) {
    const iso = localWallTimeToInstant(local, zone);
    assert.equal(instantToLocalWallTime(iso, zone), local, `${local} in ${zone}`);
  }
});

test("a malformed date and time is refused rather than guessed at", () => {
  for (const bad of ["", "2026-11-28", "28/11/2026 14:00", "not a date"]) {
    assert.equal(localWallTimeToInstant(bad, "Europe/Rome"), null, bad);
  }
});

test("both readings are shown, and they are the same instant", () => {
  // 14:00 in Rome in November is 18:00 in Karachi. Shown 24-hour: am/pm is one
  // more thing to misread on an appointment that cannot be rescheduled.
  const iso = localWallTimeToInstant("2026-11-28T14:00", "Europe/Rome");
  const t = interviewTimes(iso, "Europe/Rome");
  assert.match(t.studentTime, /Nov 28, 2026/);
  assert.match(t.studentTime, /18:00/);
  assert.equal(t.universityTime, "14:00");
  assert.equal(t.sameZone, false);
  assert.equal(t.differentDay, false);
  assert.match(t.universityZoneLabel, /Italy/);
});

test("when the university is in Pakistan, one reading is enough", () => {
  const iso = localWallTimeToInstant("2026-11-28T14:00", "Asia/Karachi");
  const t = interviewTimes(iso, "Asia/Karachi");
  assert.equal(t.sameZone, true);
  assert.equal(t.differentDay, false);
  assert.match(t.studentTime, /14:00/);
});

test("a student's reading can fall on the next day, and says so", () => {
  // 21:00 in New York on the 28th is 07:00 in Karachi on the 29th. A student
  // reading only "21:00" would show up a day late.
  const iso = localWallTimeToInstant("2026-11-28T21:00", "America/New_York");
  const t = interviewTimes(iso, "America/New_York");
  assert.match(t.studentTime, /Nov 29, 2026/, `student sees ${t.studentTime}`);
  assert.match(t.studentTime, /07:00/, "two digits, so 07:00 cannot read as the evening");
  assert.equal(t.differentDay, true);
  // The university's date comes along, or "29 Nov ... 21:00" reads as a
  // contradiction.
  assert.match(t.universityTime, /Nov 28/, `university reading was "${t.universityTime}"`);
  assert.match(t.universityTime, /21:00/);
});

test("an unknown zone falls back to the student's own rather than throwing", () => {
  const iso = localWallTimeToInstant("2026-11-28T14:00", "Asia/Karachi");
  const t = interviewTimes(iso, "Mars/Olympus_Mons");
  assert.equal(t.sameZone, true);
});

test("no time means nothing to format", () => {
  assert.equal(interviewTimes(null, "Europe/Rome"), null);
  assert.equal(interviewTimes("not a date", "Europe/Rome"), null);
});

test("the offered zones cover every destination and are all real", () => {
  for (const z of ["Asia/Karachi", "Europe/Rome", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"]) {
    assert.equal(isInterviewTimezone(z), true, z);
    // A bad IANA name throws here, which is the point of checking.
    assert.doesNotThrow(() => new Date().toLocaleString("en-US", { timeZone: z }), z);
  }
  assert.equal(isInterviewTimezone("Europe/Nowhere"), false);
  assert.equal(STUDENT_TIMEZONE, "Asia/Karachi");
  assert.match(timezoneLabel("Europe/Rome"), /Italy/);
});

// --------------------------------------------------------------- platform
test("every platform has a label", () => {
  for (const p of INTERVIEW_PLATFORMS) assert.ok(INTERVIEW_PLATFORM_LABELS[p], p);
});

test("only 'other' asks for a name, and uses it", () => {
  assert.equal(platformNeedsName("other"), true);
  assert.equal(platformNeedsName("zoom"), false);
  assert.equal(platformLabel("other", "University portal"), "University portal");
  assert.equal(platformLabel("other", "  "), "Other", "a blank name must not read as empty");
  assert.equal(platformLabel("zoom"), "Zoom");
  assert.equal(platformLabel(null), "Platform not set");
});

// ----------------------------------------------------------------- status
test("every status has a label and a tone, none shown raw", () => {
  for (const s of INTERVIEW_STATUSES) {
    assert.ok(INTERVIEW_STATUS_LABELS[s], s);
    assert.ok(INTERVIEW_STATUS_TONE[s], s);
    assert.notEqual(INTERVIEW_STATUS_LABELS[s], s, `${s} is shown raw`);
  }
});

test("a passed interview reads as success and a failed one as danger", () => {
  assert.equal(INTERVIEW_STATUS_TONE.passed, "success");
  assert.equal(INTERVIEW_STATUS_TONE.failed, "danger");
});

test("only scheduled and rescheduled count as still ahead", () => {
  assert.equal(isUpcomingStatus("scheduled"), true);
  assert.equal(isUpcomingStatus("rescheduled"), true);
  for (const done of ["completed", "passed", "failed", "cancelled"]) {
    assert.equal(isUpcomingStatus(done), false, done);
  }
});

test("a missing status reads as Scheduled rather than blank", () => {
  assert.equal(interviewStatusLabel(null), "Scheduled");
  assert.equal(interviewStatusLabel("passed"), "Passed");
  assert.equal(interviewStatusLabel("legacy"), "legacy");
});

// ------------------------------------------------------------- validation
const valid = {
  roundLabel: "Panel",
  localDateTime: "2026-11-28T14:00",
  timezone: "Europe/Rome",
  platform: "zoom",
  platformOther: "",
  status: "scheduled",
  link: "",
};

test("a complete interview passes", () => {
  assert.equal(interviewFieldsError(valid), null);
});

test("the round needs a name, so two rounds can be told apart", () => {
  assert.match(interviewFieldsError({ ...valid, roundLabel: "  " }) ?? "", /Name the round/);
});

test("a date and time is required", () => {
  assert.match(interviewFieldsError({ ...valid, localDateTime: "" }) ?? "", /date and time/);
});

test("the timezone is required, and the message says why", () => {
  const err = interviewFieldsError({ ...valid, timezone: "" });
  assert.match(err ?? "", /timezone the university quoted/);
  assert.match(err ?? "", /whose clock/);
});

test("'other' without a name is refused", () => {
  assert.match(
    interviewFieldsError({ ...valid, platform: "other", platformOther: "" }) ?? "",
    /Name the platform/
  );
  assert.equal(interviewFieldsError({ ...valid, platform: "other", platformOther: "Uni portal" }), null);
});

test("an unknown platform or status is refused", () => {
  assert.match(interviewFieldsError({ ...valid, platform: "carrier_pigeon" }) ?? "", /how the interview is held/);
  assert.match(interviewFieldsError({ ...valid, status: "maybe" }) ?? "", /Choose a status/);
});

test("a link has to be a link", () => {
  assert.match(interviewFieldsError({ ...valid, link: "zoom.us/j/123" }) ?? "", /http/);
  assert.equal(interviewFieldsError({ ...valid, link: "https://zoom.us/j/123" }), null);
});
