// Email campaigns, part 2 (0355): the audience, on the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailaudience
//
//   overview     a reachable count; looking up a real lead shows them
//                subscribed, consent from their enquiry (read-only on the lead)
//   segment      Italy: a live count smaller than everyone; saved
//   list         pasted addresses: the lead joins as itself, one new contact,
//                a bad address and a domain that takes no email refused; the
//                new contact's consent recorded
//   import       a CSV: the email column guessed; one added, the repeat counted
//                once, the bad row listed by line
//   do-not-email listed with its reason; taken off again
//   activity     (0360) a REAL fixture campaign one of two contacts opened: the
//                "Email activity" rules count the opener, the silent one,
//                and nobody "never sent one"
//   public pages preferences opens signed out, a topic saved, unsubscribe from
//                all; the unsubscribe page says so; one-click unsubscribe
//                answers 200 at once; an unknown token changes nothing
//
// Everything it makes is named zztmp and removed in a finally.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailaudience");

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
    await new Promise((res) => setTimeout(res, 1000));
  }
};
const csvPath = join(tmpdir(), "zztmp-contacts.csv");
writeFileSync(csvPath, "Name,E-mail,City\nzztmp Imp One,zztmp-imp1@gmail.com,Karachi\nzztmp Imp Again,ZZTMP-IMP1@gmail.com,Karachi\nzztmp Bad,not-an-address,Lahore\n");

try {
  const { data: someLead } = await admin.from("leads").select("id, full_name, email").eq("status", "in_discussion").not("email", "is", null).ilike("email", "%@gmail.com").limit(1).single();
  const me = await fx.staff("emailaud", ["super_admin"]);
  const page = await signIn(browser, me.email);

  // Overview
  await page.goto(`${BASE}/marketing/email/audience`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const kpis = await page.locator("[data-audience-kpis]").innerText();
  const reachable = Number((kpis.match(/Reachable\s*([\d,]+)/i)?.[1] ?? "0").replace(/,/g, ""));
  r.ok("overview: a reachable count", reachable > 1000, String(reachable));
  await page.fill("[data-audience-lookup] input", someLead.email);
  await page.locator("[data-audience-lookup] li").first().waitFor({ timeout: 15000 });
  const found = await page.locator("[data-audience-lookup]").innerText();
  r.ok("lookup: a lead, subscribed, consent from their enquiry", found.includes("Subscribed") && found.includes("Enquiry"), found.slice(0, 200));

  // Segment
  await page.goto(`${BASE}/marketing/email/audience/segments/new`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-segment-builder] input[name="name"]', "zztmp Italy segment");
  await page.locator("[data-add-rule]").click();
  const rule = page.locator("[data-segment-rule]").first();
  await rule.locator('select[aria-label="Add a value"]').selectOption("italy");
  // The count shows everyone until the recount with the rule comes back; wait for it to change.
  const italyCount = await poll("the Italy count", async () => {
    const t = await page.locator("[data-segment-count]").innerText();
    const n = Number(t.replace(/[^\d]/g, ""));
    return !t.includes("counting") && n > 0 && n < reachable ? n : null;
  });
  r.ok("segment: a live count for Italy, smaller than everyone", italyCount > 0 && italyCount < reachable, `${italyCount} of ${reachable}`);
  await page.getByRole("button", { name: "Create segment" }).click();
  await page.waitForURL(/segments\/[0-9a-f-]{36}/, { timeout: 30000 });
  r.ok("segment: saved", true);

  // List: paste
  await page.goto(`${BASE}/marketing/email/audience/lists`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('input[name="name"]', "zztmp List");
  await page.getByRole("button", { name: "Create list" }).click();
  await page.waitForURL(/lists\/[0-9a-f-]{36}/, { timeout: 30000 });
  await settle(page);
  await page.fill('[data-paste-to-list] textarea[name="emails"]', `${someLead.email}\nzztmp-new@hmarkconsultants.com\nbad-one\nzztmp-x@no-such-domain-zz9q.invalid`);
  await page.fill('[data-paste-to-list] input[name="consent_source"]', "zztmp test consent");
  await page.locator("[data-paste-to-list]").getByRole("button", { name: "Add to the list" }).click();
  await page.locator("[data-add-report]").waitFor({ timeout: 60000 });
  const rep = await page.locator("[data-add-report]").innerText();
  r.ok("paste: lead joins as itself, one new contact, two refused", rep.includes("2 added") && rep.includes("1 were leads") && rep.includes("1 new contacts") && rep.includes("2 could not be used") && rep.includes("takes no email"), rep);
  await page.reload({ waitUntil: "domcontentloaded" });
  r.ok("the list shows both members", (await page.locator("[data-list-members] tbody tr").count()) === 2);
  const { data: newState } = await admin.from("email_contact_status").select("consent_source, token, status").eq("email", "zztmp-new@hmarkconsultants.com").single();
  r.ok("the new contact's consent is recorded", newState?.consent_source === "zztmp test consent" && newState.status === "subscribed");

  // Import
  await page.goto(`${BASE}/marketing/email/audience/import`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator('[data-import-wizard] input[type="file"]').setInputFiles(csvPath);
  await page.waitForFunction(() => document.querySelector('[data-import-wizard] [data-staged]') !== null, null, { timeout: 30000 }).catch(() => {});
  await page.getByRole("button", { name: "Read the file" }).click();
  await page.locator("[data-import-mapping]").waitFor({ timeout: 30000 });
  r.ok("import: the email column was guessed", (await page.locator('select[name="map_email"]').inputValue()) === "1" && (await page.locator('select[name="map_full_name"]').inputValue()) === "0");
  await page.fill('input[name="new_list"]', "zztmp Import List");
  await page.fill('input[name="consent_source"]', "zztmp import consent");
  await page.getByRole("button", { name: /^Import 3 rows/ }).click();
  await page.locator("[data-add-report]").waitFor({ timeout: 90000 });
  const imp = await page.locator("[data-add-report]").innerText();
  r.ok("import: one added, the repeat counted once, the bad row listed", imp.includes("1 added") && imp.includes("1 repeated") && imp.includes("line 4"), imp);

  // Segments on email activity (0360): a REAL fixture campaign, which one of two contacts opened.
  const { data: engList } = await admin.from("email_lists").insert({ name: "zztmp Engage List", created_by: me.id }).select("id").single();
  const { data: engContacts } = await admin
    .from("email_contacts")
    .insert([
      { email: "zztmp-eng-opened@hmarkconsultants.com", full_name: "zztmp Eng Opened", source: "zztmp" },
      { email: "zztmp-eng-silent@hmarkconsultants.com", full_name: "zztmp Eng Silent", source: "zztmp" },
    ])
    .select("id, email");
  await admin.from("email_list_members").insert(engContacts.map((c) => ({ list_id: engList.id, contact_id: c.id, added_by: me.id })));
  const sentAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: realCampaign, error: realError } = await admin
    .from("email_campaigns")
    .insert({ name: "zztmp Real Engagement", slug: "zztmp-real-engagement", status: "sent", practice: false, started_at: sentAt, finished_at: sentAt, recipients_total: 2, created_by: me.id })
    .select("id")
    .single();
  if (realError) throw new Error(realError.message);
  await admin.from("email_campaign_recipients").insert(
    engContacts.map((c) => {
      const opened = c.email.includes("opened") ? 1 : 0;
      return { campaign_id: realCampaign.id, contact_id: c.id, email: c.email, status: "sent", sent_at: sentAt, open_count: opened, human_open_count: opened };
    })
  );
  await page.goto(`${BASE}/marketing/email/audience/segments/new`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-segment-builder] input[name="name"]', "zztmp Engagement segment");
  await page.locator("[data-add-rule]").click();
  const onList = page.locator("[data-segment-rule]").nth(0);
  await onList.locator('select[aria-label="Field"]').selectOption("list");
  await onList.locator('select[aria-label="Add a value"]').selectOption(engList.id);
  await page.locator("[data-add-rule]").click();
  const activity = page.locator("[data-segment-rule]").nth(1);
  await activity.locator('select[aria-label="Field"]').selectOption("engagement");
  const countIs = (n, what) =>
    poll(what, async () => {
      const t = await page.locator("[data-segment-count]").innerText();
      return !t.includes("counting") && Number(t.replace(/[^\d]/g, "")) === n;
    });
  await countIs(1, "1 opened the last campaign");
  r.ok("email activity: 'opened the last campaign' counts the opener alone", true);
  r.ok("email activity: says practice sends and machines don't count", (await activity.locator("[data-engagement-note]").innerText()).includes("Real campaigns only"));
  await activity.locator('select[aria-label="Comparison"]').selectOption("not_opened_last");
  await countIs(1, "1 did not open it");
  await activity.locator('select[aria-label="Comparison"]').selectOption("never_emailed");
  await countIs(0, "nobody never sent one");
  r.ok("email activity: 'did not open' is the silent one; 'never been sent one' is nobody", true);

  // Do-not-email
  await page.goto(`${BASE}/marketing/email/audience/suppressed`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.fill('[data-suppress-form] textarea[name="emails"]', "zztmp-imp1@gmail.com");
  await page.fill('[data-suppress-form] input[name="reason"]', "zztmp asked by phone");
  await page.locator("[data-suppress-form]").getByRole("button", { name: "Add to the do-not-email list" }).click();
  await page.locator("[data-suppress-form] .text-success").waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  r.ok("do-not-email: listed with its reason", (await page.locator("[data-suppressed-list]").innerText()).includes("zztmp asked by phone"));
  page.once("dialog", (d) => d.accept());
  await page.locator("tr", { hasText: "zztmp-imp1@gmail.com" }).getByRole("button", { name: "Take off" }).click();
  await page.waitForTimeout(2500);
  const { data: restored } = await admin.from("email_contact_status").select("status").eq("email", "zztmp-imp1@gmail.com").single();
  r.ok("do-not-email: taken off again", restored?.status === "subscribed");

  // Public pages, signed out
  const anon = await browser.newPage();
  await anon.goto(`${BASE}/email/preferences/${newState.token}`, { waitUntil: "domcontentloaded" });
  await anon.locator("[data-email-preferences]").waitFor({ timeout: 20000 });
  await anon.waitForLoadState("networkidle").catch(() => {});
  r.ok("preferences: opens without a login", (await anon.locator("[data-email-preferences]").innerText()).includes("zztmp-new@hmarkconsultants.com"));
  const boxes = anon.locator('input[name="topic"]');
  const nBoxes = await boxes.count();
  for (let i = 1; i < nBoxes; i++) await boxes.nth(i).uncheck();
  await anon.getByRole("button", { name: "Save my choices" }).click();
  await anon.locator("[data-email-preferences] .text-success").waitFor({ timeout: 20000 });
  const { data: afterTopics } = await admin.from("email_contact_status").select("topics").eq("email", "zztmp-new@hmarkconsultants.com").single();
  r.ok("preferences: one topic saved", afterTopics.topics.length === 1, JSON.stringify(afterTopics.topics));
  await anon.locator("[data-unsubscribe-all]").click();
  await anon.getByText("You are unsubscribed and won").waitFor({ timeout: 20000 });
  const { data: unsub } = await admin.from("email_contact_status").select("status, status_reason").eq("email", "zztmp-new@hmarkconsultants.com").single();
  r.ok("preferences: unsubscribe from all", unsub.status === "unsubscribed");
  await anon.goto(`${BASE}/email/unsubscribe/${newState.token}`, { waitUntil: "domcontentloaded" });
  r.ok("unsubscribe page: says they are unsubscribed", (await anon.locator("body").innerText()).includes("You are unsubscribed"));
  const { data: impState } = await admin.from("email_contact_status").select("token").eq("email", "zztmp-imp1@gmail.com").single();
  const oneClick = await anon.request.post(`${BASE}/api/email/unsubscribe/${impState.token}`, { data: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0 });
  const { data: oneClickState } = await admin.from("email_contact_status").select("status").eq("email", "zztmp-imp1@gmail.com").single();
  r.ok("one-click unsubscribe: 200 at once, no redirect", oneClick.status() === 200 && oneClickState.status === "unsubscribed", String(oneClick.status()));
  const unknown = await anon.request.post(`${BASE}/api/email/unsubscribe/${"0".repeat(36)}`, { maxRedirects: 0 });
  r.ok("one-click unsubscribe: an unknown token changes nothing", unknown.status() === 404);
  await anon.close();
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  await admin.from("email_campaigns").delete().like("name", "%zztmp%");
  await admin.from("email_segments").delete().like("name", "zztmp%");
  await admin.from("email_lists").delete().like("name", "zztmp%");
  await admin.from("email_contacts").delete().like("email", "zztmp-%");
  await admin.from("email_contact_status").delete().like("email", "zztmp-%");
  removed = await fx.cleanup();
  await browser.close();
}
process.exit(r.finish(removed) ? 1 : 0);
