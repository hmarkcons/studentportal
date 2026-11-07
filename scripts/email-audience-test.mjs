// Email campaigns, part 2 (0355): who a campaign reaches.
//
// What these guard against: an unsubscribed or bounced address being emailed
// because it is also on a list; the same person getting two copies; a lead
// marked Not interested being emailed by default; a topic someone opted out of
// reaching them anyway; a rule set posted from the builder carrying a field or
// value the evaluator does not know; and a spreadsheet's bad rows or repeated
// addresses getting through.
import test from "node:test";
import assert from "node:assert/strict";
import {
  countriesOf,
  matchesRule,
  matchesRuleSet,
  normalizeEmail,
  resolveAudience,
  suppressedTotal,
  validateRuleSet,
} from "../src/lib/emailCampaigns/audience.ts";
import { guessEmailColumn, guessMapping, readImportRows } from "../src/lib/emailCampaigns/contactImport.ts";

const NOW = new Date("2026-11-07T10:00:00+05:00");
let n = 0;
const lead = (over = {}) => ({
  key: `lead:${++n}`,
  kind: "lead",
  id: String(n),
  email: `p${n}@example.com`,
  fullName: `Person ${n}`,
  country: "germany",
  city: "Karachi",
  intake: "",
  leadStatus: "in_discussion",
  level: "masters",
  source: "ig",
  counsellorId: "c1",
  enquiredAt: "2026-10-01T09:00:00+05:00",
  hasApplication: false,
  applicationStages: [],
  lists: [],
  ...over,
});
const contact = (over = {}) => ({ ...lead(over), kind: "contact", key: `contact:${n}`, leadStatus: null, counsellorId: null, source: "Imported", ...over });

// ------------------------------------------------------------------ addresses

test("an address is trimmed, lower-cased and checked", () => {
  assert.equal(normalizeEmail("  Ali.Khan@Example.COM "), "ali.khan@example.com");
  assert.equal(normalizeEmail("<sara@x.pk>"), "sara@x.pk");
  for (const bad of ["", "ali", "ali@", "@x.com", "ali@x", "a b@x.com", "ali@@x.com", "ali..k@x.com", null]) assert.equal(normalizeEmail(bad), null, String(bad));
});

test("countries are read out of the free-text field", () => {
  assert.deepEqual(countriesOf("germany"), ["germany"]);
  assert.deepEqual(countriesOf("Italy (Public)"), ["italy"]);
  assert.deepEqual(countriesOf("Germany, Austria and Italy"), ["germany", "austria", "italy"]);
  assert.deepEqual(countriesOf(""), []);
});

// ------------------------------------------------------------------ rules

test("rules: country, city (any case), status, counsellor, lists", () => {
  const p = lead({ country: "Italy (Public)", city: "karachi", lists: ["L1"] });
  assert.equal(matchesRule(p, { field: "country", op: "contains_any", value: ["italy", "france"] }), true);
  assert.equal(matchesRule(p, { field: "country", op: "contains_any", value: ["uk"] }), false);
  assert.equal(matchesRule(lead({ country: "ukraine" }), { field: "country", op: "contains_any", value: ["uk"] }), false, "a whole country, not part of one");
  assert.equal(matchesRule(p, { field: "country", op: "contains_none", value: ["italy"] }), false);
  assert.equal(matchesRule(p, { field: "city", op: "is_any", value: ["Karachi"] }), true);
  assert.equal(matchesRule(p, { field: "lead_status", op: "is_none", value: ["not_interested"] }), true);
  assert.equal(matchesRule(p, { field: "counsellor", op: "is_any", value: ["c1"] }), true);
  assert.equal(matchesRule(lead({ counsellorId: null }), { field: "counsellor", op: "is_empty" }), true);
  assert.equal(matchesRule(p, { field: "list", op: "is_any", value: ["L1"] }), true);
  assert.equal(matchesRule(p, { field: "list", op: "is_none", value: ["L1"] }), false);
});

test("rules: dates are Karachi days, and days count back from now", () => {
  const p = lead({ enquiredAt: "2026-10-01T09:00:00+05:00" });
  assert.equal(matchesRule(p, { field: "enquired", op: "within_days", value: 40 }, NOW), true);
  assert.equal(matchesRule(p, { field: "enquired", op: "within_days", value: 30 }, NOW), false);
  assert.equal(matchesRule(p, { field: "enquired", op: "older_than_days", value: 30 }, NOW), true);
  assert.equal(matchesRule(p, { field: "enquired", op: "after", value: "2026-10-01" }, NOW), true);
  assert.equal(matchesRule(p, { field: "enquired", op: "before", value: "2026-10-01" }, NOW), false);
  assert.equal(matchesRule(lead({ enquiredAt: "2026-09-30T20:00:00Z" }), { field: "enquired", op: "after", value: "2026-10-01" }, NOW), true, "8pm UTC on the 30th is the 1st in Karachi");
});

test("rules: registered, applications and their stages, intake, contact type", () => {
  assert.equal(matchesRule(lead({ leadStatus: "registered" }), { field: "registered", op: "is_true" }), true);
  assert.equal(matchesRule(lead(), { field: "registered", op: "is_false" }), true);
  const withApp = lead({ hasApplication: true, applicationStages: ["applied", "offer_received"] });
  assert.equal(matchesRule(withApp, { field: "has_application", op: "is_true" }), true);
  assert.equal(matchesRule(withApp, { field: "application_stage", op: "is_any", value: ["offer_received"] }), true);
  assert.equal(matchesRule(lead({ intake: "September/Fall 2027" }), { field: "intake", op: "contains", value: "2027" }), true);
  assert.equal(matchesRule(lead(), { field: "intake", op: "is_empty" }), true);
  assert.equal(matchesRule(contact(), { field: "contact_type", op: "is_any", value: ["contact"] }), true);
});

test("rule sets: all, any, and none meaning everyone", () => {
  const p = lead({ country: "italy", city: "Lahore" });
  const italy = { field: "country", op: "contains_any", value: ["italy"] };
  const karachi = { field: "city", op: "is_any", value: ["karachi"] };
  assert.equal(matchesRuleSet(p, { match: "all", rules: [italy, karachi] }), false);
  assert.equal(matchesRuleSet(p, { match: "any", rules: [italy, karachi] }), true);
  assert.equal(matchesRuleSet(p, { match: "all", rules: [] }), true);
});

test("a rule set from the builder is checked before use", () => {
  assert.deepEqual(validateRuleSet('{"match":"any","rules":[{"field":"country","op":"contains_any","value":["italy","italy"," "]}]}'), {
    match: "any",
    rules: [{ field: "country", op: "contains_any", value: ["italy"] }],
  });
  assert.deepEqual(validateRuleSet({ match: "all", rules: [{ field: "registered", op: "is_true", value: "ignored" }] }), { match: "all", rules: [{ field: "registered", op: "is_true" }] });
  const bad = [
    "not json",
    { match: "most", rules: [] },
    { match: "all", rules: [{ field: "salary", op: "is_any", value: ["x"] }] },
    { match: "all", rules: [{ field: "country", op: "within_days", value: 3 }] },
    { match: "all", rules: [{ field: "country", op: "contains_any", value: [] }] },
    { match: "all", rules: [{ field: "enquired", op: "within_days", value: 0 }] },
    { match: "all", rules: [{ field: "enquired", op: "after", value: "yesterday" }] },
    { match: "all", rules: Array.from({ length: 31 }, () => ({ field: "registered", op: "is_true" })) },
  ];
  for (const b of bad) assert.ok("error" in validateRuleSet(b), JSON.stringify(b).slice(0, 80));
});

// ------------------------------------------------------------------ resolving an audience

test("audience: one per address, the lead's record first", () => {
  const a = lead({ email: "same@x.com", fullName: "Lead Ali" });
  const b = contact({ email: "same@x.com", fullName: "Imported Ali" });
  const { recipients, counts } = resolveAudience({ contacts: [b, a], include: { all: true, segments: [], lists: [] }, statuses: new Map() });
  assert.deepEqual(recipients.map((r) => r.fullName), ["Lead Ali"]);
  assert.equal(counts.duplicates, 1);
});

test("audience: the do-not-email list wins over a list or segment", () => {
  const people = [lead({ email: "u@x.com", lists: ["L1"] }), lead({ email: "b@x.com", lists: ["L1"] }), lead({ email: "ok@x.com", lists: ["L1"] })];
  const statuses = new Map([
    ["u@x.com", { status: "unsubscribed", topics: [] }],
    ["b@x.com", { status: "bounced", topics: [] }],
  ]);
  const { recipients, counts } = resolveAudience({ contacts: people, include: { segments: [], lists: ["L1"] }, statuses });
  assert.deepEqual(recipients.map((r) => r.email), ["ok@x.com"]);
  assert.deepEqual(counts.suppressed, { unsubscribed: 1, bounced: 1 });
  assert.equal(suppressedTotal(counts), 2);
});

test("audience: Not interested and Not eligible leads are left out unless asked for", () => {
  const people = [lead({ leadStatus: "not_interested" }), lead({ leadStatus: "not_eligible" }), lead({ leadStatus: "registered" })];
  const all = { all: true, segments: [], lists: [] };
  assert.equal(resolveAudience({ contacts: people, include: all, statuses: new Map() }).counts.skippedLeadStatus, 2);
  assert.equal(resolveAudience({ contacts: people, include: all, statuses: new Map(), skipLeadStatuses: [] }).recipients.length, 3);
});

test("audience: a topic someone opted out of does not reach them; no topics chosen means all", () => {
  const people = [lead({ email: "all@x.com" }), lead({ email: "italy@x.com" }), lead({ email: "germany@x.com" })];
  const statuses = new Map([
    ["italy@x.com", { status: "subscribed", topics: ["italy"] }],
    ["germany@x.com", { status: "subscribed", topics: ["germany"] }],
  ]);
  const { recipients, counts } = resolveAudience({ contacts: people, include: { all: true, segments: [], lists: [] }, statuses, topic: "italy" });
  assert.deepEqual(recipients.map((r) => r.email), ["all@x.com", "italy@x.com"]);
  assert.equal(counts.topicOptOut, 1);
});

test("audience: segments and lists add up, exclusions come off, bad addresses are counted", () => {
  const people = [
    lead({ email: "it@x.com", country: "italy" }),
    lead({ email: "de@x.com", country: "germany", lists: ["VIP"] }),
    lead({ email: "fr@x.com", country: "france" }),
    lead({ email: null, country: "italy" }),
    lead({ email: "staff@x.com", country: "italy", lists: ["Staff"] }),
  ];
  const italy = { match: "all", rules: [{ field: "country", op: "contains_any", value: ["italy"] }] };
  const { recipients, counts } = resolveAudience({
    contacts: people,
    include: { segments: [italy], lists: ["VIP"] },
    exclude: { segments: [], lists: ["Staff"] },
    statuses: new Map(),
  });
  assert.deepEqual(recipients.map((r) => r.email).sort(), ["de@x.com", "it@x.com"]);
  assert.equal(counts.matched, 4);
  assert.equal(counts.excluded, 1);
  assert.equal(counts.invalid, 1);
  assert.equal(counts.final, 2);
});

// ------------------------------------------------------------------ importing a spreadsheet

test("import: columns are guessed from the headers, or from what looks like addresses", () => {
  assert.deepEqual(guessMapping(["Full Name", "E-mail", "City", "Preferred Country", "Intake"]), { full_name: 0, email: 1, city: 2, country: 3, intake: 4 });
  assert.deepEqual(guessMapping(["First_Name", "Surname", "Email Address"]), { first_name: 0, last_name: 1, email: 2 });
  assert.equal(guessEmailColumn([["Ali", "ali@x.com"], ["Sara", "sara@x.com"], ["Zed", "not given"]]), 1);
  assert.equal(guessEmailColumn([["Ali", "123"]]), undefined);
});

test("import: rows read into contacts; bad rows listed with their line; repeats kept once", () => {
  const rows = [
    ["Ali", "Khan", "ALI@X.COM", "Italy"],
    ["Sara", "", "not-an-email", ""],
    ["", "", "", ""],
    ["Ali again", "", "ali@x.com", ""],
    ["Zed", "", "", ""],
  ];
  const r = readImportRows(rows, { first_name: 0, last_name: 1, email: 2, country: 3 });
  assert.deepEqual(r.contacts, [{ email: "ali@x.com", fullName: "Ali Khan", country: "Italy", city: null, intake: null }]);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.problems, [
    { line: 3, value: "not-an-email", reason: "not an email address" },
    { line: 6, value: "", reason: "no email address" },
  ]);
});
