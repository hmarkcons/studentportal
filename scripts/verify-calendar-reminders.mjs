// What calendars show without anyone adding it, the reminders before it, and
// guests' invitations — end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:calreminders
//
//   * a student's interview is on their counsellor's and processing officer's
//     calendars, an unpaid instalment on the counsellor's and finance's, and
//     each is where it belongs and nowhere else; a follow-up is on the
//     counsellor's;
//   * the university has a calendar of its own with its applicant's interview
//     and the application's deadline, and Calendar in its menu;
//   * an interview starting within the hour pops up for the counsellor, the
//     student and the university — the hour-before reminder — and an
//     interview marked held leaves the calendar;
//   * a guest added to an event is sent an invitation (calendar_invites: the
//     first version, sequence 0); moving it sends them an update (sequence 1);
//     a guest taken off is sent a cancellation and a new one an invitation;
//     deleting the event cancels it for the rest;
//   * the reminder emails: tomorrow's list names the right people for each
//     item, and the hour-before list the interview starting soon. This part
//     asks the cron route for a dry run, which needs CRON_SECRET: set
//     CRON_SECRET for the run (and on the server) or it is skipped and said so.
//
// Guests and fixtures use reserved test addresses, which are never emailed.
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:calreminders");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Cal Student ${RUN}`;
const UNI = `zztmp Cal University ${RUN}`;
const PROGRAM = `zztmp MSc Calendars ${RUN}`;
const STUDENT_EMAIL = `zztmp-calstudent-${RUN}@hmark-test.local`;
const PARTNER_EMAIL = `zztmp-calpartner-${RUN}@hmark-test.local`;
const GUEST_A = `zztmp-guest-a-${RUN}@hmark-test.local`;
const GUEST_B = `zztmp-guest-b-${RUN}@hmark-test.local`;
const EVENT = `zztmp Invite ${RUN}`;

/** Polls until `fn` returns something truthy, or gives up after `seconds`. */
async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const hydrated = (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
};

/** Karachi's date and "HH:MM" for an instant. */
function karachi(ms) {
  const d = new Date(ms + 5 * 3_600_000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whether a calendar page shows an item of a kind whose title contains `text`. */
async function shows(page, path, kind, text) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const item = page.locator(`[data-kind="${kind}"]`, { hasText: text }).first();
  return item.waitFor({ timeout: 30000 }).then(() => true, () => false);
}

async function signInPortal(browser, email, landing) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="password"]', FIXTURE_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await page.goto(`${BASE}${landing}`, { waitUntil: "domcontentloaded" });
  return page;
}

/** The pop-up a page shows for an item, once the notifier has read its list. */
async function popup(page, text) {
  const card = page.locator("[data-calendar-notification]", { hasText: text }).first();
  return card.waitFor({ timeout: 45000 }).then(() => true, () => false);
}

async function invites(taskId) {
  const { data } = await admin.from("calendar_invites").select("email, sequence, status, cancelled, signature").eq("source_table", "personal_tasks").eq("source_id", taskId);
  return new Map((data ?? []).map((r) => [r.email, r]));
}

/** Opens an item from the day view and its full editor. */
async function openEditor(page, date, title) {
  await page.goto(`${BASE}/calendar?view=day&date=${date}`, { waitUntil: "domcontentloaded" });
  const block = page.locator(`[data-event-title="${title}"]`).first();
  await block.waitFor({ timeout: 30000 });
  await hydrated(page, "[data-time-body]");
  await block.click();
  await page.locator("[data-calendar-popover]").getByRole("button", { name: "Edit event" }).click();
  const editor = page.locator("[data-event-editor]");
  await editor.waitFor({ timeout: 15000 });
  return editor;
}

let browser = null;
let studentUserId = null;
let partnerUserId = null;
let universityId = null;
let studentId = null;
const taskIds = [];

try {
  const cou = await fx.staff(`calcoun${RUN}`, ["counselor"]);
  const proc = await fx.staff(`calproc${RUN}`, ["processing"]);
  const fin = await fx.staff(`calfin${RUN}`, ["finance"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();

  // A university with a partner account, and a programme.
  const { data: uni, error: uniError } = await admin.from("universities").insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public" }).select("id").single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  universityId = uni.id;
  const { data: program } = await admin.from("programs").insert({ university_id: uni.id, name: PROGRAM, level: "masters" }).select("id").single();
  const { data: madePartner, error: partnerAuthError } = await admin.auth.admin.createUser({ email: PARTNER_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (partnerAuthError) throw new Error(`partner login: ${partnerAuthError.message}`);
  partnerUserId = madePartner.user.id;
  await admin.from("partner_university_accounts").insert({ id: partnerUserId, university_id: uni.id, staff_name: "zztmp Cal Partner", status: "active" });

  // A registered student with a portal, their counsellor and processing officer.
  studentId = await fx.lead({
    full_name: STUDENT, email: STUDENT_EMAIL, contact_number: "0300-9999971",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), assigned_counselor_id: cou.id, processing_officer_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  const coded = await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  ok("the fixture student has a Student ID, so their portal opens", Boolean(coded));
  const { data: madeStudent, error: studentAuthError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (studentAuthError) throw new Error(`student login: ${studentAuthError.message}`);
  studentUserId = madeStudent.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  // Dates, in Karachi.
  const now = Date.now();
  const today = karachi(now).date;
  const tomorrow = addDays(today, 1);
  const soonAt = new Date(Math.ceil((now + 30 * 60_000) / 60_000) * 60_000);
  const soon = karachi(soonAt.getTime());

  const { data: app, error: appError } = await admin
    .from("applications")
    .insert({ student_id: studentId, university_id: uni.id, program_id: program.id, deadline: tomorrow })
    .select("id")
    .single();
  if (appError) throw new Error(`application: ${appError.message}`);
  // One interview within the hour, one tomorrow at three.
  const { data: soonInterview, error: ivError } = await admin
    .from("application_interviews")
    .insert({ application_id: app.id, round_label: "First round", status: "scheduled", platform: "zoom", confirmed_datetime: soonAt.toISOString() })
    .select("id")
    .single();
  ok("an interview can be added (0323)", !ivError, ivError?.message);
  const { data: laterInterview } = await admin
    .from("application_interviews")
    .insert({ application_id: app.id, round_label: "Second round", status: "scheduled", platform: "google_meet", confirmed_datetime: `${tomorrow}T10:00:00Z` })
    .select("id")
    .single();
  const { data: invoice } = await admin.from("invoices").insert({ student_id: studentId, consultancy_fee: 5000, admin_charge: 0, currency: "PKR" }).select("id").single();
  await admin.from("invoice_installments").insert({ invoice_id: invoice.id, installment_no: 1, amount: 5000, due_date: tomorrow, status: "unpaid" });
  await admin.from("reminders").insert({ student_id: studentId, type: "follow_up", due_date: tomorrow, due_time: "11:00", note: "zztmp call back", created_by: cou.id });

  browser = await openBrowser();

  // ------------------------------------------------------- staff calendars
  console.log("\n--- the staff calendars ---");
  const couPage = await signIn(browser, cou.email);
  ok("the counsellor is reminded within the hour of their student's interview", await popup(couPage, STUDENT));
  await shot(couPage, "popup-counsellor");
  const week = `/calendar?view=week&date=${tomorrow}`;
  ok("the interview is on the counsellor's calendar", await shows(couPage, week, "interview", STUDENT));
  ok("so is the instalment due", await shows(couPage, week, "payment", STUDENT));
  ok("and the follow-up", await shows(couPage, week, "reminder", STUDENT));
  await shot(couPage, "calendar-counsellor");

  const procPage = await signIn(browser, proc.email);
  ok("the interview is on the processing officer's calendar", await shows(procPage, week, "interview", STUDENT));
  ok("the instalment is not theirs", (await procPage.locator('[data-kind="payment"]', { hasText: STUDENT }).count()) === 0);

  const finPage = await signIn(browser, fin.email);
  ok("the instalment is on finance's calendar", await shows(finPage, week, "payment", STUDENT));
  ok("the interview is not theirs", (await finPage.locator('[data-kind="interview"]', { hasText: STUDENT }).count()) === 0);

  // ------------------------------------------------------------ the partner
  console.log("\n--- the university ---");
  const partnerPage = await signInPortal(browser, PARTNER_EMAIL, "/partner");
  ok("Calendar is in the university's menu", (await partnerPage.locator('a[href="/partner/calendar"]').count()) > 0);
  ok("the university is reminded within the hour of the interview", await popup(partnerPage, STUDENT));
  ok("its calendar has its applicant's interview", await shows(partnerPage, `/partner/calendar?view=week&date=${tomorrow}`, "interview", STUDENT));
  ok("and the application's deadline", await shows(partnerPage, `/partner/calendar?view=week&date=${tomorrow}`, "deadline", STUDENT));
  await shot(partnerPage, "calendar-partner");

  // ------------------------------------------------------------ the student
  console.log("\n--- the student ---");
  const studentPage = await signInPortal(browser, STUDENT_EMAIL, "/portal");
  ok("the student is reminded within the hour of their interview", await popup(studentPage, UNI));
  const cards = studentPage.locator("[data-calendar-notification]", { hasText: UNI });
  const cardText = await cards.first().innerText().catch(() => "");
  ok("...once, saying how many minutes away it is", (await cards.count()) === 1 && /In \d+ minutes/.test(cardText), `${await cards.count()} cards: ${cardText}`);
  await shot(studentPage, "popup-student");

  // Held: it leaves the calendar.
  const soonItem = `[data-event-id^="interview:${soonInterview.id}"]`;
  const dayOfSoon = `/calendar?view=day&date=${soon.date}`;
  await couPage.goto(`${BASE}${dayOfSoon}`, { waitUntil: "domcontentloaded" });
  const before = await couPage.locator(soonItem).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  await admin.from("application_interviews").update({ status: "completed" }).eq("id", soonInterview.id);
  await couPage.goto(`${BASE}${dayOfSoon}`, { waitUntil: "domcontentloaded" });
  await couPage.locator("[data-time-body]").waitFor({ timeout: 30000 });
  await hydrated(couPage, "[data-time-body]");
  ok("an interview marked held leaves the calendar", before && (await couPage.locator(soonItem).count()) === 0);

  // ------------------------------------------------------------ the guests
  console.log("\n--- a guest's invitation ---");
  await couPage.goto(`${BASE}/calendar?view=day&date=${tomorrow}`, { waitUntil: "domcontentloaded" });
  await hydrated(couPage, "[data-time-body]");
  await couPage.getByRole("button", { name: "Create", exact: true }).first().click();
  let editor = couPage.locator("[data-event-editor]");
  await editor.waitFor({ timeout: 15000 });
  await editor.locator('input[aria-label="Title"]').fill(EVENT);
  await editor.locator('input[aria-label="Start date"]').fill(tomorrow);
  await editor.locator('select[aria-label="Start time"]').selectOption("16:00");
  await editor.locator('select[aria-label="End time"]').selectOption("17:00");
  await editor.locator('input[aria-label="Add guests"]').fill(GUEST_A);
  await editor.locator('input[aria-label="Add guests"]').press("Enter");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const task = await poll(async () => (await admin.from("personal_tasks").select("id, guest_emails").eq("owner_id", cou.id).eq("title", EVENT).maybeSingle()).data);
  if (task) taskIds.push(task.id);
  ok("an event is saved with its guest", task?.guest_emails?.includes(GUEST_A), JSON.stringify(task));
  const first = await poll(async () => (await invites(task.id)).get(GUEST_A));
  ok("the guest is sent an invitation: the first version of the event", first?.sequence === 0 && !first.cancelled && first.status === "skipped", JSON.stringify(first));

  editor = await openEditor(couPage, tomorrow, EVENT);
  await editor.locator('select[aria-label="End time"]').selectOption("18:00");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const updated = await poll(async () => {
    const r = (await invites(task.id)).get(GUEST_A);
    return r?.sequence === 1 ? r : null;
  });
  ok("a change to its time is sent to them as an update of the same event", Boolean(updated) && updated.signature !== first.signature, JSON.stringify(updated));

  editor = await openEditor(couPage, tomorrow, EVENT);
  await editor.locator(`button[aria-label="Remove ${GUEST_A}"]`).click();
  await editor.locator('input[aria-label="Add guests"]').fill(GUEST_B);
  await editor.locator('input[aria-label="Add guests"]').press("Enter");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const swapped = await poll(async () => {
    const m = await invites(task.id);
    return m.get(GUEST_A)?.cancelled && m.get(GUEST_B) ? m : null;
  });
  ok("a guest taken off is sent a cancellation", swapped?.get(GUEST_A)?.cancelled === true && swapped.get(GUEST_A).sequence === 2, JSON.stringify(swapped && [...swapped.values()]));
  ok("and a guest added is sent an invitation", swapped?.get(GUEST_B)?.sequence === 0 && !swapped.get(GUEST_B).cancelled);

  // ------------------------------------------------- the reminder emails
  console.log("\n--- the reminder emails ---");
  const secret = process.env.CRON_SECRET?.trim();
  const dry = async (mode) => {
    const res = await fetch(`${BASE}/api/cron/calendar-upcoming?mode=${mode}&dry=1`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const tomorrowRun = await dry("tomorrow");
  if (tomorrowRun.status === 401) {
    console.log("SKIP  the reminder emails: the dry run needs CRON_SECRET, here and on the server");
  } else {
    const to = (email) => (tomorrowRun.body?.recipients ?? []).find((r) => r.to === email.toLowerCase());
    const couMail = to(cou.email);
    ok("tomorrow's list: the counsellor, of the interview, the instalment and the follow-up", couMail && ["Interview", "Instalment", "Follow-up"].every((w) => couMail.items.some((i) => i.startsWith(w))), JSON.stringify(couMail));
    ok("...the processing officer, of the interview only", to(proc.email)?.items.every((i) => i.startsWith("Interview")) && to(proc.email).items.length >= 1, JSON.stringify(to(proc.email)));
    ok("...finance, of the instalment", to(fin.email)?.items.some((i) => i.startsWith("Instalment") && i.includes(STUDENT)), JSON.stringify(to(fin.email)));
    ok("...the student, of their interview and instalment, worded for them", to(STUDENT_EMAIL)?.items.some((i) => i === `Interview with ${UNI}`) && to(STUDENT_EMAIL).items.some((i) => i.startsWith("Instalment 1 due")), JSON.stringify(to(STUDENT_EMAIL)));
    ok("...the university, of the interview and the deadline", to(PARTNER_EMAIL)?.items.some((i) => i.startsWith("Interview")) && to(PARTNER_EMAIL).items.some((i) => i.includes("deadline")), JSON.stringify(to(PARTNER_EMAIL)));
    ok("...and the event's guest", to(GUEST_B)?.items.includes(EVENT), JSON.stringify(to(GUEST_B)));
    // Soon: a new interview within the hour (the first was marked held).
    await admin.from("application_interviews").update({ status: "scheduled", confirmed_datetime: soonAt.toISOString() }).eq("id", soonInterview.id);
    const soonRun = await dry("soon");
    const soonTo = (email) => (soonRun.body?.recipients ?? []).find((r) => r.to === email.toLowerCase());
    ok("the hour-before list: the interview, to the counsellor, the student and the university", [cou.email, STUDENT_EMAIL, PARTNER_EMAIL].every((e) => soonTo(e)?.items.some((i) => i.includes("Interview"))), JSON.stringify(soonRun.body?.recipients?.filter((r) => r.to.includes(RUN))));
    ok("...and not the instalment, which has no hour", !soonTo(fin.email));
  }
  void laterInterview;

  // Deleted: cancelled for the guest who remains.
  await couPage.goto(`${BASE}/calendar?view=day&date=${tomorrow}`, { waitUntil: "domcontentloaded" });
  couPage.on("dialog", (d) => void d.accept());
  const block = couPage.locator(`[data-event-title="${EVENT}"]`).first();
  await block.waitFor({ timeout: 30000 });
  await hydrated(couPage, "[data-time-body]");
  await block.click();
  await couPage.locator("[data-calendar-popover]").getByRole("button", { name: "Delete" }).click();
  const gone = await poll(async () => (await admin.from("personal_tasks").select("id").eq("id", task.id).maybeSingle()).data === null);
  const cancelled = await poll(async () => (await invites(task.id)).get(GUEST_B)?.cancelled === true);
  ok("deleting the event cancels it for its guest", gone && cancelled);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  for (const id of taskIds) {
    await admin.from("personal_tasks").delete().eq("id", id);
    await admin.from("calendar_invites").delete().eq("source_id", id);
  }
  await admin.from("calendar_reminder_log").delete().like("recipient", `%${RUN}%`);
  if (studentId) await admin.from("notifications").delete().eq("student_id", studentId);
  if (partnerUserId) await admin.from("partner_university_accounts").delete().eq("id", partnerUserId);
  // The student (and with them the application, interviews, invoice and follow-up) go with the fixtures.
  const removed = await fx.cleanup();
  if (universityId) {
    await admin.from("programs").delete().eq("university_id", universityId);
    await admin.from("universities").delete().eq("id", universityId);
  }
  for (const id of [studentUserId, partnerUserId]) if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
