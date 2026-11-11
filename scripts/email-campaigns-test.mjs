// Email campaigns, parts 3 and 4 (0356–0358): sending and tracking.
//
// What these guard against: a click redirected to a URL taken from the click
// rather than the one stored for its link; an unsubscribe or mailto link being
// rewritten into a tracked one; the web version counting as an open; one
// recipient's merge values or tokens leaking into another's email; a send that
// outruns the hourly limit or the warm-up cap; a campaign that keeps going
// while its bounce rate climbs; Apple's privacy proxy and link scanners
// counted as people; UTM tags trampling a link's own; a forged or foreign
// webhook believed; and simulated activity that is not repeatable, or that
// says someone clicked without having opened.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { prepareCampaignHtml, renderForRecipient, recipientLinks, oneClickUrl, campaignSlug } from "../src/lib/emailCampaigns/render.ts";
import {
  clickDestination,
  isBotClick,
  isHmarkSite,
  isMachineOpen,
  parseUserAgent,
  PIXEL_GIF,
  recipientTokenOf,
} from "../src/lib/emailCampaigns/tracking.ts";
import { autoPause, bounceReason, karachiDay, MAX_ATTEMPTS, retryDelayMs, runBudget, warmupCap } from "../src/lib/emailCampaigns/sendingRules.ts";
import { campaignProblems, confirmsSend, CONFIRM_ABOVE, karachiInstant, karachiLocal, keyedLines, parseKeyedLines } from "../src/lib/emailCampaigns/campaignRules.ts";
import { seededRandom, seedOf, simulateActivity } from "../src/lib/emailCampaigns/simulate.ts";
import { isSnsUrl, parseSesEvent, snsStringToSign, verifySnsMessage } from "../src/lib/emailCampaigns/providers/sesWebhook.ts";

const SITE = "https://portal.hmarkconsultants.com";
const TOKEN_A = "a".repeat(32);
const TOKEN_B = "b".repeat(32);
const ADDRESS = "c".repeat(36);

const EMAIL = `<html><head></head><body>
<p>Hi {{first_name|there}},</p>
<a href="https://hmarkconsultants.com/study-in-italy">Study in <b>Italy</b></a>
<a href="https://example.org/fees?x=1">Fees</a>
<a href="mailto:info@hmarkconsultants.com">Write to us</a>
<a href="tel:+922100000">Call</a>
<a href="#top">Top</a>
<a href="{{unsubscribe_url}}">Unsubscribe</a>
<a href="https://hmarkconsultants.com/study-in-italy">Again</a>
</body></html>`;

// ---- render.ts ------------------------------------------------------------

test("prepare: only web links are tracked, each by its number, in order", () => {
  const { html, links } = prepareCampaignHtml(EMAIL, { trackClicks: true, trackOpens: true, preheader: "Scholarships open" });
  assert.deepEqual(
    links.map((l) => [l.position, l.url, l.label]),
    [
      [1, "https://hmarkconsultants.com/study-in-italy", "Study in Italy"],
      [2, "https://example.org/fees?x=1", "Fees"],
      [3, "https://hmarkconsultants.com/study-in-italy", "Again"],
    ]
  );
  assert.ok(html.includes('href="%%HMARK_LINK_1%%"') && html.includes('href="%%HMARK_LINK_3%%"'));
  assert.ok(!html.includes('href="https://example.org'), "a tracked URL must not stay in the email");
  for (const kept of ["mailto:info@hmarkconsultants.com", "tel:+922100000", 'href="#top"', "{{unsubscribe_url}}"]) assert.ok(html.includes(kept), kept);
  assert.ok(html.includes("%%HMARK_PIXEL%%"));
  assert.ok(html.indexOf("Scholarships open") < html.indexOf("Hi {{first_name"), "the preheader goes first");
  assert.ok(html.includes("display:none"), "and is hidden");
});

test("prepare: tracking off leaves the links and adds no pixel", () => {
  const { html, links } = prepareCampaignHtml(EMAIL, { trackClicks: false, trackOpens: false });
  assert.equal(links.length, 0);
  assert.ok(html.includes('href="https://example.org/fees?x=1"'));
  assert.ok(!html.includes("%%HMARK"));
});

test("prepare: a preheader is escaped", () => {
  const { html } = prepareCampaignHtml("<p>x</p>", { trackClicks: false, trackOpens: false, preheader: '<script>alert("x")</script>' });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

const prepared = prepareCampaignHtml(EMAIL, { trackClicks: true, trackOpens: true, preheader: "Hi" });
const render = (token, values, forWeb = false) =>
  renderForRecipient({
    preparedHtml: prepared.html,
    text: "Hi {{first_name|there}} — unsubscribe: {{unsubscribe_url}}",
    values,
    links: { site: SITE, recipientToken: token, addressToken: ADDRESS },
    campaignId: "camp-1",
    recipientId: `rcpt-${token[0]}`,
    forWeb,
  });

test("render: each recipient gets their own tracking addresses, values and headers", () => {
  const a = render(TOKEN_A, { first_name: "Ayesha" });
  const b = render(TOKEN_B, { first_name: "" });
  assert.ok(a.html.includes(`${SITE}/api/email/c/${TOKEN_A}?l=1`) && a.html.includes(`${SITE}/api/email/c/${TOKEN_A}?l=3`));
  assert.ok(a.html.includes(`${SITE}/api/email/o/${TOKEN_A}.gif`));
  assert.ok(a.html.includes("Hi Ayesha"));
  assert.ok(!a.html.includes(TOKEN_B) && !b.html.includes(TOKEN_A), "no recipient's token in another's email");
  assert.ok(b.html.includes("Hi there"), "the fallback for a blank value");
  assert.ok(!a.html.includes("%%HMARK"), "every marker replaced");
  assert.ok(a.html.includes(`${SITE}/email/unsubscribe/${ADDRESS}?r=${TOKEN_A}`), "the unsubscribe link names the address and the email");
  assert.ok(a.text.includes(`unsubscribe: ${SITE}/email/unsubscribe/${ADDRESS}?r=${TOKEN_A}`));
  assert.equal(a.headers["List-Unsubscribe"], `<${SITE}/api/email/unsubscribe/${ADDRESS}?r=${TOKEN_A}>`);
  assert.equal(a.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(a.headers["X-HMARK-Campaign-ID"], "camp-1");
  assert.equal(a.headers["X-HMARK-Recipient-ID"], "rcpt-a");
});

test("render: the web version has no pixel, so reading it is not an open", () => {
  const web = render(TOKEN_A, { first_name: "Ayesha" }, true);
  assert.ok(!web.html.includes("/api/email/o/"));
  assert.ok(!web.html.includes("%%HMARK_PIXEL"));
  assert.ok(web.html.includes(`/api/email/c/${TOKEN_A}?l=1`), "its links still count");
});

test("render: a merge value is escaped in the HTML", () => {
  const a = render(TOKEN_A, { first_name: '<img src=x onerror="alert(1)">' });
  assert.ok(!a.html.includes("<img src=x"));
});

test("recipient links and the one-click address", () => {
  const l = recipientLinks({ site: SITE, recipientToken: TOKEN_A, addressToken: ADDRESS });
  assert.equal(l.preferences_url, `${SITE}/email/preferences/${ADDRESS}`);
  assert.equal(l.web_version_url, `${SITE}/email/view/${TOKEN_A}`);
  assert.equal(oneClickUrl({ site: SITE, recipientToken: TOKEN_A, addressToken: ADDRESS }), `${SITE}/api/email/unsubscribe/${ADDRESS}?r=${TOKEN_A}`);
});

test("campaign slug", () => {
  assert.equal(campaignSlug("Italy Scholarships — Nov!"), "italy-scholarships-nov");
  assert.equal(campaignSlug("Università 2027"), "universita-2027");
  assert.equal(campaignSlug("!!!"), "campaign");
  assert.ok(campaignSlug("x".repeat(100)).length <= 60);
});

// ---- tracking.ts ----------------------------------------------------------

test("user agents: mail app and device", () => {
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"), { device: "unknown", client: "Gmail" });
  assert.deepEqual(parseUserAgent("Mozilla/5.0"), { device: "unknown", client: "Apple Mail" });
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"), { device: "mobile", client: "Web browser" });
  assert.equal(parseUserAgent("Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0)").client, "Outlook");
  assert.equal(parseUserAgent("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)").device, "tablet");
  assert.equal(parseUserAgent("python-requests/2.31").client, "Robot");
  assert.deepEqual(parseUserAgent(null), { device: "unknown", client: "Unknown" });
});

test("opens: Apple's privacy proxy and instant fetches are machines; Gmail's proxy is a person", () => {
  const sentAt = "2026-11-11T10:00:00Z";
  const later = new Date("2026-11-11T12:00:00Z");
  assert.equal(isMachineOpen({ ua: "Mozilla/5.0", sentAt, openedAt: later }), true);
  assert.equal(isMachineOpen({ ua: "Mimecast Security", sentAt, openedAt: later }), true);
  assert.equal(isMachineOpen({ ua: "Mozilla/5.0 (via ggpht.com GoogleImageProxy)", sentAt, openedAt: new Date("2026-11-11T10:00:05Z") }), true);
  assert.equal(isMachineOpen({ ua: "Mozilla/5.0 (via ggpht.com GoogleImageProxy)", sentAt, openedAt: later }), false);
});

test("clicks: scanners, instant clicks and bursts are bots; a person's click is not", () => {
  const sentAt = "2026-11-11T10:00:00Z";
  const later = new Date("2026-11-11T11:00:00Z");
  const person = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  assert.equal(isBotClick({ ua: person, sentAt, clickedAt: later, clicksInLastFiveSeconds: 0 }), false);
  assert.equal(isBotClick({ ua: person, sentAt, clickedAt: later, clicksInLastFiveSeconds: 1 }), false);
  assert.equal(isBotClick({ ua: person, sentAt, clickedAt: later, clicksInLastFiveSeconds: 2 }), true);
  assert.equal(isBotClick({ ua: person, sentAt, clickedAt: new Date("2026-11-11T10:00:03Z"), clicksInLastFiveSeconds: 0 }), true);
  assert.equal(isBotClick({ ua: "Proofpoint URL Defense", sentAt, clickedAt: later, clicksInLastFiveSeconds: 0 }), true);
  assert.equal(isBotClick({ ua: "", sentAt, clickedAt: later, clicksInLastFiveSeconds: 0 }), true);
});

test("HMARK's website, not the portal and not a look-alike", () => {
  assert.equal(isHmarkSite("https://hmarkconsultants.com/x"), true);
  assert.equal(isHmarkSite("https://www.hmarkconsultants.com/x"), true);
  assert.equal(isHmarkSite("https://portal.hmarkconsultants.com/x"), false);
  assert.equal(isHmarkSite("https://hmarkconsultants.com.evil.net/x"), false);
  assert.equal(isHmarkSite("https://nothmarkconsultants.com/x"), false);
  assert.equal(isHmarkSite("not a url"), false);
});

test("click destination: UTM tags unless the link has its own; the recipient mark only on HMARK's site", () => {
  const ours = new URL(clickDestination("https://hmarkconsultants.com/italy?a=1", { utm: true, slug: "nov", recipientToken: TOKEN_A }));
  assert.equal(ours.searchParams.get("a"), "1");
  assert.equal(ours.searchParams.get("utm_source"), "hmark_portal");
  assert.equal(ours.searchParams.get("utm_medium"), "email");
  assert.equal(ours.searchParams.get("utm_campaign"), "nov");
  assert.equal(ours.searchParams.get("hm_rid"), TOKEN_A);

  const theirs = new URL(clickDestination("https://example.org/p?utm_source=partner", { utm: true, slug: "nov", recipientToken: TOKEN_A }));
  assert.equal(theirs.searchParams.get("utm_source"), "partner");
  assert.equal(theirs.searchParams.get("utm_campaign"), null);
  assert.equal(theirs.searchParams.get("hm_rid"), null, "a recipient's token never goes to another site");

  const plain = clickDestination("https://example.org/p", { utm: false, slug: "nov", recipientToken: TOKEN_A });
  assert.equal(plain, "https://example.org/p");
});

test("tracking tokens and the pixel", () => {
  assert.equal(recipientTokenOf(`${TOKEN_A}.gif`), TOKEN_A);
  assert.equal(recipientTokenOf(TOKEN_A), TOKEN_A);
  assert.equal(recipientTokenOf("A".repeat(32)), null);
  assert.equal(recipientTokenOf("a".repeat(31)), null);
  assert.equal(recipientTokenOf("../../etc/passwd"), null);
  assert.equal(String.fromCharCode(...PIXEL_GIF.slice(0, 6)), "GIF89a");
});

// ---- sendingRules.ts ------------------------------------------------------

test("a run sends no more than the speed, the hour or the day allows", () => {
  assert.equal(runBudget({ perSecond: 10, perHour: 10_000, sentLastHour: 0, dailyCap: null, sentToday: 0 }), 500);
  assert.equal(runBudget({ perSecond: 10, perHour: 10_000, sentLastHour: 9_800, dailyCap: null, sentToday: 0 }), 200);
  assert.equal(runBudget({ perSecond: 10, perHour: 10_000, sentLastHour: 0, dailyCap: 300, sentToday: 250 }), 50);
  assert.equal(runBudget({ perSecond: 10, perHour: 100, sentLastHour: 150, dailyCap: null, sentToday: 0 }), 0, "never negative");
});

test("warm-up grows the daily cap from its start", () => {
  const w = { enabled: true, startCap: 200, growthPct: 50, startedOn: "2026-11-01" };
  assert.equal(warmupCap(w, "2026-11-01"), 200);
  assert.equal(warmupCap(w, "2026-11-02"), 300);
  assert.equal(warmupCap(w, "2026-11-03"), 450);
  assert.equal(warmupCap({ ...w, enabled: false }, "2026-11-03"), null);
  assert.equal(warmupCap({ ...w, startedOn: null }, "2026-11-03"), null);
  assert.equal(warmupCap(w, "2026-10-30"), 200, "a start in the future is day one");
});

test("Karachi's day turns at midnight Karachi, not UTC", () => {
  assert.equal(karachiDay(new Date("2026-11-11T18:59:00Z")), "2026-11-11");
  assert.equal(karachiDay(new Date("2026-11-11T19:00:00Z")), "2026-11-12");
});

test("retries back off, capped at an hour", () => {
  assert.equal(retryDelayMs(1), 2 * 60_000);
  assert.equal(retryDelayMs(2), 4 * 60_000);
  assert.equal(retryDelayMs(4), 16 * 60_000);
  assert.equal(retryDelayMs(10), 60 * 60_000);
  assert.ok(MAX_ATTEMPTS >= 3);
});

test("a campaign pauses itself on bounces or complaints, judged only on enough sent", () => {
  assert.equal(autoPause({ sent: 50, bounced: 20, complained: 5 }), null);
  assert.equal(autoPause({ sent: 1000, bounced: 50, complained: 1 }), null, "exactly 5% and 0.1% go on");
  assert.match(autoPause({ sent: 1000, bounced: 51, complained: 0 }) ?? "", /5\.1% of emails bounced/);
  assert.match(autoPause({ sent: 1000, bounced: 0, complained: 2 }) ?? "", /marked it as spam/);
});

test("bounces in words", () => {
  assert.equal(bounceReason("Permanent", "NoEmail"), "Mailbox does not exist");
  assert.equal(bounceReason("Transient", "MailboxFull"), "Mailbox full");
  assert.equal(bounceReason("Transient", "General", "552 5.2.2 over quota"), "Mailbox full");
  assert.equal(bounceReason("Permanent", "Suppressed"), "On the sending service's do-not-send list");
  assert.equal(bounceReason("Permanent", "General", "550 5.1.1 user unknown"), "Mailbox does not exist");
  assert.equal(bounceReason("Permanent", "General"), "Address refuses mail");
  assert.equal(bounceReason(null, null), "Not delivered");
});

// ---- campaignRules.ts -----------------------------------------------------

test("what stops a campaign, in words", () => {
  const ok = { name: "N", subject: "S", from_name: "HMARK", from_email: "news@mail.hmarkconsultants.com", template_version_id: "v" };
  assert.deepEqual(campaignProblems(ok, { realSend: true, audienceCount: 10 }), []);
  assert.deepEqual(campaignProblems({ ...ok, from_email: null }, { realSend: false, audienceCount: 10 }), [], "practice needs no sender address");
  assert.equal(campaignProblems({ ...ok, from_email: " " }, { realSend: true, audienceCount: 10 }).length, 1);
  assert.equal(campaignProblems({ name: "", subject: " ", from_name: "", from_email: "", template_version_id: null }, { realSend: true, audienceCount: 0 }).length, 5);
});

test("a big send is confirmed by typing its size or SEND", () => {
  assert.equal(confirmsSend(CONFIRM_ABOVE, ""), true);
  assert.equal(confirmsSend(1200, ""), false);
  assert.equal(confirmsSend(1200, "1,200"), true);
  assert.equal(confirmsSend(1200, "1200"), true);
  assert.equal(confirmsSend(1200, "send"), true);
  assert.equal(confirmsSend(1200, "1100"), false);
});

test("a scheduled time is Karachi's", () => {
  assert.equal(karachiInstant("2026-11-12T10:30")?.toISOString(), "2026-11-12T05:30:00.000Z");
  assert.equal(karachiInstant("2026-11-12 10:30"), null);
  assert.equal(karachiInstant(""), null);
  assert.equal(karachiLocal("2026-11-12T05:30:00.000Z"), "2026-11-12T10:30");
  assert.equal(karachiLocal(null), "");
});

test("Settings' topic and conversion lists: keys kept, made from a bare name, never repeated", () => {
  const r = parseKeyedLines("enquiry_form | Enquiry form sent\n\n  Book a Consultation  \nWhatsApp-Click | WhatsApp button\n", { what: "conversion" });
  assert.deepEqual(r, {
    items: [
      { key: "enquiry_form", label: "Enquiry form sent" },
      { key: "book_a_consultation", label: "Book a Consultation" },
      { key: "whatsapp_click", label: "WhatsApp button" },
    ],
  });
  assert.equal(keyedLines(r.items), "enquiry_form | Enquiry form sent\nbook_a_consultation | Book a Consultation\nwhatsapp_click | WhatsApp button");
  assert.deepEqual(parseKeyedLines(keyedLines(r.items), { what: "conversion" }), r, "what Settings shows saves back the same");
  assert.match(parseKeyedLines("a | One\nA | Two", { what: "topic" }).error, /share the key/);
  assert.match(parseKeyedLines("a |", { what: "topic" }).error, /needs a name/);
  assert.match(parseKeyedLines("!!! | Odd", { what: "topic" }).error, /needs a key/);
  assert.match(parseKeyedLines("a\nb\nc", { what: "topic", max: 2 }).error, /At most 2/);
  assert.deepEqual(parseKeyedLines("", { what: "topic" }), { items: [] });
});

// ---- simulate.ts ----------------------------------------------------------

const recipients = Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}`, campaignId: "camp-1", email: `p${i}@example.com`, sentAt: "2026-11-11T05:00:00.000Z" }));
const links = [
  { id: "l1", url: "https://hmarkconsultants.com/study-in-italy" },
  { id: "l2", url: "https://example.org/fees" },
];
const sim = simulateActivity({ recipients, links, conversionKeys: ["contact_form"], seed: seedOf("camp-1") });

test("simulation: the same campaign makes the same story", () => {
  const again = simulateActivity({ recipients, links, conversionKeys: ["contact_form"], seed: seedOf("camp-1") });
  assert.deepEqual(again, sim);
  const r = seededRandom(1);
  const xs = Array.from({ length: 1000 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notEqual(seedOf("camp-1"), seedOf("camp-2"));
});

test("simulation: every event is marked simulated, and every recipient has one update", () => {
  assert.ok(sim.events.length > recipients.length);
  assert.ok(sim.events.every((e) => e.simulated === true && e.campaign_id === "camp-1"));
  assert.equal(sim.updates.length, recipients.length);
  assert.equal(new Set(sim.updates.map((u) => u.id)).size, recipients.length);
});

test("simulation: rates are believable", () => {
  const n = recipients.length;
  const bounced = sim.updates.filter((u) => u.bounce).length / n;
  const opened = sim.updates.filter((u) => u.human_open_count > 0).length / n;
  const clicked = sim.updates.filter((u) => u.human_click_count > 0).length / n;
  assert.ok(bounced > 0.01 && bounced < 0.06, `bounced ${bounced}`);
  assert.ok(opened > 0.3 && opened < 0.5, `opened ${opened}`);
  assert.ok(clicked > 0.05 && clicked < 0.2, `clicked ${clicked}`);
  assert.ok(sim.events.some((e) => e.type === "opened" && e.is_machine), "some machine opens");
  assert.ok(sim.events.some((e) => e.type === "clicked" && e.is_machine), "some scanner clicks");
});

test("simulation: a bounced email has nothing after it; a person clicks only after opening; a visit follows an HMARK link", () => {
  const byRecipient = new Map();
  for (const e of sim.events) byRecipient.set(e.recipient_id, [...(byRecipient.get(e.recipient_id) ?? []), e]);
  for (const u of sim.updates) {
    const evs = byRecipient.get(u.id) ?? [];
    if (u.bounce) {
      assert.equal(evs.length, 1);
      assert.equal(u.delivered_at, null);
      continue;
    }
    assert.ok(u.delivered_at);
    if (u.human_click_count > 0) {
      assert.ok(u.human_open_count > 0, "clicked without opening");
      assert.ok(Date.parse(u.first_open_at) <= Date.parse(evs.find((e) => e.type === "clicked" && !e.is_machine).occurred_at));
    }
    if (u.visited_at) {
      const click = evs.find((e) => e.type === "clicked" && !e.is_machine);
      assert.ok(click && isHmarkSite(click.url), "visited the website without clicking through to it");
    }
    if (u.converted_at) assert.ok(u.visited_at);
    assert.equal(u.open_count, evs.filter((e) => e.type === "opened").length);
    assert.equal(u.click_count, evs.filter((e) => e.type === "clicked").length);
  }
});

test("simulation: every event has the same keys, so a batch insert never sends null for a default", () => {
  const shape = (e) => Object.keys(e).sort().join(",");
  const shapes = new Set(sim.events.map(shape));
  assert.equal(shapes.size, 1, [...shapes].join("\n"));
  assert.ok(sim.events.every((e) => typeof e.is_machine === "boolean" && e.meta && typeof e.meta === "object"), "the NOT NULL columns always have a value");
});

test("simulation: no links means no clicks or visits", () => {
  const s = simulateActivity({ recipients: recipients.slice(0, 300), links: [], conversionKeys: [], seed: 7 });
  assert.ok(!s.events.some((e) => ["clicked", "website_visit", "conversion"].includes(e.type)));
});

// ---- providers/sesWebhook.ts ----------------------------------------------

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" });
const CERT_URL = "https://sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-abc.pem";
const TOPIC = "arn:aws:sns:ap-southeast-2:123:hmark-email";
const signed = (m, version = "2") => {
  const msg = { SignatureVersion: version, SigningCertURL: CERT_URL, ...m };
  const s = createSign(version === "2" ? "RSA-SHA256" : "RSA-SHA1");
  s.update(snsStringToSign(msg), "utf8");
  return { ...msg, Signature: s.sign(privateKey, "base64") };
};
const getCert = async (url) => {
  assert.equal(url, CERT_URL);
  return PEM;
};
const note = (over = {}) =>
  signed({ Type: "Notification", MessageId: "m1", TopicArn: TOPIC, Message: '{"eventType":"Delivery"}', Timestamp: "2026-11-11T05:00:00.000Z", ...over });

test("SNS: a signed message is believed; a changed one, a foreign certificate or another topic is not", async () => {
  assert.equal(await verifySnsMessage(note(), getCert), true);
  assert.equal(await verifySnsMessage(note({ Subject: "Hello" }), getCert), true);
  assert.equal(await verifySnsMessage(signed({ Type: "Notification", MessageId: "m1", TopicArn: TOPIC, Message: "{}", Timestamp: "t" }, "1"), getCert), true);
  assert.equal(await verifySnsMessage({ ...note(), Message: '{"eventType":"Complaint"}' }, getCert), false, "tampered");
  assert.equal(await verifySnsMessage({ ...note(), SigningCertURL: "https://evil.example.com/cert.pem" }, getCert), false);
  assert.equal(await verifySnsMessage({ ...note(), SigningCertURL: "http://sns.ap-southeast-2.amazonaws.com/x.pem" }, getCert), false);
  assert.equal(await verifySnsMessage({ ...note(), SignatureVersion: "3" }, getCert), false);
  assert.equal(await verifySnsMessage(note(), getCert, TOPIC), true);
  assert.equal(await verifySnsMessage(note(), getCert, "arn:aws:sns:ap-southeast-2:999:someone-else"), false);
  assert.equal(await verifySnsMessage(note(), async () => { throw new Error("offline"); }), false);
  assert.equal(await verifySnsMessage({ ...note(), Signature: "" }, getCert), false);
  const sub = signed({ Type: "SubscriptionConfirmation", MessageId: "m2", TopicArn: TOPIC, Message: "confirm", Timestamp: "t", SubscribeURL: "https://sns.ap-southeast-2.amazonaws.com/?Action=ConfirmSubscription", Token: "tok" });
  assert.equal(await verifySnsMessage(sub, getCert), true);
  assert.equal(await verifySnsMessage({ ...sub, SubscribeURL: "https://evil.example.com/" }, getCert), false);
});

test("SNS hosts", () => {
  assert.equal(isSnsUrl("https://sns.us-east-1.amazonaws.com/x"), true);
  assert.equal(isSnsUrl("https://sns.us-east-1.amazonaws.com.evil.net/x"), false);
  assert.equal(isSnsUrl("https://evilsns.us-east-1.amazonaws.com/x"), false);
  assert.equal(isSnsUrl(undefined), false);
});

test("SES events in the portal's terms", () => {
  const bounce = parseSesEvent(
    JSON.stringify({
      eventType: "Bounce",
      mail: { messageId: "ses-1", timestamp: "2026-11-11T05:00:00Z" },
      bounce: { bounceType: "Permanent", bounceSubType: "NoEmail", feedbackId: "fb1", timestamp: "2026-11-11T05:00:30Z", bouncedRecipients: [{ emailAddress: "A@Example.com", diagnosticCode: "550 5.1.1" }] },
    })
  );
  assert.deepEqual(bounce, [
    {
      providerMessageId: "ses-1",
      providerEventId: "fb1:a@example.com",
      type: "hard_bounce",
      occurredAt: "2026-11-11T05:00:30Z",
      recipient: "a@example.com",
      bounceType: "Permanent",
      bounceSubType: "NoEmail",
      diagnostic: "550 5.1.1",
    },
  ]);
  const soft = parseSesEvent(JSON.stringify({ notificationType: "Bounce", mail: { messageId: "ses-2" }, bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "b@example.com" }] } }));
  assert.equal(soft[0].type, "soft_bounce");
  const complaint = parseSesEvent(JSON.stringify({ eventType: "Complaint", mail: { messageId: "ses-3" }, complaint: { feedbackId: "fb3", complainedRecipients: [{ emailAddress: "c@example.com" }] } }));
  assert.equal(complaint[0].type, "complaint");
  const delivered = parseSesEvent(JSON.stringify({ eventType: "Delivery", mail: { messageId: "ses-4" }, delivery: { timestamp: "2026-11-11T05:01:00Z", recipients: ["d@example.com"] } }));
  assert.deepEqual([delivered[0].type, delivered[0].recipient, delivered[0].providerEventId], ["delivered", "d@example.com", "ses-4:delivered:d@example.com"]);
  assert.equal(parseSesEvent(JSON.stringify({ eventType: "Reject", mail: { messageId: "ses-5" }, reject: { reason: "Bad content" } }))[0].type, "rejected");
  assert.deepEqual(parseSesEvent(JSON.stringify({ eventType: "Open", mail: { messageId: "ses-6" } })), [], "opens are the portal's own");
  assert.deepEqual(parseSesEvent(JSON.stringify({ eventType: "Delivery" })), [], "no message id, nothing to match");
  assert.deepEqual(parseSesEvent("not json"), []);
});
