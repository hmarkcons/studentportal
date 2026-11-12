// Email campaigns: what the brief asked of Phases 2–5 and was added after
// (0360) — segments on email activity, spreading a send over hours, the
// sending domain's DNS check, the day-by-day chart, time on site, and the
// Reports tab's sorting and export.
//
// What these guard against: a practice send or a machine's open counting as
// engagement; "not engaged" catching people who were never sent anything;
// a spread campaign going out in its first minute, or never catching up; a
// DNS check passing a record that points somewhere else, failing an inherited
// DMARC policy, or tripping over a missing record; a quiet day vanishing from
// the chart; and a sort that puts a campaign with nothing sent at the top.
import test from "node:test";
import assert from "node:assert/strict";
import { matchesRule, validateRuleSet, FIELDS, NO_VALUE_OPS, DAY_OPS } from "../src/lib/emailCampaigns/audience.ts";
import { spreadAllowance } from "../src/lib/emailCampaigns/sendingRules.ts";
import { allPass, checkRecords, domainOf, expectedRecords, normalizeDomain, parentDomain, parseDkimTokens } from "../src/lib/emailCampaigns/dnsCheck.ts";
import {
  CAMPAIGN_EXPORT_HEADER,
  campaignExportRow,
  campaignSort,
  daysSince,
  durationText,
  fillDays,
  sortCampaigns,
} from "../src/lib/emailCampaigns/reportRules.ts";

const NOW = new Date("2026-11-12T10:00:00+05:00");
const person = (engagement) => ({
  key: "lead:1",
  kind: "lead",
  id: "1",
  email: "p@example.com",
  fullName: "P",
  country: "",
  city: "",
  intake: "",
  leadStatus: "in_discussion",
  level: "",
  source: "",
  counsellorId: null,
  enquiredAt: null,
  hasApplication: false,
  applicationStages: [],
  lists: [],
  engagement,
});
const sent = (over = {}) => ({ received: 2, lastSentAt: "2026-11-01T05:00:00Z", lastOpened: false, lastClicked: false, everOpened: false, everClicked: false, lastEngagedAt: null, ...over });
const rule = (op, value) => ({ field: "engagement", op, ...(value === undefined ? {} : { value }) });
const is = (c, op, value) => matchesRule(c, rule(op, value), NOW);

// ---- segments on email activity --------------------------------------------

test("email activity: the last campaign they got", () => {
  const openedClicked = person(sent({ lastOpened: true, lastClicked: true, everOpened: true, everClicked: true, lastEngagedAt: "2026-11-01T06:00:00Z" }));
  const openedOnly = person(sent({ lastOpened: true, everOpened: true, lastEngagedAt: "2026-11-01T06:00:00Z" }));
  const ignored = person(sent({ everOpened: true, lastEngagedAt: "2026-06-01T06:00:00Z" }));
  assert.equal(is(openedClicked, "opened_last"), true);
  assert.equal(is(openedClicked, "clicked_last"), true);
  assert.equal(is(openedOnly, "clicked_last"), false);
  assert.equal(is(ignored, "opened_last"), false);
  assert.equal(is(ignored, "not_opened_last"), true);
  assert.equal(is(ignored, "never_opened"), false, "opened an earlier one");
  assert.equal(is(openedOnly, "not_opened_last"), false);
});

test("email activity: never sent one is its own thing, not 'did not open'", () => {
  const never = person(null);
  const noRecord = person(undefined);
  for (const p of [never, noRecord]) {
    assert.equal(is(p, "never_emailed"), true);
    assert.equal(is(p, "not_opened_last"), false);
    assert.equal(is(p, "never_opened"), false);
    assert.equal(is(p, "not_engaged_days", 90), false, "not engaged means sent something and ignored it");
    assert.equal(is(p, "opened_last"), false);
  }
  assert.equal(is(person(sent()), "never_emailed"), false);
  assert.equal(is(person(sent()), "never_opened"), true);
});

test("email activity: engaged in, or not for, a number of days", () => {
  const recent = person(sent({ everOpened: true, lastEngagedAt: "2026-11-05T06:00:00Z" }));
  const stale = person(sent({ everOpened: true, lastEngagedAt: "2026-05-01T06:00:00Z" }));
  const silent = person(sent());
  assert.equal(is(recent, "engaged_within_days", 30), true);
  assert.equal(is(stale, "engaged_within_days", 30), false);
  assert.equal(is(recent, "not_engaged_days", 90), false);
  assert.equal(is(stale, "not_engaged_days", 90), true);
  assert.equal(is(silent, "not_engaged_days", 90), true, "sent, and never engaged");
  // Engaged without a real send (a test, a practice link): counts as engaged, never as "not engaged".
  const testedOnly = person({ received: 0, lastSentAt: null, lastOpened: false, lastClicked: false, everOpened: false, everClicked: false, lastEngagedAt: "2026-11-10T06:00:00Z" });
  assert.equal(is(testedOnly, "engaged_within_days", 7), true);
  assert.equal(is(testedOnly, "not_engaged_days", 1), false);
  assert.equal(is(testedOnly, "never_emailed"), true);
});

test("email activity: the builder's rules are checked, days where days are needed", () => {
  assert.ok(FIELDS.engagement.ops.every((op) => NO_VALUE_OPS.includes(op) || DAY_OPS.includes(op)), "every op either takes days or nothing");
  assert.deepEqual(validateRuleSet({ match: "all", rules: [rule("opened_last", "junk")] }), { match: "all", rules: [{ field: "engagement", op: "opened_last" }] }, "a stray value is dropped");
  assert.deepEqual(validateRuleSet({ match: "all", rules: [rule("not_engaged_days", "90")] }), { match: "all", rules: [{ field: "engagement", op: "not_engaged_days", value: 90 }] });
  assert.match(validateRuleSet({ match: "all", rules: [rule("engaged_within_days", 0)] }).error, /number of days/);
  assert.match(validateRuleSet({ match: "all", rules: [{ field: "engagement", op: "is_any", value: ["x"] }] }).error, /choose how/);
});

// ---- spreading a send over hours ---------------------------------------------

test("spread: a share of the time gone, catching up after a slow minute, never more than all", () => {
  const startedAt = "2026-11-12T05:00:00.000Z";
  const at = (minutes) => new Date(Date.parse(startedAt) + minutes * 60_000);
  assert.equal(spreadAllowance({ total: 6000, done: 0, startedAt, now: at(0), hours: 10 }), 10, "the first minute's share");
  assert.equal(spreadAllowance({ total: 6000, done: 10, startedAt, now: at(1), hours: 10 }), 10);
  assert.equal(spreadAllowance({ total: 6000, done: 10, startedAt, now: at(5), hours: 10 }), 50, "a missed run is made up");
  assert.equal(spreadAllowance({ total: 6000, done: 3000, startedAt, now: at(299), hours: 10 }), 0, "ahead of time: wait");
  assert.equal(spreadAllowance({ total: 6000, done: 5990, startedAt, now: at(900), hours: 10 }), 10, "past the end: the rest");
  assert.equal(spreadAllowance({ total: 7, done: 0, startedAt, now: at(0), hours: 1 }), 1, "a small campaign still starts");
  assert.equal(spreadAllowance({ total: 6000, done: 0, startedAt, now: at(0), hours: null }), Infinity, "no spread: no limit");
  assert.equal(spreadAllowance({ total: 6000, done: 0, startedAt: null, now: at(0), hours: 4 }), Infinity);
});

// ---- the sending domain's DNS -----------------------------------------------

test("domains and tokens as typed", () => {
  assert.equal(normalizeDomain(" News.HMARKconsultants.com. "), "news.hmarkconsultants.com");
  assert.equal(normalizeDomain("https://news.hmarkconsultants.com/x"), "news.hmarkconsultants.com");
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(normalizeDomain("bad domain.com"), null);
  assert.equal(domainOf("news@News.hmarkconsultants.com"), "news.hmarkconsultants.com");
  assert.equal(domainOf(null), null);
  assert.equal(parentDomain("news.hmarkconsultants.com"), "hmarkconsultants.com");
  assert.equal(parentDomain("hmarkconsultants.com"), null);
  const t = "abcdefghijklmnopqrstuvwxyz123456";
  assert.deepEqual(parseDkimTokens(`${t}\n${t}._domainkey.news.hmarkconsultants.com, ${t.replace("a", "b")}.dkim.amazonses.com`), { tokens: [t, t.replace("a", "b")] });
  assert.match(parseDkimTokens("not-a-token").error, /not a DKIM token/);
  assert.deepEqual(parseDkimTokens(""), { tokens: [] });
});

const D = "news.hmarkconsultants.com";
const T = ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccccccccccc"];
const fakeDns = (zone) => {
  const miss = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  return {
    cname: (n) => (zone.cname?.[n] ? Promise.resolve(zone.cname[n]) : miss()),
    mx: (n) => (zone.mx?.[n] ? Promise.resolve(zone.mx[n]) : miss()),
    txt: (n) => (zone.txt?.[n] ? Promise.resolve(zone.txt[n]) : miss()),
  };
};
const good = {
  cname: Object.fromEntries(T.map((t) => [`${t}._domainkey.${D}`, [`${t}.dkim.amazonses.com.`]])),
  mx: { [`bounce.${D}`]: [{ exchange: "feedback-smtp.ap-southeast-2.amazonses.com", priority: 10 }] },
  txt: { [`bounce.${D}`]: [["v=spf1 include:amazon", "ses.com ~all"]], [`_dmarc.${D}`]: [["v=DMARC1; p=none; rua=mailto:x@hmarkconsultants.com"]] },
};

test("DNS: the records SES needs, named for the domain and region", () => {
  const r = expectedRecords({ domain: D, region: "ap-southeast-2", dkimTokens: T });
  assert.deepEqual(r.map((x) => [x.type, x.name]), [
    ["CNAME", `${T[0]}._domainkey.${D}`],
    ["CNAME", `${T[1]}._domainkey.${D}`],
    ["CNAME", `${T[2]}._domainkey.${D}`],
    ["MX", `bounce.${D}`],
    ["TXT", `bounce.${D}`],
    ["TXT", `_dmarc.${D}`],
  ]);
  assert.equal(r[3].value, "10 feedback-smtp.ap-southeast-2.amazonses.com");
  assert.equal(expectedRecords({ domain: D, region: "eu-west-1", dkimTokens: [] }).filter((x) => x.kind === "dkim").length, 3, "placeholders until Amazon gives tokens");
});

test("DNS: everything in place passes (SPF split across strings is joined)", async () => {
  const checks = await checkRecords(expectedRecords({ domain: D, region: "ap-southeast-2", dkimTokens: T }), fakeDns(good), { domain: D, hasTokens: true });
  assert.deepEqual(checks.map((c) => c.status), ["pass", "pass", "pass", "pass", "pass", "pass"]);
  assert.equal(allPass(checks), true);
  assert.match(checks[5].note, /p=none/);
});

test("DNS: missing, wrong, doubled and inherited records", async () => {
  const zone = structuredClone(good);
  delete zone.cname[`${T[1]}._domainkey.${D}`];
  zone.cname[`${T[2]}._domainkey.${D}`] = ["somewhere-else.example.com."];
  zone.txt[`bounce.${D}`] = [["v=spf1 include:amazonses.com ~all"], ["v=spf1 include:_spf.google.com ~all"]];
  delete zone.txt[`_dmarc.${D}`];
  zone.txt["_dmarc.hmarkconsultants.com"] = [["v=DMARC1; p=quarantine"]];
  delete zone.mx[`bounce.${D}`];
  const checks = await checkRecords(expectedRecords({ domain: D, region: "ap-southeast-2", dkimTokens: T }), fakeDns(zone), { domain: D, hasTokens: true });
  const by = (i) => checks[i];
  assert.equal(by(0).status, "pass");
  assert.equal(by(1).status, "fail", "missing");
  assert.equal(by(2).status, "fail", "points elsewhere");
  assert.deepEqual(by(2).found, ["somewhere-else.example.com"]);
  assert.equal(by(3).status, "fail", "no MX");
  assert.equal(by(4).status, "fail", "two SPF records");
  assert.match(by(4).note, /only one/);
  assert.equal(by(5).status, "pass", "the parent's DMARC covers a subdomain");
  assert.match(by(5).note, /Covered by hmarkconsultants\.com/);
  assert.equal(allPass(checks), false);
});

test("DNS: no tokens yet means waiting, not failing", async () => {
  const checks = await checkRecords(expectedRecords({ domain: D, region: "ap-southeast-2", dkimTokens: [] }), fakeDns(good), { domain: D, hasTokens: false });
  assert.deepEqual(checks.filter((c) => c.kind === "dkim").map((c) => c.status), ["waiting", "waiting", "waiting"]);
  assert.equal(allPass(checks), false);
});

// ---- reports ----------------------------------------------------------------

test("day by day: every Karachi day, quiet ones as zeros", () => {
  const filled = fillDays([{ day: "2026-11-03", opens: 4, clicks: 1, visits: 0 }], "2026-11-01", 4);
  assert.deepEqual(filled.map((d) => [d.day, d.opens]), [["2026-11-01", 0], ["2026-11-02", 0], ["2026-11-03", 4], ["2026-11-04", 0]]);
  assert.equal(daysSince(new Date("2026-11-01T20:00:00Z"), new Date("2026-11-02T05:00:00Z")), 1, "the same Karachi day");
  assert.equal(daysSince(new Date("2026-11-01T05:00:00Z"), new Date("2026-11-05T05:00:00Z")), 5);
  assert.equal(daysSince(new Date("2026-01-01T05:00:00Z"), new Date("2026-11-05T05:00:00Z")), 60, "at most 60");
});

const row = (over) => ({ id: "x", name: "X", practice: false, started_at: "2026-11-01T05:00:00Z", sent: 100, delivered: 100, opened: 30, clicked: 5, visited: 2, converted: 1, bounced: 1, unsubscribed: 0, complaints: 0, ...over });

test("the Reports tab sorts by rate where it shows a rate; nothing sent sinks", () => {
  const rows = [
    row({ id: "big", name: "Big", sent: 10000, delivered: 10000, opened: 2000, started_at: "2026-11-02T05:00:00Z" }),
    row({ id: "small", name: "small", sent: 100, delivered: 100, opened: 40, started_at: "2026-11-01T05:00:00Z" }),
    row({ id: "none", name: "Empty", sent: 0, delivered: 0, opened: 0, started_at: "2026-11-03T05:00:00Z" }),
  ];
  assert.deepEqual(sortCampaigns(rows, "opened", "desc").map((r) => r.id), ["small", "big", "none"], "40% before 20%, by rate not count");
  assert.deepEqual(sortCampaigns(rows, "sent", "desc").map((r) => r.id), ["big", "small", "none"]);
  assert.deepEqual(sortCampaigns(rows, "started", "desc").map((r) => r.id), ["none", "big", "small"]);
  assert.deepEqual(sortCampaigns(rows, "name", "asc").map((r) => r.id), ["big", "none", "small"], "names ignore case");
  assert.equal(campaignSort("nonsense"), "started");
  assert.equal(campaignSort("bounced"), "bounced");
});

test("the Reports tab's export: a row each, in the header's order", () => {
  const r = campaignExportRow(row({ name: "Italy", practice: true, started_at: "2026-11-01T05:00:00Z" }));
  assert.equal(r.length, CAMPAIGN_EXPORT_HEADER.length);
  const at = (h) => r[CAMPAIGN_EXPORT_HEADER.indexOf(h)];
  assert.equal(at("Campaign"), "Italy");
  assert.equal(at("Practice"), "yes");
  assert.equal(at("Started"), "2026-11-01 10:00");
  assert.equal(at("Opened %"), "30.0%");
  assert.equal(at("Bounced %"), "1.0%");
  assert.equal(campaignExportRow(row({ sent: 0, delivered: 0 }))[CAMPAIGN_EXPORT_HEADER.indexOf("Opened %")], "", "no rate without a send");
});

test("time on site", () => {
  assert.equal(durationText(38), "38s");
  assert.equal(durationText(245), "4m 05s");
  assert.equal(durationText(3720), "1h 02m");
  assert.equal(durationText(null), "—");
  assert.equal(durationText(Number.NaN), "—");
});
