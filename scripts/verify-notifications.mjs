// Notifications (0320), end to end against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:notify
//
//   * a student: two messages from HMARK are one alert ("2 new messages"),
//     under the bell and in What's new on the dashboard, with the count on
//     the bell; a document sent back is news with its reason, and a to-do;
//     opening the alert marks it read and lands on the page; a broadcast is
//     listed but not emailed;
//   * a counsellor: a lead assigned to them is news; a student's message is
//     a to-do (waiting on a reply), not news twice over; a follow-up due
//     today is a to-do; Mark all read clears the count;
//   * a Super Admin: their own to-dos in full, the office's as totals; a
//     partner university's message is news, and is on the university's page;
//   * a partner: HMARK's message is news under their bell;
//   * against a deployment, each alert is emailed once it has been quiet two
//     minutes (fixture addresses are never really sent — emailRecipients.ts).
//
// Fixtures are named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:notify");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const STUDENT_EMAIL = "zztmp-notify-student@hmark-test.local";
const PARTNER_EMAIL = "zztmp-notify-partner@hmark-test.local";
const UNI = "zztmp Notify University";

/** Polls until `fn` returns something truthy, or gives up after `seconds`. */
async function poll(fn, seconds = 30, every = 400) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
};

const hydrated = (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });

/** Opens the bell's panel, with the feed it asked for loaded. */
async function openBell(page) {
  await hydrated(page, "[data-notification-bell] button");
  // The bell asks for its feed a moment after the page settles.
  await page.locator("[data-notification-bell] [data-bell-count]").first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.locator("[data-notification-bell] > button").click();
  const panel = page.locator("[data-notification-panel]");
  await panel.locator("[data-bell-news]").waitFor({ timeout: 30000 });
  return panel;
}

let browser = null;
let studentUserId = null;
let partnerUserId = null;
let universityId = null;
/** The fixture students and staff, whose messages go before they do (messages.sent_by holds the staff). */
const studentIds = [];
const staffIds = [];

try {
  for (const email of [STUDENT_EMAIL, PARTNER_EMAIL]) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email === email) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }

  const sup = await fx.staff("notifysuper", ["super_admin"]);
  const cou = await fx.staff("notifycoun", ["counselor"]);
  const proc = await fx.staff("notifyproc", ["processing"]);
  staffIds.push(sup.id, cou.id, proc.id);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();

  // ------------------------------------------------------------- the student
  const studentId = await fx.lead({
    full_name: "zztmp Notify Student", email: STUDENT_EMAIL, contact_number: "0300-9999961",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), assigned_counselor_id: cou.id, processing_officer_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  studentIds.push(studentId);
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  const coded = await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  ok("the fixture student has a Student ID", Boolean(coded), String(coded));
  const { data: madeStudent, error: studentAuthError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (studentAuthError) throw new Error(`student login: ${studentAuthError.message}`);
  studentUserId = madeStudent.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  // Two messages from HMARK, written as staff write them (no signed-in actor here).
  for (const body of ["zztmp Your offer letter is in", "zztmp Please book your visa appointment"]) {
    await admin.from("messages").insert({ entity_type: "student", entity_id: studentId, channel: "inapp", direction: "outbound", body, sent_by: cou.id });
  }
  const grouped = await poll(async () => {
    const { data } = await admin.from("notifications").select("id, count, title_many, feed, email_state").eq("user_id", studentUserId).eq("kind", "message").is("read_at", null).maybeSingle();
    return data?.count === 2 ? data : null;
  });
  ok("two messages from HMARK are one alert, counted twice", Boolean(grouped), JSON.stringify(grouped));

  // A document sent back, with its reason.
  const { data: doc } = await admin.from("student_documents")
    .insert({ student_id: studentId, category: "passport", custom_name: "zztmp Passport scan", status: "submitted", uploaded_by_role: "student", uploaded_at: new Date().toISOString() })
    .select("id").single();
  await admin.from("student_documents").update({ status: "rejected", rejected_reason: "zztmp The scan is blurred" }).eq("id", doc.id);
  const rejected = await poll(async () => {
    const { data } = await admin.from("notifications").select("title, body").eq("user_id", studentUserId).eq("kind", "document_rejected").maybeSingle();
    return data;
  });
  ok("a document sent back is news, with its reason", rejected?.title === "zztmp Passport scan needs uploading again" && rejected?.body === "zztmp The scan is blurred", JSON.stringify(rejected));
  const handlerAlert = await poll(async () => (await admin.from("notifications").select("read_at, feed").eq("user_id", proc.id).eq("kind", "document_submitted").maybeSingle()).data);
  ok("...the upload had told the processing officer, by email only", handlerAlert && handlerAlert.feed === false, JSON.stringify(handlerAlert));
  ok("...and their alert cleared once it was reviewed", Boolean(handlerAlert?.read_at), JSON.stringify(handlerAlert));

  browser = await openBrowser();
  console.log("\n--- the student ---");
  const studentPage = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await studentPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await studentPage
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await studentPage.fill('input[name="email"]', STUDENT_EMAIL);
  await studentPage.fill('input[type="password"]', FIXTURE_PASSWORD);
  await studentPage.click('button[type="submit"]');
  await studentPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await studentPage.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });

  const card = studentPage.locator("[data-whats-new]");
  const cardShown = await card.waitFor({ timeout: 60000 }).then(() => true, () => false);
  if (!cardShown) {
    const tail = (await studentPage.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(-600);
    throw new Error(`no What's new on ${studentPage.url()}: ${tail}`);
  }
  ok("the dashboard has What's new, with two unread", (await card.locator("[data-whats-new-unread]").getAttribute("data-whats-new-unread")) === "2");
  ok("...the messages as one: \"2 new messages from HMARK\"", (await card.getByText("2 new messages from HMARK").count()) === 1);
  ok("...and the document sent back", (await card.getByText("zztmp Passport scan needs uploading again").count()) === 1);

  const count = await poll(async () => Number(await studentPage.locator("[data-bell-count]").getAttribute("data-bell-count")), 30);
  ok("the bell counts what is new and what is to do", count >= 3, String(count));
  await shot(studentPage, "n1-student-dashboard");
  const panel = await openBell(studentPage);
  await shot(studentPage, "n2-student-bell");
  ok("under the bell: the document to upload, as a to-do", (await panel.locator("[data-bell-todo]").getByText("1 document to upload").count()) === 1,
    (await panel.locator("[data-bell-todo]").innerText()).replace(/\s+/g, " "));
  ok("...and the news", (await panel.locator("[data-bell-news]").getByText("2 new messages from HMARK").count()) === 1);
  await panel.locator('[data-notification="message"]').first().click();
  await studentPage.waitForURL((u) => u.pathname === "/portal/messages", { timeout: 30000 });
  ok("opening it lands on Messages", true);
  const read = await poll(async () => (await admin.from("notifications").select("read_at").eq("id", grouped?.id ?? "").maybeSingle()).data?.read_at, 20);
  ok("...and marks it read", Boolean(read));

  // A broadcast: listed, never emailed.
  await admin.from("messages").insert({ entity_type: "student", entity_id: studentId, channel: "inapp", direction: "outbound", body: "zztmp Open day on Saturday", broadcast: true });
  // Found by its words: the student is on Messages, which may already have marked it read.
  const broadcast = await poll(async () => (await admin.from("notifications").select("email_state").eq("user_id", studentUserId).eq("kind", "message").eq("body", "zztmp Open day on Saturday").maybeSingle()).data);
  ok("a broadcast is listed but not emailed", broadcast?.email_state === "skipped", JSON.stringify(broadcast));

  // ------------------------------------------------------------- the counsellor
  console.log("\n--- the counsellor ---");
  const leadId = await fx.lead({ full_name: "zztmp Notify Lead", contact_number: "0300-9999962", assigned_counselor_id: cou.id, date_of_inquiry: new Date().toISOString().slice(0, 10) });
  studentIds.push(leadId);
  await admin.from("reminders").insert({ student_id: leadId, type: "follow_up", due_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }), note: "zztmp Call about the budget" });
  await admin.from("messages").insert({ entity_type: "student", entity_id: studentId, channel: "inapp", direction: "inbound", body: "zztmp When is my interview?" });
  const studentWrote = await poll(async () => (await admin.from("notifications").select("feed, email_state").eq("user_id", cou.id).eq("kind", "student_message").maybeSingle()).data);
  ok("a student's message alerts their counsellor, by email only", studentWrote?.feed === false, JSON.stringify(studentWrote));

  const couPage = await signIn(browser, cou.email);
  await couPage.setViewportSize({ width: 1500, height: 1100 });
  await couPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const couCard = couPage.locator("[data-whats-new]");
  await couCard.waitFor({ timeout: 60000 });
  // The student, and then the lead: two assignments, one alert.
  ok("What's new: the student and the lead assigned to them, as one", (await couCard.getByText("2 leads assigned to you").count()) === 1, (await couCard.innerText()).replace(/\s+/g, " "));
  ok("...and not the student's message, which is a to-do", (await couCard.getByText(/New message from zztmp Notify Student/).count()) === 0);
  await shot(couPage, "n3-counsellor-dashboard");
  const couPanel = await openBell(couPage);
  await shot(couPage, "n4-counsellor-bell");
  const todoText = (await couPanel.locator("[data-bell-todo]").innerText()).replace(/\s+/g, " ");
  ok("under the bell, to do: the student waiting on a reply", /zztmp Notify Student is waiting on a reply/.test(todoText), todoText);
  ok("...and the follow-up due today", /zztmp Notify Lead — zztmp Call about the budget/.test(todoText), todoText);
  ok("the dashboard queue lists the follow-up", (await couPage.locator('[data-waiting-line="followup"]').count()) === 1);
  await couPanel.locator("[data-mark-all-read]").click();
  const cleared = await poll(async () => {
    const { count: unread } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", cou.id).eq("feed", true).is("read_at", null);
    return unread === 0 ? true : null;
  }, 20);
  ok("Mark all read clears their news", cleared === true);

  // ------------------------------------------------------------ the partner
  console.log("\n--- a partner university ---");
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: madePartner, error: partnerAuthError } = await admin.auth.admin.createUser({ email: PARTNER_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (partnerAuthError) throw new Error(`partner login: ${partnerAuthError.message}`);
  partnerUserId = madePartner.user.id;
  await admin.from("partner_university_accounts").insert({ id: partnerUserId, university_id: universityId, staff_name: "zztmp Partner", status: "active" });
  await admin.from("messages").insert({ entity_type: "university", entity_id: universityId, channel: "inapp", direction: "outbound", body: "zztmp Ten applications are on their way", sent_by: sup.id });
  await admin.from("messages").insert({ entity_type: "university", entity_id: universityId, channel: "inapp", direction: "inbound", body: "zztmp Thank you, received" });
  // That alerted every Super Admin and Management member, the real ones too.
  // Theirs go at once — inside the two quiet minutes before any is emailed —
  // and the fixture Super Admin's is kept to check.
  const toAll = await poll(async () => {
    const { data } = await admin.from("notifications").select("user_id").eq("kind", "partner_message").like("link", `%${universityId}%`);
    return data?.length ? data : null;
  }, 15);
  ok("a partner's message alerts every Super Admin and Management member", (toAll ?? []).some((r) => r.user_id === sup.id), JSON.stringify(toAll?.length));
  await admin.from("notifications").delete().eq("kind", "partner_message").like("link", `%${universityId}%`).neq("user_id", sup.id);

  const partnerPage = await signIn(browser, PARTNER_EMAIL);
  await partnerPage.goto(`${BASE}/partner`, { waitUntil: "domcontentloaded" });
  const partnerPanel = await openBell(partnerPage);
  ok("a partner hears of HMARK's message under the bell", (await partnerPanel.locator("[data-bell-news]").getByText("New message from HMARK").count()) === 1,
    (await partnerPanel.innerText()).replace(/\s+/g, " "));

  // --------------------------------------------------------- the Super Admin
  console.log("\n--- a Super Admin ---");
  const supPage = await signIn(browser, sup.email);
  await supPage.setViewportSize({ width: 1500, height: 1100 });
  await supPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const supCard = supPage.locator("[data-whats-new]");
  await supCard.waitFor({ timeout: 60000 });
  ok("What's new: the partner university's message", (await supCard.getByText(`Message from ${UNI}`).count()) === 1, (await supCard.innerText()).replace(/\s+/g, " "));
  await shot(supPage, "n5-super-dashboard");
  ok("their queue keeps the office's work as totals", (await supPage.locator("[data-office-totals]").count()) === 1 && (await supPage.locator('[data-office-line="followup"]').count()) === 1);
  ok("...and lists none of it one by one", (await supPage.locator('[data-staff-queue] [data-waiting-line="followup"]').count()) === 0);
  await supPage.goto(`${BASE}/setup/universities/${universityId}#messages`, { waitUntil: "domcontentloaded" });
  const thread = supPage.locator("[data-university-messages]");
  ok("the university's page shows the thread", await thread.waitFor({ timeout: 60000 }).then(async () => (await thread.innerText()).includes("zztmp Thank you, received"), () => false));

  // ------------------------------------------------------------------ email
  console.log("\n--- email ---");
  if (LOCAL) {
    console.log("skipped against a local server: alerts are emailed only from a deployment");
  } else {
    // Quiet for two minutes, then sent by the next page view (or the cron).
    // Read, by whom, and what each of them should come to:
    //   the Super Admin's partner message, the partner's message from HMARK,
    //   the student's document sent back, the staff's email-only alerts — unread: sent;
    //   the counsellor's lead assignment — read in the portal first: never emailed.
    let states = null;
    const emailed = await poll(async () => {
      await couPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
      const { data } = await admin
        .from("notifications")
        .select("user_id, kind, email_state, email_error")
        .in("user_id", [cou.id, proc.id, sup.id, partnerUserId, studentUserId]);
      const whose = { [cou.id]: "cou", [proc.id]: "proc", [sup.id]: "sup", [partnerUserId]: "partner", [studentUserId]: "student" };
      states = Object.fromEntries(
        (data ?? []).map((r) => [`${r.kind}@${whose[r.user_id]}`, r.email_error ? `${r.email_state}: ${r.email_error}` : r.email_state])
      );
      const sent = ["partner_message@sup", "message@partner", "document_rejected@student", "student_message@cou", "student_message@proc"];
      return sent.every((k) => states[k] === "sent") ? states : null;
    }, 420, 20000);
    ok("each unread alert is emailed once it has been quiet two minutes", Boolean(emailed), JSON.stringify(states));
    ok("...the ones only emailed too, though Mark all read was pressed", states?.["student_message@cou"] === "sent", JSON.stringify(states));
    ok("...and one read in the portal first is not emailed", states?.["lead_assigned@cou"] === "skipped" && states?.["message@student"] === "skipped", JSON.stringify(states));
  }
} finally {
  await browser?.close().catch(() => {});
  if (universityId) {
    // The partner's message alerted every Super Admin and Management member,
    // the real ones too: gone before the mailer reaches them.
    await admin.from("notifications").delete().like("link", `%${universityId}%`);
    await admin.from("messages").delete().eq("entity_type", "university").eq("entity_id", universityId);
    if (partnerUserId) await admin.from("partner_university_accounts").delete().eq("id", partnerUserId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  for (const id of studentIds) await admin.from("messages").delete().eq("entity_type", "student").eq("entity_id", id);
  for (const id of staffIds) await admin.from("messages").delete().eq("sent_by", id);
  for (const id of [studentUserId, partnerUserId]) if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
