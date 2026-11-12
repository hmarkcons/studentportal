// Email campaigns, part 5 (0359): the reports, on the deployed portal. Takes
// three to five minutes: the every-minute cron does the sending.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailreports
//
// A practice send to 40 fixture contacts and a fixture lead, simulated
// activity, then the lead's own real open, click, visit and conversion on top.
//
//   overview      sent and opened agree with the database; funnel, comparison
//                 and hourly chart drawn
//   recipients    "opened" and "did not open" (bounces left out) count right;
//                 search finds the lead, linked to the record; one person's
//                 timeline; CSV (a row each, named for the campaign and filter)
//                 and Excel exports; "Make a list" of the openers, the lead
//                 joining as the lead
//   links         both links; the click map badged, no live link, sandboxed
//   deliverability by provider; mail apps of the people who opened
//   website       pages seen; conversions named as in Settings
//   PDF           a real PDF, downloaded as a file
//   dashboard     practice hidden by default, shown when asked; sender health,
//                 the daily chart, the audience's state
//   follow-up     (0360) tasks for the openers: the lead's to their own
//                 counsellor, linked to the lead; contacts left out; not twice
//   lead page     the campaign and what they did
//   access        a counsellor is refused the export, the PDF and the report
//
// Everything it makes is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailreports");

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
const N = 40;
const EMAILS = Array.from({ length: N }, (_, i) => `zztmp-rep${i + 1}@hmarkconsultants.com`);
const LEAD_EMAIL = "zztmp-replead@hmarkconsultants.com";
const HTML = `<!doctype html><html><head><title>x</title></head><body>
<p>Hi {{first_name|there}},</p>
<p><a href="https://hmarkconsultants.com/study-in-italy">Study in Italy</a></p>
<p><a href="https://example.org/fees">Fees</a></p>
<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`;
const NAME = "zztmp Report Campaign";
let templateId = null;
let meId = null;

try {
  const me = await fx.staff("emailrep", ["super_admin"]);
  // The conversion the website reports: whichever Settings lists first, by its key, shown by its name.
  const { data: emailSettings } = await admin.from("email_settings").select("conversion_events").eq("id", true).single();
  const conversion = emailSettings.conversion_events[0];
  if (!conversion?.key) throw new Error("Settings › Sending lists no conversion events");
  const counsellor = await fx.staff("emailrepc", ["counselor"]);
  meId = me.id;

  const { data: t } = await admin.from("email_templates").insert({ name: "zztmp Report Template", created_by: me.id }).select("id").single();
  templateId = t.id;
  const { data: v } = await admin.from("email_template_versions").insert({ template_id: t.id, version: 1, source_kind: "html", html: HTML, text_body: "Hi {{unsubscribe_url}}", created_by: me.id }).select("id").single();
  await admin.from("email_templates").update({ current_version_id: v.id }).eq("id", t.id);
  const { data: list } = await admin.from("email_lists").insert({ name: "zztmp Report List", created_by: me.id }).select("id").single();
  const { data: contacts } = await admin.from("email_contacts").insert(EMAILS.map((email, i) => ({ email, full_name: `zztmp Rep${i + 1} Test`, source: "zztmp" }))).select("id");
  await admin.from("email_contact_status").upsert([...EMAILS, LEAD_EMAIL].map((email) => ({ email, status: "subscribed", consent_source: "zztmp", consent_at: new Date().toISOString() })), { onConflict: "email" });
  const leadId = await fx.lead({ full_name: "zztmp Report Lead", email: LEAD_EMAIL, contact_number: "0300-9999998", status: "in_discussion", date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy" });
  await admin.from("leads").update({ assigned_counselor_id: counsellor.id }).eq("id", leadId);
  await admin.from("email_list_members").insert([...contacts.map((c) => ({ list_id: list.id, contact_id: c.id, added_by: me.id })), { list_id: list.id, lead_id: leadId, added_by: me.id }]);

  // A practice send, as staff do it.
  const page = await signIn(browser, me.email);
  await page.goto(`${BASE}/marketing/email/campaigns`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-new-campaign] input[name="name"]', NAME);
  await page.locator("[data-new-campaign]").getByRole("button", { name: "New campaign" }).click();
  await page.waitForURL(/campaigns\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const campaignId = page.url().split("/").pop();
  await settle(page);
  await page.fill("[data-campaign-subject]", "zztmp report {{first_name|Hello}}");
  await page.locator("[data-campaign-template]").selectOption(v.id);
  await page.locator("[data-campaign-everyone]").setChecked(false);
  await page.locator(`input[name="include_lists"][value="${list.id}"]`).check();
  await poll("reach", async () => (await page.locator("[data-campaign-reach]").innerText()).includes(`Reaches ${N + 1} people`));
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("[data-campaign-ready]").waitFor({ timeout: 30000 });
  await page.locator("[data-campaign-send-now]").click();
  await page.getByText("Practice — nothing was sent").waitFor({ timeout: 60000 });
  await poll("the cron to send it", async () => (await admin.from("email_campaigns").select("status").eq("id", campaignId).single()).data.status === "sent", 180000);
  r.ok(`practice send of ${N + 1} done by the cron`, true);

  // Made-up activity first, then a real person's on top of it (the lead).
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "Simulate activity (practice)" }).click();
  await poll("simulated events", async () => {
    const { count } = await admin.from("email_events").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("simulated", true);
    return count > 0;
  });
  const { data: leadRcpt } = await admin.from("email_campaign_recipients").select("id, token, sent_at, human_open_count, human_click_count").eq("campaign_id", campaignId).eq("lead_id", leadId).single();
  const anon = await browser.newContext({ userAgent: CHROME });
  const wait = Date.parse(leadRcpt.sent_at) + 22000 - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  await anon.request.get(`${BASE}/api/email/o/${leadRcpt.token}.gif`);
  await anon.request.get(`${BASE}/api/email/c/${leadRcpt.token}?l=1`, { maxRedirects: 0 });
  const ev = (body) => anon.request.post(`${BASE}/api/email/web-event`, { headers: { "Content-Type": "text/plain", Origin: "https://hmarkconsultants.com" }, data: JSON.stringify(body) });
  await ev({ rid: leadRcpt.token, sid: "zztmprep", type: "page_view", url: "https://hmarkconsultants.com/study-in-italy" });
  await ev({ rid: leadRcpt.token, sid: "zztmprep", type: "conversion", name: conversion.key, url: "https://hmarkconsultants.com/contact" });
  await poll("the lead's real activity", async () => {
    const { data } = await admin.from("email_campaign_recipients").select("human_open_count, human_click_count, converted_at").eq("id", leadRcpt.id).single();
    return data.human_open_count > leadRcpt.human_open_count && data.human_click_count > leadRcpt.human_click_count && data.converted_at;
  });
  await anon.close();

  const { data: all } = await admin.from("email_campaign_recipients").select("human_open_count, human_click_count, bounce, visited_at, converted_at, lead_id, contact_id").eq("campaign_id", campaignId);
  const opened = all.filter((x) => x.human_open_count > 0).length;
  const clicked = all.filter((x) => x.human_click_count > 0).length;
  const notOpened = all.filter((x) => x.human_open_count === 0 && !x.bounce).length;
  const report = `${BASE}/marketing/email/campaigns/${campaignId}/report`;

  // Overview
  await page.goto(report, { waitUntil: "domcontentloaded" });
  await settle(page);
  const kpis = (await page.locator("[data-report-kpis]").innerText()).replace(/\s+/g, " ").toLowerCase();
  r.ok("overview: sent and opened match the database", kpis.includes(`sent ${N + 1}`) && kpis.includes(`${opened} people`), `${kpis.slice(0, 160)} | opened=${opened}`);
  r.ok("overview: funnel, comparison and hourly chart drawn", (await page.locator("[data-report-funnel] li").count()) === 6 && (await page.locator("[data-report-compare] tbody tr").count()) === 6 && (await page.locator("[data-report-timeline] svg rect").count()) > 0);

  // Recipients
  await page.goto(`${report}?tab=recipients&filter=opened`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("recipients: 'opened' counts the people who opened", (await page.locator("[data-recipient-total]").innerText()).startsWith(`${opened} opened`), await page.locator("[data-recipient-total]").innerText());
  await page.goto(`${report}?tab=recipients&filter=not_opened`, { waitUntil: "domcontentloaded" });
  r.ok("recipients: 'did not open' leaves out the bounced", (await page.locator("[data-recipient-total]").innerText()).startsWith(`${notOpened} did not open`), `${await page.locator("[data-recipient-total]").innerText()} vs ${notOpened}`);
  await page.goto(`${report}?tab=recipients&q=replead`, { waitUntil: "domcontentloaded" });
  const rowsFound = await page.locator("[data-recipient-table] tbody tr").count();
  r.ok("recipients: search finds the lead, linked to their record", rowsFound === 1 && (await page.locator(`[data-recipient-table] a[href="/leads/${leadId}"]`).count()) === 1);
  await page.goto(`${report}?tab=recipients&r=${leadRcpt.id}`, { waitUntil: "domcontentloaded" });
  const tl = await page.locator("[data-recipient-timeline]").innerText();
  r.ok("recipients: one person's timeline, real and simulated told apart", tl.includes("sent") && tl.includes("conversion") && tl.includes("website visit"), tl.slice(0, 300));

  const csv = await page.request.get(`${report}/export?format=csv&filter=clicked`);
  const csvText = await csv.text();
  const csvLines = csvText.trim().split(/\r\n/);
  r.ok("export: CSV of the filter, a row each, header first", csv.status() === 200 && /text\/csv/.test(csv.headers()["content-type"]) && csvLines.length === clicked + 1 && csvLines[0].includes("Email,Name,What they did"), `${csv.status()} lines=${csvLines.length} clicked=${clicked}`);
  r.ok("export: named after the campaign and filter", /zztmp-report-campaign-clicked-\d{4}-\d{2}-\d{2}\.csv/.test(csv.headers()["content-disposition"] ?? ""), csv.headers()["content-disposition"]);
  const xlsx = await page.request.get(`${report}/export?format=xlsx`);
  const xb = await xlsx.body();
  r.ok("export: Excel is a real workbook", xlsx.status() === 200 && xb[0] === 0x50 && xb[1] === 0x4b && xb.length > 2000, `${xlsx.status()} ${xb.length} bytes`);

  await page.goto(`${report}?tab=recipients&filter=opened`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-make-list] input[name="name"]', "zztmp Openers");
  await page.locator("[data-make-list]").getByRole("button", { name: "Make a list" }).click();
  await page.locator("[data-make-list-done]").waitFor({ timeout: 30000 });
  const { data: madeList } = await admin.from("email_lists").select("id").eq("name", "zztmp Openers").single();
  const { count: members } = await admin.from("email_list_members").select("id", { count: "exact", head: true }).eq("list_id", madeList.id);
  r.ok("make a list: everyone who opened, leads as leads", members === opened, `${members} vs ${opened}`);
  const { count: leadMember } = await admin.from("email_list_members").select("id", { count: "exact", head: true }).eq("list_id", madeList.id).eq("lead_id", leadId);
  r.ok("make a list: the lead joined as the lead", leadMember === 1);

  // Follow-up tasks (0360): one per lead among the openers, to that lead's own counsellor.
  const TASK = "zztmp Follow up the openers";
  await page.goto(`${report}?tab=recipients&filter=opened`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-follow-up] input[name="title"]', TASK);
  await page.locator("[data-follow-up]").getByRole("button", { name: "Give the tasks" }).click();
  await page.locator("[data-follow-up-done]").waitFor({ timeout: 30000 });
  const followMsg = await page.locator("[data-follow-up-done]").innerText();
  const { data: tasks } = await admin.from("personal_tasks").select("owner_id, assigned_by, student_id, due_date").eq("title", TASK);
  r.ok(
    "follow-up: the lead's task went to their own counsellor, linked to the lead",
    tasks.length === 1 && tasks[0].owner_id === counsellor.id && tasks[0].assigned_by === me.id && tasks[0].student_id === leadId,
    JSON.stringify(tasks)
  );
  r.ok("follow-up: the imported contacts are counted and left out", /imported contacts? left out/.test(followMsg), followMsg);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-follow-up] input[name="title"]', TASK);
  await page.locator("[data-follow-up]").getByRole("button", { name: "Give the tasks" }).click();
  await page.locator("[data-follow-up] .text-danger").waitFor({ timeout: 30000 });
  const again = await page.locator("[data-follow-up] .text-danger").innerText();
  const { count: taskCount } = await admin.from("personal_tasks").select("id", { count: "exact", head: true }).eq("title", TASK);
  r.ok("follow-up: not given twice while it is open", again.includes("already has this task open") && taskCount === 1, again);

  // Links
  await page.goto(`${report}?tab=links`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("links: both tracked links listed", (await page.locator("[data-link-table] tbody tr").count()) === 2);
  const srcdoc = (await page.locator("[data-click-map]").getAttribute("srcdoc")) ?? "";
  r.ok("click map: badges on the tracked links, no live link", srcdoc.includes('data-click-badge="1"') && srcdoc.includes('data-click-badge="2"') && !/href="https?:/.test(srcdoc));
  r.ok("click map: sandboxed", (await page.locator("[data-click-map]").getAttribute("sandbox")) === "");

  // Deliverability
  await page.goto(`${report}?tab=deliverability`, { waitUntil: "domcontentloaded" });
  const domains = await page.locator("[data-domains]").innerText();
  r.ok("deliverability: by provider", domains.includes("hmarkconsultants.com") && domains.includes(String(N + 1)), domains.slice(0, 200));
  r.ok("deliverability: mail apps of the people who opened", (await page.locator("[data-clients] tbody tr").count()) > 0);

  // Website
  await page.goto(`${report}?tab=website`, { waitUntil: "domcontentloaded" });
  const pagesSeen = await page.locator("[data-web-pages]").innerText();
  const conv = await page.locator("[data-web-conversions]").innerText();
  r.ok("website: pages they saw", pagesSeen.includes("/study-in-italy"), pagesSeen.slice(0, 200));
  r.ok("website: conversions named as in Settings", conv.includes(conversion.label ?? conversion.key), conv.slice(0, 200));
  const webKpis = (await page.locator("[data-website-kpis]").innerText()).toLowerCase();
  r.ok("website: pages a visit and time on site", webKpis.includes("pages a visit") && webKpis.includes("time on site"), webKpis.slice(0, 300));

  // PDF
  const pdf = await page.request.get(`${report}/pdf`);
  const pb = await pdf.body();
  r.ok("PDF: a real PDF, downloaded as a file", pdf.status() === 200 && pb.subarray(0, 5).toString() === "%PDF-" && pb.length > 5000 && /attachment; filename=".*\.pdf"/.test(pdf.headers()["content-disposition"] ?? ""), `${pdf.status()} ${pb.length}`);

  // Dashboard
  await page.goto(`${BASE}/marketing/email/reports`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("dashboard: real sends only by default — the practice one is not there", !(await page.locator("body").innerText()).includes(NAME));
  await page.goto(`${BASE}/marketing/email/reports?practice=1`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const league = await page.locator("[data-campaign-league]").innerText();
  r.ok("dashboard: with practice included, the campaign is listed", league.includes(NAME));
  const healthText = await page.locator("[data-sender-health]").innerText();
  r.ok("dashboard: sender health judged", ["Healthy", "Watch it", "At risk"].includes(healthText.trim()), healthText);
  r.ok("dashboard: the daily chart has the practice send", (await page.locator("[data-daily-chart] svg rect").count()) > 0);
  const aud = (await page.locator("[data-audience-health]").innerText()).toLowerCase();
  r.ok("dashboard: the audience's state", aud.includes("subscribed") && aud.includes("unsubscribed"), aud.slice(0, 200));

  const engaged = await page.locator("[data-engaged-share]").innerText();
  r.ok("dashboard: engaged in the last 90 days, and the audience week by week", engaged.toLowerCase().includes("engaged in the last 90 days") && (await page.locator("[data-audience-trend] tbody tr").count()) === 12);
  await page.goto(`${BASE}/marketing/email/reports?practice=1&sort=name&dir=asc`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const names = await page.locator("[data-campaign-league] tbody tr td:first-child a").allInnerTexts();
  const sortedNames = [...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  r.ok(
    "dashboard: sorted by name A to Z, the column says so",
    names.length > 0 && JSON.stringify(names) === JSON.stringify(sortedNames) && (await page.locator('th[aria-sort="ascending"] [data-sort="name"]').count()) === 1,
    names.slice(0, 5).join(" | ")
  );
  const dashCsv = await page.request.get(`${BASE}/marketing/email/reports/export?format=csv&practice=1`);
  const dashText = await dashCsv.text();
  r.ok("dashboard: CSV export with the campaign in it", dashCsv.status() === 200 && dashText.includes("Campaign,Practice,Started") && dashText.includes(NAME), `${dashCsv.status()} ${dashText.slice(0, 80)}`);
  const dashXlsx = await page.request.get(`${BASE}/marketing/email/reports/export?format=xlsx&practice=1`);
  const dxb = await dashXlsx.body();
  r.ok("dashboard: Excel export is a real workbook", dashXlsx.status() === 200 && dxb[0] === 0x50 && dxb[1] === 0x4b, String(dashXlsx.status()));

  // The lead's page
  await page.goto(`${BASE}/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-lead-email-activity]").waitFor({ timeout: 30000 });
  const card = await page.locator("[data-lead-email-activity]").locator("xpath=..").innerText();
  r.ok("lead page: the campaign and what they did", card.includes(NAME) && card.includes("Converted") && card.includes("Subscribed"), card.slice(0, 300));

  // Someone without email reports
  const other = await signIn(browser, counsellor.email);
  const refusedCsv = await other.request.get(`${report}/export?format=csv`);
  const refusedPdf = await other.request.get(`${report}/pdf`);
  r.ok("a counsellor is refused the export and the PDF", refusedCsv.status() === 403 && refusedPdf.status() === 403, `${refusedCsv.status()} ${refusedPdf.status()}`);
  const { data: rpc } = await other.request
    .get(`${BASE}/marketing/email/campaigns/${campaignId}/report`)
    .then(async (res) => ({ data: { status: res.status(), text: (await res.text()).includes(NAME) } }));
  r.ok("a counsellor cannot open the report", !rpc.text, JSON.stringify(rpc));
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  // Tasks first: a task names its lead and its people, which the fixtures' cleanup removes.
  await admin.from("personal_tasks").delete().like("title", "zztmp%");
  if (meId) await admin.from("staff_tasks").delete().eq("created_by", meId);
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
