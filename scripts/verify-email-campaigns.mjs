// Email campaigns, parts 3-4 (0356-0358): a practice send end to end, and
// tracking, on the deployed portal. Takes two to four minutes: the
// every-minute cron does the sending.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailcampaigns
//
//   draft        a new campaign says what is missing; the list's three are
//                counted as they are chosen; saved, ready
//   send         practice (no service connected): the audience frozen at 3, the
//                email prepared once with its links numbered; the cron sends
//                each recipient once through the practice stand-in
//   tracking     the pixel (a person's open after 20 s; Apple's bare user agent
//                a machine's); a click redirects only to the stored link, with
//                UTMs, and hm_rid only on HMARK's site; a URL in the address is
//                ignored; the web version has no pixel; website visits and
//                conversions accepted from hmarkconsultants.com, refused from
//                elsewhere and from the portal; one-click unsubscribe credited
//                to the campaign; an unsigned SES webhook refused
//   simulate     made-up events, all marked, nobody's real state touched;
//                cleared again
//   settings     conversion events as key | name; the website line; saving
//                unchanged changes nothing; (0360) the sending domain's six
//                records listed and each looked up, DKIM waiting for
//                Amazon's tokens (the real settings are put back after)
//   pace         (0360) a duplicate spread over 2 hours keeps it
//
// Everything it makes is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailcampaigns");

const { admin } = clients();
const fx = fixtures(admin);
const r = reporter();
const browser = await openBrowser();
let removed = 0;
const settle = (p) => p.waitForLoadState("networkidle").catch(() => {});
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const poll = async (what, fn, ms = 30000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
};
const EMAILS = ["zztmp-camp1@hmarkconsultants.com", "zztmp-camp2@hmarkconsultants.com", "zztmp-camp3@hmarkconsultants.com"];
const HTML = `<!doctype html><html><head><title>x</title></head><body>
<p>Hi {{first_name|there}},</p>
<p><a href="https://hmarkconsultants.com/study-in-italy">Study in Italy</a></p>
<p><a href="https://example.org/fees">Fees</a></p>
<p><a href="{{unsubscribe_url}}">Unsubscribe</a> · <a href="{{web_version_url}}">View in browser</a></p>
</body></html>`;
let templateId = null;
let campaignId = null;
let domainBefore = null;

try {
  const me = await fx.staff("emailcamp", ["super_admin"]);

  // Fixtures: a template, three contacts on a list.
  const { data: t } = await admin.from("email_templates").insert({ name: "zztmp Campaign Template", created_by: me.id }).select("id").single();
  templateId = t.id;
  const { data: v } = await admin.from("email_template_versions").insert({ template_id: t.id, version: 1, source_kind: "html", html: HTML, text_body: "Hi {{first_name|there}} {{unsubscribe_url}}", created_by: me.id }).select("id").single();
  await admin.from("email_templates").update({ current_version_id: v.id }).eq("id", t.id);
  const { data: list } = await admin.from("email_lists").insert({ name: "zztmp Campaign List", created_by: me.id }).select("id").single();
  const { data: contacts } = await admin.from("email_contacts").insert(EMAILS.map((email, i) => ({ email, full_name: `zztmp Person${i + 1} Test`, source: "zztmp" }))).select("id, email");
  await admin.from("email_contact_status").upsert(EMAILS.map((email) => ({ email, status: "subscribed", consent_source: "zztmp", consent_at: new Date().toISOString() })), { onConflict: "email" });
  await admin.from("email_list_members").insert(contacts.map((c) => ({ list_id: list.id, contact_id: c.id, added_by: me.id })));

  const page = await signIn(browser, me.email);
  await page.goto(`${BASE}/marketing/email/campaigns`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-new-campaign] input[name="name"]', "zztmp Practice Campaign");
  await page.locator("[data-new-campaign]").getByRole("button", { name: "New campaign" }).click();
  await page.waitForURL(/campaigns\/[0-9a-f-]{36}$/, { timeout: 30000 });
  campaignId = page.url().split("/").pop();
  await settle(page);
  r.ok("new campaign: a draft opens", (await page.locator("[data-campaign-editor]").count()) === 1);

  const problems = await page.locator("[data-campaign-problems]").innerText();
  r.ok("send panel: what is missing, in words", problems.includes("Write a subject line") && problems.includes("Choose a template"), problems);

  await page.fill("[data-campaign-subject]", "zztmp {{first_name|Hello}}, Italy is open");
  await page.locator("[data-campaign-template]").selectOption(v.id);
  await page.locator("[data-campaign-everyone]").setChecked(false);
  await page.locator(`input[name="include_lists"][value="${list.id}"]`).check();
  await poll("reach of 3", async () => (await page.locator("[data-campaign-reach]").innerText()).includes("Reaches 3 people"), 30000);
  r.ok("audience: the list's three counted as you choose", true);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("[data-campaign-ready]").waitFor({ timeout: 30000 });
  r.ok("saved: ready, to 3 people", (await page.locator("[data-campaign-ready]").innerText()).includes("to 3 people"));
  const sendText = await page.locator("[data-campaign-send]").innerText();
  r.ok("no service connected: it says the send is practice", sendText.includes("practice run"));

  await page.locator("[data-campaign-send-now]").click();
  await page.getByText("Practice — nothing was sent").waitFor({ timeout: 60000 });
  const { data: started } = await admin.from("email_campaigns").select("status, practice, recipients_total, prepared_html").eq("id", campaignId).single();
  r.ok("started: practice, audience frozen at 3", started.practice === true && started.recipients_total === 3 && ["sending", "sent"].includes(started.status), JSON.stringify({ ...started, prepared_html: undefined }));
  r.ok("prepared once: links numbered, pixel marked", started.prepared_html.includes("%%HMARK_LINK_1%%") && started.prepared_html.includes("%%HMARK_LINK_2%%") && started.prepared_html.includes("%%HMARK_PIXEL%%"));
  const { data: links } = await admin.from("email_campaign_links").select("position, url").eq("campaign_id", campaignId).order("position");
  r.ok("its links are stored", links.length === 2 && links[0].url === "https://hmarkconsultants.com/study-in-italy", JSON.stringify(links));

  // The every-minute cron does the sending.
  const done = await poll("the cron to send it", async () => {
    const { data } = await admin.from("email_campaigns").select("status").eq("id", campaignId).single();
    return data.status === "sent" ? data : null;
  }, 180000);
  r.ok("the cron sent it within three minutes", done.status === "sent");
  const { data: rcpts } = await admin.from("email_campaign_recipients").select("id, email, token, status, provider_message_id, sent_at").eq("campaign_id", campaignId).order("email");
  r.ok("each recipient sent once, through the practice stand-in", rcpts.length === 3 && rcpts.every((x) => x.status === "sent" && x.provider_message_id?.startsWith("practice-")));
  const { count: sentEvents } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("type", "sent");
  r.ok("a sent event each", sentEvents === 3, String(sentEvents));

  // Tracking, signed out.
  const anon = await browser.newContext({ userAgent: CHROME });
  const req = anon.request;
  const one = rcpts[0];
  // An open in the first 20 seconds is taken for a machine (Apple's proxy fetches on arrival), so wait past it.
  const wait = Date.parse(one.sent_at) + 22000 - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  const px = await req.get(`${BASE}/api/email/o/${one.token}.gif`);
  r.ok("pixel: a GIF, not cached", px.status() === 200 && px.headers()["content-type"] === "image/gif" && /no-store/.test(px.headers()["cache-control"] ?? ""), `${px.status()} ${px.headers()["cache-control"]}`);
  await poll("the open", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("open_count, human_open_count, first_open_at").eq("id", one.id).single();
    return data.open_count === 1 ? data : null;
  });
  const { data: opened } = await admin.from("email_campaign_recipients").select("open_count, human_open_count").eq("id", one.id).single();
  r.ok("pixel: an open recorded as a person's", opened.human_open_count === 1, JSON.stringify(opened));

  const apple = rcpts[2];
  await req.get(`${BASE}/api/email/o/${apple.token}.gif`, { headers: { "User-Agent": "Mozilla/5.0" } });
  const appleOpen = await poll("Apple's open", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("open_count, human_open_count").eq("id", apple.id).single();
    return data.open_count === 1 ? data : null;
  });
  r.ok("pixel: Apple's privacy proxy counted as a machine, not a person", appleOpen.human_open_count === 0, JSON.stringify(appleOpen));

  const click = await req.get(`${BASE}/api/email/c/${one.token}?l=1`, { maxRedirects: 0 });
  const loc = new URL(click.headers().location ?? "https://x.invalid/");
  r.ok(
    "click: redirects to the stored link with UTM tags and the recipient mark",
    click.status() === 302 && loc.origin + loc.pathname === "https://hmarkconsultants.com/study-in-italy" && loc.searchParams.get("utm_source") === "hmark_portal" && loc.searchParams.get("hm_rid") === one.token,
    `${click.status()} ${loc}`
  );
  const other = await req.get(`${BASE}/api/email/c/${one.token}?l=2`, { maxRedirects: 0 });
  const otherLoc = new URL(other.headers().location ?? "https://x.invalid/");
  r.ok("click: another site gets UTM tags but never the recipient mark", otherLoc.hostname === "example.org" && !otherLoc.searchParams.has("hm_rid"), String(otherLoc));
  const forged = await req.get(`${BASE}/api/email/c/${one.token}?l=1&url=https://evil.example.com`, { maxRedirects: 0 });
  r.ok("click: a URL in the address is ignored", new URL(forged.headers().location).hostname === "hmarkconsultants.com");
  const bad = await req.get(`${BASE}/api/email/c/${"0".repeat(32)}?l=1`, { maxRedirects: 0 });
  r.ok("click: an unknown token lands on the website, recording nothing", bad.status() === 302 && bad.headers().location.startsWith("https://hmarkconsultants.com"));
  await poll("the clicks", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("click_count").eq("id", one.id).single();
    return data.click_count >= 3 ? data : null;
  });
  r.ok("clicks: recorded against the recipient", true);

  const view = await req.get(`${BASE}/email/view/${one.token}`);
  const viewHtml = await view.text();
  r.ok(
    "web version: their email, personal, with no pixel",
    view.status() === 200 && viewHtml.includes("Hi zztmp") && !viewHtml.includes("/api/email/o/") && viewHtml.includes(`/api/email/c/${one.token}?l=1`) && /sandbox/.test(view.headers()["content-security-policy"] ?? ""),
    `${view.status()} csp=${view.headers()["content-security-policy"]}`
  );

  const ev = (body, origin = "https://hmarkconsultants.com") =>
    req.post(`${BASE}/api/email/web-event`, { headers: { "Content-Type": "text/plain", Origin: origin }, data: JSON.stringify(body) });
  const visit = await ev({ rid: one.token, sid: "zztmpsession1", type: "page_view", url: "https://hmarkconsultants.com/study-in-italy?hm_rid=" + one.token });
  r.ok("website: a visit is accepted from HMARK's site", visit.status() === 204, String(visit.status()));
  const conv = await ev({ rid: one.token, sid: "zztmpsession1", type: "conversion", name: "enquiry_form", url: "https://hmarkconsultants.com/contact" });
  r.ok("website: a conversion is accepted", conv.status() === 204, String(conv.status()));
  const evil = await ev({ rid: one.token, sid: "zztmpsession1", type: "page_view", url: "https://evil.example.com/" }, "https://evil.example.com");
  r.ok("website: another site is refused", evil.status() === 403, String(evil.status()));
  const fromPortal = await ev({ rid: one.token, sid: "zztmpsession1", type: "page_view", url: "https://portal.hmarkconsultants.com/" }, "https://portal.hmarkconsultants.com");
  r.ok("website: the portal itself is refused", fromPortal.status() === 403, String(fromPortal.status()));
  await poll("the visit and conversion", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("visited_at, converted_at").eq("id", one.id).single();
    return data.visited_at && data.converted_at ? data : null;
  });
  r.ok("website: visit and conversion credited to the recipient", true);

  const { data: addr } = await admin.from("email_contact_status").select("token").eq("email", rcpts[1].email).single();
  const unsub = await req.post(`${BASE}/api/email/unsubscribe/${addr.token}?r=${rcpts[1].token}`, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: "List-Unsubscribe=One-Click", maxRedirects: 0 });
  const credited = await poll("the unsubscribe credited", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("unsubscribed_at").eq("id", rcpts[1].id).single();
    return data.unsubscribed_at ? data : null;
  });
  const { data: addrAfter } = await admin.from("email_contact_status").select("status").eq("email", rcpts[1].email).single();
  r.ok("one-click unsubscribe: the address is off, and the campaign is credited", unsub.status() === 200 && addrAfter.status === "unsubscribed" && Boolean(credited));

  const forgedHook = await req.post(`${BASE}/api/email/webhooks/ses`, {
    headers: { "Content-Type": "text/plain" },
    data: JSON.stringify({ Type: "Notification", MessageId: "x", TopicArn: "arn:x", Message: "{}", Timestamp: "t", SignatureVersion: "1", Signature: "AAAA", SigningCertURL: "https://evil.example.com/cert.pem" }),
  });
  r.ok("SES webhook: an unsigned message is refused", forgedHook.status() === 403, String(forgedHook.status()));
  await anon.close();

  // The campaign's page.
  await page.goto(`${BASE}/marketing/email/campaigns/${campaignId}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const progress = await page.locator("[data-campaign-progress]").innerText();
  r.ok("campaign page: 3 sent, none waiting", progress.includes("3 sent") && progress.includes("0 waiting"), progress);
  const sofar = await page.locator("body").innerText();
  r.ok("campaign page: what people did so far", sofar.includes("So far") && sofar.includes("Full report"), sofar.slice(sofar.indexOf("So far"), sofar.indexOf("So far") + 200));

  await page.getByRole("button", { name: "Simulate activity (practice)" }).click();
  const simulated = await poll("simulated events", async () => {
    const { count } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("simulated", true);
    return count > 0 ? count : null;
  });
  const { data: realState } = await admin.from("email_contact_status").select("email, status").in("email", EMAILS).order("email");
  r.ok("simulate: made-up events, every one marked", simulated > 0, String(simulated));
  r.ok("simulate: nobody's real email state touched", realState.map((s) => s.status).join() === "subscribed,unsubscribed,subscribed", JSON.stringify(realState));
  await page.getByRole("button", { name: "Clear simulated activity" }).waitFor({ timeout: 30000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear simulated activity" }).click();
  await poll("simulated events cleared", async () => {
    const { count } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("simulated", true);
    return count === 0;
  });
  r.ok("clear: the made-up activity is gone", true);

  // Pace (0360): a duplicate, spread over two hours.
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForURL((u) => /campaigns\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(campaignId), { timeout: 30000 });
  const copyId = page.url().split("/").pop();
  await settle(page);
  await page.fill("[data-campaign-spread]", "2");
  await page.getByRole("button", { name: "Save draft" }).click();
  const spread = await poll("the pace saved", async () => {
    const { data } = await admin.from("email_campaigns").select("spread_hours").eq("id", copyId).single();
    return data.spread_hours === 2 ? data : null;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  r.ok("pace: spread over 2 hours, kept", spread.spread_hours === 2 && (await page.locator("[data-campaign-spread]").inputValue()) === "2");

  // Settings: the Sending section and the website line.
  await page.goto(`${BASE}/marketing/email/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const conversions = await page.locator("[data-settings-conversions]").inputValue();
  r.ok("settings: conversion events listed as key | name", /^[a-z0-9_]+ \| \S/m.test(conversions), conversions);
  r.ok("settings: the website line", (await page.locator("[data-tracking-snippet]").innerText()).includes("/hmark-track.js"));
  const { data: before } = await admin.from("email_settings").select("conversion_events, topics").eq("id", true).single();
  await page.getByRole("button", { name: "Save sending settings" }).click();
  await page.locator("[data-sending-settings-form]").getByText("Saved.").waitFor({ timeout: 20000 });
  const { data: kept } = await admin.from("email_settings").select("conversion_events, topics").eq("id", true).single();
  r.ok("settings: saving unchanged keeps the lists as they were", JSON.stringify(kept) === JSON.stringify(before) && kept.topics.length > 0, JSON.stringify(kept));

  // The sending domain's DNS (0360): saved for the check, put back as it was in the finally.
  const { data: dom } = await admin.from("email_settings").select("sending_domain, dkim_tokens").eq("id", true).single();
  domainBefore = dom;
  const domainCard = page.locator("[data-sending-domain]");
  await domainCard.locator('input[name="sending_domain"]').fill("hmarkconsultants.com");
  await domainCard.locator('textarea[name="dkim_tokens"]').fill("");
  await domainCard.getByRole("button", { name: "Save domain" }).click();
  await poll("the domain saved", async () => (await admin.from("email_settings").select("sending_domain").eq("id", true).single()).data.sending_domain === "hmarkconsultants.com");
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  const recordsText = await page.locator("[data-dns-records]").innerText();
  r.ok("DNS: the six records SES needs, named for the domain", (await page.locator("[data-dns-records] tbody tr").count()) === 6 && recordsText.includes("_dmarc.hmarkconsultants.com") && recordsText.includes("bounce.hmarkconsultants.com"));
  await page.locator("[data-check-dns]").click();
  await page.locator("[data-dns-summary]").waitFor({ timeout: 45000 });
  const statuses = await page.locator("[data-dns-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-dns-status")));
  r.ok(
    "DNS: each looked up; DKIM waits for Amazon's tokens",
    statuses.length === 6 && statuses.slice(0, 3).every((s) => s === "waiting") && statuses.slice(3).every((s) => s === "pass" || s === "fail"),
    statuses.join(",")
  );
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  if (domainBefore) await admin.from("email_settings").update(domainBefore).eq("id", true);
  if (campaignId) await admin.from("email_campaigns").delete().eq("id", campaignId);
  await admin.from("email_campaigns").delete().like("name", "%zztmp%");
  if (templateId) {
    await admin.from("email_templates").update({ current_version_id: null }).eq("id", templateId);
    await admin.from("email_templates").delete().eq("id", templateId);
  }
  await admin.from("email_lists").delete().like("name", "zztmp%");
  await admin.from("email_contacts").delete().like("email", "zztmp-%");
  await admin.from("email_contact_status").delete().like("email", "zztmp-%");
  removed = await fx.cleanup();
  await browser.close();
}
process.exit(r.finish(removed) ? 1 : 0);
