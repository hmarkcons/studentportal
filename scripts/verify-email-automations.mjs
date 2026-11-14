// Email campaigns, Phase 6 (0364): automations, on the deployed portal. Takes
// up to fifteen minutes: the journeys run every ten minutes, the sender
// every minute.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailautomations
//
//   welcome      a "new lead enquires" journey built and switched on from the
//                screen (email 1 at once; email 2 three days later, only if
//                they did not open the first): each email gets its campaign
//                (kind automation); a lead who enquires after it is switched
//                on joins it and is sent email 1, and waits for email 2
//   interview    an "interview is coming up" journey (10, 5 and 1 days
//                before) and an interview five days away: the 10-days email
//                is skipped (never sent late), the 5-days one goes, the
//                1-day one waits
//   screens      the journey's page lists who is on it and each email's
//                results; the campaign list leaves automation emails out;
//                Pause holds the journey and its emails
//
// Everything it makes is removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailautomations");

const { admin } = clients();
const fx = fixtures(admin);
const r = reporter();
const browser = await openBrowser();
let removed = 0;
const settle = (p) => p.waitForLoadState("networkidle").catch(() => {});
const poll = async (what, fn, ms = 30000, every = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, every));
  }
};
const DAY = 86_400_000;
const made = { journeys: [], templateId: null, universityId: null, staff: [] };

/** Builds a journey on screen: its emails as [{ days, condition?, subject }]. */
async function buildJourney(page, { name, trigger, emails, versionId }) {
  await page.goto(`${BASE}/marketing/email/automations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-new-journey] input[name="name"]', name);
  await page.locator('[data-new-journey] select[name="trigger"]').selectOption(trigger);
  await page.locator("[data-new-journey]").getByRole("button", { name: "New automation" }).click();
  await page.waitForURL(/automations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const id = page.url().split("/").pop();
  made.journeys.push(id);
  await settle(page);
  for (let i = 0; i < emails.length; i++) {
    if (i > 0) await page.locator("[data-add-step]").click();
    const step = page.locator("[data-journey-step]").nth(i);
    await step.locator('input[aria-label="Days"]').fill(String(emails[i].days));
    if (emails[i].condition) await step.locator('select[aria-label="When it goes"]').selectOption(emails[i].condition);
    await step.locator('input[aria-label="Subject"]').fill(emails[i].subject);
    await step.locator('select[aria-label="Template"]').selectOption(versionId);
  }
  await page.locator("[data-journey-editor]").getByRole("button", { name: "Save" }).click();
  await poll("the steps saved", async () => (await admin.from("email_journey_steps").select("id").eq("journey_id", id)).data?.length === emails.length);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator("[data-journey-activate]").click();
  await poll("switched on", async () => (await admin.from("email_journeys").select("status").eq("id", id).single()).data.status === "active");
  return id;
}

try {
  const me = await fx.staff("emailauto", ["super_admin"]);
  made.staff.push(me.id);
  const { data: t } = await admin.from("email_templates").insert({ name: "zztmp Automation Template", created_by: me.id }).select("id").single();
  made.templateId = t.id;
  const { data: v } = await admin
    .from("email_template_versions")
    .insert({ template_id: t.id, version: 1, source_kind: "html", html: '<p>Hi {{first_name|there}}</p><p><a href="https://hmarkconsultants.com/">HMARK</a></p><p>{{unsubscribe_url}}</p>', text_body: "Hi", created_by: me.id })
    .select("id")
    .single();
  await admin.from("email_templates").update({ current_version_id: v.id }).eq("id", t.id);
  const page = await signIn(browser, me.email);

  // ---- welcome series
  const welcomeId = await buildJourney(page, {
    name: "zztmp Welcome",
    trigger: "new_lead",
    versionId: v.id,
    emails: [
      { days: 0, subject: "zztmp Welcome to HMARK, {{first_name|there}}" },
      { days: 3, condition: "not_opened_previous", subject: "zztmp In case you missed it" },
    ],
  });
  const { data: wSteps } = await admin.from("email_journey_steps").select("position, campaign_id").eq("journey_id", welcomeId).order("position");
  const { data: wCampaigns } = await admin.from("email_campaigns").select("id, kind, status").in("id", wSteps.map((s) => s.campaign_id));
  r.ok("welcome: switched on, each email with its own automation campaign", wSteps.every((s) => s.campaign_id) && wCampaigns.length === 2 && wCampaigns.every((c) => c.kind === "automation" && c.status === "sending"), JSON.stringify(wCampaigns));
  // A lead who enquires after it was switched on.
  await new Promise((res) => setTimeout(res, 2000));
  const newLead = await fx.lead({ full_name: "zztmp Welcome Lead", email: "zztmp-welcome@hmarkconsultants.com", contact_number: "0300-9999996", status: "in_discussion", date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy" });

  // ---- interview countdown
  const { data: italy } = await admin.from("destinations").select("id").ilike("country", "%italy%").limit(1).single();
  const { data: uni, error: uniError } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp Automation University", short_name: "zztmp AU", city: "zztmp City", type: "public" }).select("id").single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  made.universityId = uni.id;
  const interviewLead = await fx.lead({ full_name: "zztmp Interview Lead", email: "zztmp-interview@hmarkconsultants.com", contact_number: "0300-9999995", status: "in_discussion", date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy" });
  const { data: app, error: appError } = await admin.from("applications").insert({ student_id: interviewLead, university_id: uni.id, intake: "Fall 2099" }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  const { error: ivError } = await admin.from("application_interviews").insert({ application_id: app.id, round_label: "zztmp Interview", status: "scheduled", confirmed_datetime: new Date(Date.now() + 5 * DAY - 3_600_000).toISOString() });
  if (ivError) throw new Error(`interview: ${ivError.message}`);
  const interviewId = await buildJourney(page, {
    name: "zztmp Interview countdown",
    trigger: "interview",
    versionId: v.id,
    emails: [
      { days: 10, subject: "zztmp Ten days to your interview" },
      { days: 5, subject: "zztmp Five days to your interview" },
      { days: 1, subject: "zztmp Tomorrow: your interview" },
    ],
  });
  const { data: iSteps } = await admin.from("email_journey_steps").select("position, day, campaign_id").eq("journey_id", interviewId).order("position");
  r.ok("interview: the days are stored as days before", iSteps.map((s) => s.day).join() === "-10,-5,-1", iSteps.map((s) => s.day).join());

  // ---- the run (every ten minutes) and the sender (every minute)
  const welcomeEnrol = await poll(
    "the welcome series to take the new lead in",
    async () => (await admin.from("email_journey_enrolments").select("status, next_position").eq("journey_id", welcomeId).eq("lead_id", newLead).maybeSingle()).data,
    12 * 60_000,
    15_000
  );
  r.ok("welcome: the lead who enquired after it was switched on joined", welcomeEnrol.status === "active");
  const w1 = await poll(
    "email 1 sent",
    async () => {
      const { data } = await admin.from("email_campaign_recipients").select("status").eq("campaign_id", wSteps[0].campaign_id).eq("lead_id", newLead).maybeSingle();
      return data?.status === "sent" ? data : null;
    },
    5 * 60_000,
    10_000
  );
  const { data: wNow } = await admin.from("email_journey_enrolments").select("status, next_position").eq("journey_id", welcomeId).eq("lead_id", newLead).single();
  const { count: w2Count } = await admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", wSteps[1].campaign_id);
  r.ok("welcome: email 1 sent at once; email 2 waits its three days", w1.status === "sent" && wNow.next_position === 2 && wNow.status === "active" && w2Count === 0, JSON.stringify(wNow));
  // Anyone who enquired after the switch-on may join (the interview check's lead does); nobody from before.
  const { data: wj } = await admin.from("email_journeys").select("activated_at").eq("id", welcomeId).single();
  const { data: joined } = await admin.from("email_journey_enrolments").select("lead:leads(created_at)").eq("journey_id", welcomeId);
  const early = (joined ?? []).filter((e) => Date.parse((Array.isArray(e.lead) ? e.lead[0] : e.lead).created_at) < Date.parse(wj.activated_at));
  r.ok("welcome: no lead from before it was switched on joined", early.length === 0, `${early.length} of ${joined?.length}`);

  const iEnrol = await poll("the interview countdown to take them in", async () => (await admin.from("email_journey_enrolments").select("status, next_position").eq("journey_id", interviewId).eq("lead_id", interviewLead).maybeSingle()).data, 12 * 60_000, 15_000);
  const counts = await Promise.all(iSteps.map(async (s) => (await admin.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", s.campaign_id)).count));
  r.ok("interview: ten days before is skipped (never late), five days before goes, the day before waits", iEnrol.next_position === 3 && iEnrol.status === "active" && counts.join() === "0,1,0", `${JSON.stringify(iEnrol)} ${counts.join()}`);

  // ---- the screens
  await page.goto(`${BASE}/marketing/email/automations/${welcomeId}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("journey page: who is on it", (await page.locator("[data-journey-enrolments]").innerText()).includes("zztmp Welcome Lead"));
  r.ok("journey page: each email's results", (await page.locator("[data-journey-steps-stats]").innerText()).includes("1. at once"));
  await page.goto(`${BASE}/marketing/email/campaigns`, { waitUntil: "domcontentloaded" });
  await settle(page);
  r.ok("the campaign list leaves automation emails out", !(await page.locator("body").innerText()).includes("zztmp Welcome — email 1"));
  await page.goto(`${BASE}/marketing/email/automations/${welcomeId}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator("[data-journey-pause]").click();
  await poll("paused", async () => (await admin.from("email_journeys").select("status").eq("id", welcomeId).single()).data.status === "paused");
  const { data: pausedC } = await admin.from("email_campaigns").select("status").in("id", wSteps.map((s) => s.campaign_id));
  r.ok("pause: the journey and its emails are held", pausedC.every((c) => c.status === "paused"));
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  // The journeys' step campaigns, then the journeys (their steps and enrolments go with them).
  if (made.journeys.length) {
    const { data: steps } = await admin.from("email_journey_steps").select("campaign_id").in("journey_id", made.journeys);
    const ids = (steps ?? []).map((s) => s.campaign_id).filter(Boolean);
    await admin.from("email_journeys").delete().in("id", made.journeys);
    if (ids.length) await admin.from("email_campaigns").delete().in("id", ids);
  }
  await admin.from("email_campaigns").delete().like("name", "zztmp%");
  if (made.universityId) {
    await admin.from("applications").delete().eq("university_id", made.universityId);
    await admin.from("universities").delete().eq("id", made.universityId);
  }
  if (made.templateId) {
    await admin.from("email_templates").update({ current_version_id: null }).eq("id", made.templateId);
    await admin.from("email_templates").delete().eq("id", made.templateId);
  }
  await admin.from("email_contact_status").delete().like("email", "zztmp-%");
  if (made.staff.length) await admin.from("email_activity_log").delete().in("staff_id", made.staff);
  removed = await fx.cleanup();
  await browser.close();
}
process.exit(r.finish(removed) ? 1 : 0);
