// Email campaigns, Phase 6 (0362): hot leads, the sunset policy and each
// person's best hour, on the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailphase6
//
// All three learn only from REAL campaigns, and nothing real has been sent
// while the portal is in practice mode — so the history is made here, as
// fixture campaigns marked real and already sent: one seven months ago and
// one five days ago, with a lead who opened, clicked and visited the website,
// a contact who never opened either, and a contact who opens at 21:00.
//
//   hot leads    the lead's counsellor sees them on the dashboard and on the
//                lead's page; another counsellor does not; Reports lists them
//   sunset       the silent contact is listed; the re-engagement makes a list
//                and a draft to them; once it has gone and the grace period
//                passed, "Stop emailing" puts them on the do-not-email list
//   A/B test     (0363) 24 contacts, half tested: six get A, six get B (another
//                subject and template, its links numbered from 1001), twelve
//                are held; when B has more opens at decision time, the held
//                twelve get B; a B click finds B's link, the web version shows
//                B, and the report marks B the winner
//   best hour    a campaign sent "at each person's hour" holds the 21:00
//                opener until 21:00 Karachi and sends the others at once
//
// Everything it makes is removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailphase6");

const { admin } = clients();
const fx = fixtures(admin);
const r = reporter();
const browser = await openBrowser();
let removed = 0;
const settle = (p) => p.waitForLoadState("networkidle").catch(() => {});
const poll = async (what, fn, ms = 30000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
};
const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const HOT = "zztmp-hot@hmarkconsultants.com";
const SILENT = "zztmp-silent@hmarkconsultants.com";
const OWL = "zztmp-owl@hmarkconsultants.com";
const made = { campaigns: [], lists: [], runs: [], templateId: null, templateIds: [], staff: [] };

/** A real campaign already sent, with its recipients as given. */
async function realCampaign(name, sentDaysAgo, recipients, by) {
  const at = ago(sentDaysAgo);
  const { data: c, error } = await admin
    .from("email_campaigns")
    .insert({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: "sent", practice: false, started_at: at, finished_at: at, recipients_total: recipients.length, created_by: by })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  made.campaigns.push(c.id);
  const rows = recipients.map((x) => ({
    campaign_id: c.id,
    lead_id: x.lead_id ?? null,
    contact_id: x.contact_id ?? null,
    email: x.email,
    status: "sent",
    sent_at: at,
    open_count: x.opens ?? 0,
    human_open_count: x.opens ?? 0,
    first_open_at: x.opens ? ago(x.openedDaysAgo) : null,
    click_count: x.clicks ?? 0,
    human_click_count: x.clicks ?? 0,
    first_click_at: x.clicks ? ago(x.openedDaysAgo) : null,
    visited_at: x.visited ? ago(x.openedDaysAgo) : null,
  }));
  const { data: rec, error: recError } = await admin.from("email_campaign_recipients").insert(rows).select("id, email");
  if (recError) throw new Error(recError.message);
  return { id: c.id, recipients: Object.fromEntries(rec.map((x) => [x.email, x.id])) };
}

try {
  const me = await fx.staff("email6", ["super_admin"]);
  const counsellor = await fx.staff("email6c", ["counselor"]);
  const other = await fx.staff("email6o", ["counselor"]);
  made.staff.push(me.id, counsellor.id, other.id);
  const leadId = await fx.lead({ full_name: "zztmp Hot Lead", email: HOT, contact_number: "0300-9999997", status: "in_discussion", date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy", assigned_counselor_id: counsellor.id });
  const { data: contacts } = await admin
    .from("email_contacts")
    .insert([
      { email: SILENT, full_name: "zztmp Silent One", source: "zztmp" },
      { email: OWL, full_name: "zztmp Night Owl", source: "zztmp" },
    ])
    .select("id, email");
  const contactId = Object.fromEntries(contacts.map((c) => [c.email, c.id]));
  await admin.from("email_contact_status").upsert(
    [
      { email: HOT, status: "subscribed", consent_source: "zztmp", last_engaged_at: ago(4) },
      { email: SILENT, status: "subscribed", consent_source: "zztmp", last_engaged_at: null },
      { email: OWL, status: "subscribed", consent_source: "zztmp", last_engaged_at: ago(3) },
    ],
    { onConflict: "email" }
  );

  // The history: seven months ago, and five days ago.
  await realCampaign("zztmp Real Old", 210, [{ email: SILENT, contact_id: contactId[SILENT] }], me.id);
  const recent = await realCampaign(
    "zztmp Real Recent",
    5,
    [
      { email: SILENT, contact_id: contactId[SILENT] },
      { email: HOT, lead_id: leadId, opens: 2, clicks: 1, visited: true, openedDaysAgo: 4 },
      { email: OWL, contact_id: contactId[OWL], opens: 2, openedDaysAgo: 3 },
    ],
    me.id
  );
  // The night owl's two opens, both at 21:xx Karachi (16:xx UTC).
  const at21 = (daysAgo) => {
    const d = new Date(Date.now() - daysAgo * DAY);
    d.setUTCHours(16, 20, 0, 0);
    return d.toISOString();
  };
  const { error: evError } = await admin.from("email_events").insert(
    [3, 4].map((d) => ({ campaign_id: recent.id, recipient_id: recent.recipients[OWL], type: "opened", occurred_at: at21(d), is_machine: false, simulated: false, meta: {} }))
  );
  if (evError) throw new Error(evError.message);

  // ---- hot leads
  const cPage = await signIn(browser, counsellor.email);
  await cPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await cPage.locator("[data-hot-leads]").waitFor({ timeout: 45000 });
  const card = await cPage.locator("[data-hot-leads]").innerText();
  r.ok("hot leads: the lead's counsellor sees them on the dashboard, hot", card.includes("zztmp Hot Lead") && card.includes("Hot"), card.slice(0, 300));
  await cPage.goto(`${BASE}/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  await cPage.locator("[data-lead-engagement]").waitFor({ timeout: 30000 });
  r.ok("hot leads: the lead's page says so, to their counsellor", (await cPage.locator("[data-lead-engagement]").getAttribute("data-lead-engagement")) === "hot", await cPage.locator("[data-lead-engagement]").innerText());
  const oPage = await signIn(browser, other.email);
  await oPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(oPage);
  await oPage.waitForTimeout(3000);
  r.ok("hot leads: another counsellor does not see someone else's lead", !(await oPage.locator("body").innerText()).includes("zztmp Hot Lead"));
  const page = await signIn(browser, me.email);
  await page.goto(`${BASE}/marketing/email/reports`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("hot leads: listed on the Reports tab with their counsellor", (await page.locator("[data-hot-leads-report]").innerText()).includes("zztmp Hot Lead") && (await page.locator("[data-hot-leads-report]").innerText()).includes("zztmp email6c"));

  // ---- the sunset
  await page.goto(`${BASE}/marketing/email/audience/sunset`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("sunset: the silent contact is listed, the engaged ones are not", (await page.locator("[data-sunset-candidates]").innerText()).includes(SILENT) && !(await page.locator("[data-sunset-candidates]").innerText()).includes(OWL));
  await page.locator("[data-sunset-start]").click();
  await page.waitForURL(/campaigns\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const reId = page.url().split("/").pop();
  made.campaigns.push(reId);
  const { data: run } = await admin.from("email_sunset_runs").select("id, list_id, status, people").eq("campaign_id", reId).single();
  made.runs.push(run.id);
  if (run.list_id) made.lists.push(run.list_id);
  const { data: members } = await admin.from("email_list_members").select("contact_id").eq("list_id", run.list_id);
  r.ok("sunset: step one makes a list of the silent and a draft to them", run.status === "waiting" && members.some((m) => m.contact_id === contactId[SILENT]) && !members.some((m) => m.contact_id === contactId[OWL]), JSON.stringify(run));
  // As if it had gone, really, 35 days ago, and they ignored it too.
  await admin.from("email_campaigns").update({ status: "sent", practice: false, started_at: ago(40), finished_at: ago(35), recipients_total: 1 }).eq("id", reId);
  await admin.from("email_campaign_recipients").insert({ campaign_id: reId, contact_id: contactId[SILENT], email: SILENT, status: "sent", sent_at: ago(40) });
  await page.goto(`${BASE}/marketing/email/audience/sunset`, { waitUntil: "domcontentloaded" });
  await settle(page);
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-sunset-suppress]").click();
  const st = await poll("the silent one stopped", async () => {
    const { data } = await admin.from("email_contact_status").select("status, status_reason").eq("email", SILENT).single();
    return data.status === "suppressed" ? data : null;
  });
  const { data: done } = await admin.from("email_sunset_runs").select("status, suppressed").eq("id", run.id).single();
  r.ok("sunset: step two puts the still-silent on the do-not-email list, saying why", st.status_reason.includes("sunset") && done.status === "suppressed" && done.suppressed === 1, JSON.stringify({ st, done }));
  const { data: owlState } = await admin.from("email_contact_status").select("status").eq("email", OWL).single();
  r.ok("sunset: someone who engaged is never touched", owlState.status === "subscribed");

  // ---- each person's best hour
  const { data: t } = await admin.from("email_templates").insert({ name: "zztmp Phase6 Template", created_by: me.id }).select("id").single();
  made.templateId = t.id;
  const { data: v } = await admin.from("email_template_versions").insert({ template_id: t.id, version: 1, source_kind: "html", html: "<p>Hi {{first_name|there}}</p><p>{{unsubscribe_url}}</p>", text_body: "Hi", created_by: me.id }).select("id").single();
  await admin.from("email_templates").update({ current_version_id: v.id }).eq("id", t.id);
  const { data: list } = await admin.from("email_lists").insert({ name: "zztmp Phase6 List", created_by: me.id }).select("id").single();
  made.lists.push(list.id);
  await admin.from("email_list_members").insert([{ list_id: list.id, contact_id: contactId[OWL], added_by: me.id }, { list_id: list.id, lead_id: leadId, added_by: me.id }]);
  await page.goto(`${BASE}/marketing/email/campaigns`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-new-campaign] input[name="name"]', "zztmp Best Hour");
  await page.locator("[data-new-campaign]").getByRole("button", { name: "New campaign" }).click();
  await page.waitForURL(/campaigns\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const bhId = page.url().split("/").pop();
  made.campaigns.push(bhId);
  await settle(page);
  r.ok("best hour: the draft says when recipients open most, or that it cannot tell yet", (await page.locator("[data-open-peak]").innerText()).length > 10);
  await page.fill("[data-campaign-subject]", "zztmp at your hour");
  await page.locator("[data-campaign-template]").selectOption(v.id);
  await page.locator("[data-campaign-everyone]").setChecked(false);
  await page.locator(`input[name="include_lists"][value="${list.id}"]`).check();
  await page.locator("[data-campaign-best-hour]").check();
  await poll("reach of 2", async () => (await page.locator("[data-campaign-reach]").innerText()).includes("Reaches 2 people"));
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("[data-campaign-ready]").waitFor({ timeout: 30000 });
  await page.locator("[data-campaign-send-now]").click();
  await page.getByText("Practice — nothing was sent").waitFor({ timeout: 60000 });
  const { data: queued } = await admin.from("email_campaign_recipients").select("email, next_attempt_at").eq("campaign_id", bhId);
  const owlAt = queued.find((q) => q.email === OWL)?.next_attempt_at;
  const karachiHour = owlAt ? new Date(Date.parse(owlAt) + 5 * 3_600_000).getUTCHours() : null;
  const hotAt = queued.find((q) => q.email === HOT)?.next_attempt_at;
  r.ok("best hour: the 21:00 opener waits for 21:00 Karachi, within a day", karachiHour === 21 && Date.parse(owlAt) - Date.now() < DAY + 60_000, String(owlAt));
  r.ok("best hour: someone with no opens to learn from goes at once", hotAt === null, String(hotAt));
  await admin.from("email_campaigns").update({ status: "cancelled" }).eq("id", bhId);

  // ---- A/B test (0363)
  const AB = Array.from({ length: 24 }, (_, i) => `zztmp-ab${i + 1}@hmarkconsultants.com`);
  const { data: abContacts } = await admin.from("email_contacts").insert(AB.map((email, i) => ({ email, full_name: `zztmp AB${i + 1} Test`, source: "zztmp" }))).select("id");
  const { data: abList } = await admin.from("email_lists").insert({ name: "zztmp AB List", created_by: me.id }).select("id").single();
  made.lists.push(abList.id);
  await admin.from("email_list_members").insert(abContacts.map((c) => ({ list_id: abList.id, contact_id: c.id, added_by: me.id })));
  const { data: tB } = await admin.from("email_templates").insert({ name: "zztmp Phase6 Template B", created_by: me.id }).select("id").single();
  made.templateIds.push(tB.id);
  const { data: vB } = await admin
    .from("email_template_versions")
    .insert({ template_id: tB.id, version: 1, source_kind: "html", html: '<p>Version B body</p><p><a href="https://hmarkconsultants.com/b-page">B link</a></p><p>{{unsubscribe_url}}</p>', text_body: "B", created_by: me.id })
    .select("id")
    .single();
  await admin.from("email_templates").update({ current_version_id: vB.id }).eq("id", tB.id);

  await page.goto(`${BASE}/marketing/email/campaigns`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-new-campaign] input[name="name"]', "zztmp AB Test");
  await page.locator("[data-new-campaign]").getByRole("button", { name: "New campaign" }).click();
  await page.waitForURL(/campaigns\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const abId = page.url().split("/").pop();
  made.campaigns.push(abId);
  await settle(page);
  await page.fill("[data-campaign-subject]", "zztmp Version A subject");
  await page.locator("[data-campaign-template]").selectOption(v.id);
  await page.locator("[data-campaign-everyone]").setChecked(false);
  await page.locator(`input[name="include_lists"][value="${abList.id}"]`).check();
  await page.locator("[data-ab-enabled]").check();
  await page.locator("[data-ab-subject-b]").fill("zztmp Version B subject");
  await page.locator('select[name="ab_template_version_id_b"]').selectOption(vB.id);
  await page.locator('input[name="ab_test_percent"]').fill("50");
  await page.locator('input[name="ab_wait_hours"]').fill("1");
  await poll("reach of 24", async () => (await page.locator("[data-campaign-reach]").innerText()).includes("Reaches 24 people"));
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("[data-campaign-ready]").waitFor({ timeout: 30000 });
  await page.locator("[data-campaign-send-now]").click();
  await page.getByText("Practice — nothing was sent").waitFor({ timeout: 60000 });
  const { data: abRecipients } = await admin.from("email_campaign_recipients").select("id, email, token, status, variant").eq("campaign_id", abId);
  const count = (f) => abRecipients.filter(f).length;
  r.ok("A/B: half tested — six A, six B — and twelve held", count((x) => x.variant === "A") === 6 && count((x) => x.variant === "B") === 6 && count((x) => x.status === "held") === 12, JSON.stringify({ A: count((x) => x.variant === "A"), B: count((x) => x.variant === "B"), held: count((x) => x.status === "held") }));
  const { data: abLinks } = await admin.from("email_campaign_links").select("position, url").eq("campaign_id", abId).order("position");
  const { data: abC } = await admin.from("email_campaigns").select("ab_prepared_html_b, ab_decide_at, started_at").eq("id", abId).single();
  r.ok("A/B: B's email prepared once, its link numbered 1001", abC.ab_prepared_html_b.includes("Version B body") && abLinks.some((l) => l.position === 1001 && l.url === "https://hmarkconsultants.com/b-page"), JSON.stringify(abLinks));
  r.ok("A/B: the winner is picked an hour after the start", Math.abs(Date.parse(abC.ab_decide_at) - Date.parse(abC.started_at) - 3_600_000) < 5000);
  await poll("the test group sent", async () => {
    const { count: sentN } = await admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", abId).eq("status", "sent");
    return sentN === 12;
  }, 180000);
  const { count: stillHeld } = await admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", abId).eq("status", "held");
  r.ok("A/B: the cron sends the test group and holds the rest", stillHeld === 12);
  // B wins: three of its test group opened. Then it is time to decide.
  const bIds = abRecipients.filter((x) => x.variant === "B").slice(0, 3).map((x) => x.id);
  await admin.from("email_campaign_recipients").update({ open_count: 1, human_open_count: 1, first_open_at: new Date().toISOString() }).in("id", bIds);
  await admin.from("email_campaigns").update({ ab_decide_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", abId);
  const decided = await poll("the winner picked and sent to the rest", async () => {
    const { data } = await admin.from("email_campaigns").select("ab_winner, status").eq("id", abId).single();
    return data.ab_winner && data.status === "sent" ? data : null;
  }, 240000);
  const { data: after } = await admin.from("email_campaign_recipients").select("status, variant").eq("campaign_id", abId);
  r.ok("A/B: B won, and the twelve held got B", decided.ab_winner === "B" && after.every((x) => x.status === "sent") && after.filter((x) => x.variant === "B").length === 18, JSON.stringify(decided));
  const bRecipient = abRecipients.find((x) => x.variant === "B");
  const anon = await browser.newContext();
  const bClick = await anon.request.get(`${BASE}/api/email/c/${bRecipient.token}?l=1001`, { maxRedirects: 0 });
  r.ok("A/B: a click on B's link finds B's link", bClick.status() === 302 && (bClick.headers().location ?? "").startsWith("https://hmarkconsultants.com/b-page"), bClick.headers().location);
  const bView = await (await anon.request.get(`${BASE}/email/view/${bRecipient.token}`)).text();
  r.ok("A/B: the web version shows the version they got", bView.includes("Version B body"));
  await anon.close();
  await page.goto(`${BASE}/marketing/email/campaigns/${abId}/report`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const abTable = await page.locator("[data-ab-results]").innerText();
  r.ok("A/B: the report shows each version and the winner", abTable.includes("zztmp Version B subject") && abTable.includes("Winner"), abTable);
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  if (made.runs.length) await admin.from("email_sunset_runs").delete().in("id", made.runs);
  if (made.campaigns.length) await admin.from("email_campaigns").delete().in("id", made.campaigns);
  await admin.from("email_campaigns").delete().like("name", "%zztmp%");
  if (made.lists.length) await admin.from("email_lists").delete().in("id", made.lists);
  await admin.from("email_lists").delete().like("name", "zztmp%");
  for (const tid of [made.templateId, ...made.templateIds].filter(Boolean)) {
    await admin.from("email_templates").update({ current_version_id: null }).eq("id", tid);
    await admin.from("email_templates").delete().eq("id", tid);
  }
  await admin.from("email_contacts").delete().like("email", "zztmp-%");
  await admin.from("email_contact_status").delete().like("email", "zztmp-%");
  if (made.staff.length) await admin.from("email_activity_log").delete().in("staff_id", made.staff);
  removed = await fx.cleanup();
  await browser.close();
}
process.exit(r.finish(removed) ? 1 : 0);
