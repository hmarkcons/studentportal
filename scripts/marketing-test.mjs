import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_POST_STATUSES,
  SOCIAL_POST_STATUS_LABELS,
  socialPostStatusLabel,
  isSocialPostStatus,
  isMissedPost,
  isReferralIncentiveStatus,
  amountError,
  readAmount,
  dateRangeError,
  formatAmount,
  spendState,
} from "../src/lib/marketing.ts";

// ------------------------------------------------------------- the figures
test("a negative figure is refused, and the message names the field", () => {
  // Every money column in this module was unconstrained: a negative budget, a
  // negative spend and a negative referral incentive were all accepted.
  assert.match(amountError("-100", "budget"), /budget cannot be negative/);
  assert.match(amountError("-1", "incentive"), /incentive cannot be negative/);
});

test("an unreadable figure is refused rather than silently stored as nothing", () => {
  // Number("abc") is NaN, and JSON.stringify writes NaN as null, so an ad
  // spend typed as "abc" used to be stored as "no figure recorded" and
  // reported as a success. Verified against production.
  assert.match(amountError("abc", "spend"), /not a number/);
  assert.equal(Number.isNaN(Number("abc")), true, "the premise");
});

test("blank means not known yet, which is allowed", () => {
  assert.equal(amountError(""), null);
  assert.equal(amountError(null), null);
  assert.equal(amountError(undefined), null);
  assert.equal(readAmount(""), null);
});

test("an absurd figure is caught as a likely typo", () => {
  assert.equal(amountError("999999999"), null);
  assert.match(amountError("50000000000", "budget"), /typo/);
});

test("readAmount keeps a real number and drops an unreadable one", () => {
  assert.equal(readAmount("1500.50"), 1500.5);
  assert.equal(readAmount("abc"), null);
});

// --------------------------------------------------------------- the dates
test("a campaign cannot end before it starts", () => {
  // Accepted before: December to January of the same year, which anything
  // ordering by date reads as eleven months long and running backwards.
  assert.match(dateRangeError("2026-12-01", "2026-01-01"), /ends before it starts/);
  assert.match(dateRangeError("2026-12-01", "2026-01-01", "ad campaign"), /ad campaign ends before/);
});

test("a single-day event and an open-ended one are both fine", () => {
  assert.equal(dateRangeError("2026-09-10", "2026-09-10"), null);
  assert.equal(dateRangeError("2026-09-10", null), null);
  assert.equal(dateRangeError(null, "2026-09-10"), null);
});

// -------------------------------------------------------------- the money
test("a figure is grouped and its currency named", () => {
  // Budgets were printed bare — "Budget 50000 · Spend 0" — which cannot be
  // compared down a column at a glance.
  assert.equal(formatAmount(50000), "PKR 50,000");
  assert.equal(formatAmount("1500.5"), "PKR 1,500.5");
  assert.equal(formatAmount(null), "—");
  assert.equal(formatAmount("abc"), "—");
});

test("over budget is told apart from under", () => {
  assert.deepEqual(spendState(1000, 1500), { label: "50% over budget", tone: "danger" });
  assert.deepEqual(spendState(1000, 950), { label: "95% of budget used", tone: "warning" });
  assert.deepEqual(spendState(1000, 400), { label: "40% of budget used", tone: "success" });
});

test("nothing is claimed when there is nothing to compare", () => {
  assert.equal(spendState(null, 500), null);
  assert.equal(spendState(1000, null), null);
  assert.equal(spendState(0, 0), null);
});

test("spending against a zero budget is called what it is", () => {
  assert.deepEqual(spendState(0, 250), { label: "Unbudgeted spend", tone: "danger" });
});

// ------------------------------------------------------------ content slots
test("a status the schema does not allow is refused", () => {
  // advanceSocialPostStatus took whatever the client sent.
  assert.equal(isSocialPostStatus("posted"), true);
  assert.equal(isSocialPostStatus("deleted"), false);
  assert.equal(isSocialPostStatus(""), false);
});

test("every status has a proper label", () => {
  for (const s of SOCIAL_POST_STATUSES) {
    assert.ok(SOCIAL_POST_STATUS_LABELS[s], s);
    assert.ok(!SOCIAL_POST_STATUS_LABELS[s].includes("_"), `${s} label still has an underscore`);
  }
  assert.equal(socialPostStatusLabel("brief_sent"), "Brief sent");
  // An unknown value still reads as words rather than breaking the dropdown.
  assert.equal(socialPostStatusLabel("some_new_state"), "some new state");
});

test("a slot whose date has passed unposted is a missed post", () => {
  assert.equal(isMissedPost("2026-09-01", "in_design", "2026-09-10"), true);
  assert.equal(isMissedPost("2026-09-01", "posted", "2026-09-10"), false);
  // Today is not yet missed — there is still time to post it.
  assert.equal(isMissedPost("2026-09-10", "scheduled", "2026-09-10"), false);
  assert.equal(isMissedPost("2026-09-20", "brief_sent", "2026-09-10"), false);
});

test("an incentive is either owed or paid", () => {
  assert.equal(isReferralIncentiveStatus("owed"), true);
  assert.equal(isReferralIncentiveStatus("paid"), true);
  assert.equal(isReferralIncentiveStatus("written_off"), false);
});
