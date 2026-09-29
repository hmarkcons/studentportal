// The calendar, as Google Calendar does it, against the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:calendar
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Needs migration 0295 (end time, place, notification, yearly and weekday
// repeats). Works in a week of January 2099, clear of anyone's real work.
//
// As a Super Admin, in the week view:
//
//   quick add     a click on Wednesday at 10am opens the small card for that
//                 slot; Save creates the item on that day, 10 to 11, and it is
//                 drawn in Wednesday's column at the height of 10am.
//   full editor   Edit on its card opens the editor; an end time, a place, a
//                 notification and a weekly repeat all reach the database.
//   drag          dragging it to Thursday at 2pm moves it there — the whole
//                 series, after the confirmation a repeating item asks for —
//                 keeping its two hours.
//   resize        dragging its bottom edge down an hour makes it end an hour
//                 later.
//   My calendars  unticking Personal hides it; ticking it brings it back.
//   records       a document's deadline is on the calendar but cannot be
//                 dragged: a drag leaves it, and the database, where they
//                 were, and its card links to the student's documents with no
//                 Edit or Delete.
//
// Then as the student (the deadline's student, with an instalment due and an
// interview booked), on their own Calendar page: the instalment and the
// interview are there — the interview at 2pm Pakistan time in the week view —
// and nothing can be created, dragged, edited or ticked off. The menu has
// Calendar right after Appointments.
//
// Every fixture is zztmp and removed in a finally.
import { apiAs, BASE, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:calendar");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

// Sunday 11 January 2099 to Saturday 17 January.
const TUE = "2099-01-13";
const MON = "2099-01-12";
const WED = "2099-01-14";
const THU = "2099-01-15";
/** Pixels per hour on the grid (TimeGrid's HOUR). */
const HOUR = 48;
const TITLE = `zztmp cal ${Date.now()}`;
const DOC = "zztmp Calendar Doc";
const PORTAL_EMAIL = "zztmp-calendar-student@hmark-test.local";

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * Waits until React has taken over the element. The grid is in the server's
 * HTML, and before hydration a press does nothing — and the grid's own scroll
 * to the morning, which runs as it hydrates, would move what was measured.
 */
async function hydrated(page, selector) {
  await page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, selector, { timeout: 60000 })
    .catch(() => {});
}

/** Scrolls the hour grid so the morning is at its top: every point this check presses is then on screen. */
async function scrollGridTo(page, hour) {
  await page.evaluate(
    ([h, px]) => {
      const body = document.querySelector("[data-time-body]");
      if (body) body.scrollTop = h * px;
    },
    [hour, HOUR]
  );
}

async function personalRow(id) {
  const { data } = await admin
    .from("personal_tasks")
    .select("id, due_date, due_time, end_time, location, notify_minutes, recurrence")
    .eq("id", id)
    .maybeSingle();
  return data;
}

let browser = null;
let studentId = null;
let portalUserId = null;
let universityId = null;

try {
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) if (u.email === PORTAL_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});

  // --------------------------------------------------------------- fixtures
  const staff = await fx.staff("calsuper", ["super_admin"]);
  const fin = await fx.staff("calfin", ["finance"]);
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();

  // The student: their processing officer is the Super Admin, so the
  // document deadline below belongs on that person's calendar.
  studentId = await fx.lead({
    full_name: "zztmp Calendar Student",
    email: "zztmp-calendar@example.invalid",
    contact_number: "0300-9999994",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    country_of_interest: "Italy (Public)",
    intake: "Fall 2099",
    date_of_birth: "2002-04-17",
    level_applying_for: "masters",
    processing_officer_id: staff.id,
  });
  const { error: destError } = await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  if (destError) throw new Error(`destination: ${destError.message}`);

  const { error: docError } = await admin
    .from("student_documents")
    .insert({ student_id: studentId, category: "personal", custom_name: DOC, status: "missing", deadline: MON });
  if (docError) throw new Error(`document: ${docError.message}`);

  // An application with an interview booked for Wednesday 09:00 UTC — 2pm in Karachi.
  const { data: uni, error: uniError } = await admin
    .from("universities")
    .insert({ destination_id: italy.id, name: "zztmp Calendar University", city: "zztmp City", type: "public" })
    .select("id")
    .single();
  if (uniError) throw new Error(`university: ${uniError.message}`);
  universityId = uni.id;
  const { data: prog } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: "zztmp Calendar Programme" }).select("id").single();
  const { data: app, error: appError } = await admin
    .from("applications")
    .insert({ student_id: studentId, university_id: uni.id, program_id: prog.id, current_stage: "under_review", intake: "Fall 2099" })
    .select("id")
    .single();
  if (appError) throw new Error(`application: ${appError.message}`);
  const { error: interviewError } = await admin
    .from("application_interviews")
    .insert({ application_id: app.id, round_label: "zztmp Round 1", confirmed_datetime: `${WED}T09:00:00Z`, status: "scheduled" });
  if (interviewError) throw new Error(`interview: ${interviewError.message}`);

  // An instalment due on the Monday: a signed agreement, then Finance's invoice.
  const signedPath = `${studentId}/agreements/zztmp-signed.pdf`;
  await admin.storage.from("documents").upload(signedPath, Buffer.from("%PDF-1.4\n% zztmp signed agreement\n"), { contentType: "application/pdf", upsert: true });
  const { data: agreement, error: agreementError } = await admin
    .from("agreements")
    .insert({ student_id: studentId, template_id: template.id, signing_method: "paper", status: "signed", signed_file_path: signedPath, signed_file_uploaded_at: new Date().toISOString() })
    .select("id")
    .single();
  if (agreementError) throw new Error(`agreement: ${agreementError.message}`);
  const asFin = await apiAs(url, anonKey, fin.email);
  const { error: rpcError } = await asFin.rpc("generate_invoice", {
    p_student_id: studentId,
    p_agreement_id: agreement.id,
    p_admin_charge: 0,
    p_consultancy_fee: 700,
    p_currency: "EUR",
    p_intake: "Fall 2099",
    p_terms: null,
    p_invoice_number: `ZZTMP-CAL-${Date.now()}`,
    p_installment_plan: null,
    p_installments: [{ installment_no: 1, amount: 700, due_date: MON }],
    p_tax_rate: 0,
    p_tax_amount: 0,
    p_tax_base: "total",
  });
  if (rpcError) throw new Error(`invoice: ${rpcError.message}`);

  const coded = await poll(async () => {
    const { data } = await admin.from("leads").select("student_code").eq("id", studentId).single();
    return data?.student_code ?? null;
  }, 20);
  if (!coded) throw new Error("the fixture student never got a Student ID, so cannot reach the portal");
  const { data: made, error: madeError } = await admin.auth.admin.createUser({ email: PORTAL_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (madeError) throw new Error(`student login: ${madeError.message}`);
  portalUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId, portal_active: true }).eq("id", studentId);

  // ------------------------------------------------------------- quick add
  browser = await openBrowser();
  const page = await signIn(browser, staff.email);
  const browserErrors = [];
  page.on("pageerror", (e) => browserErrors.push(String(e?.message ?? e)));
  // A repeating item asks before a drag moves the whole series.
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/calendar?view=week&date=${TUE}`, { waitUntil: "domcontentloaded" });
  const wed = page.locator(`[data-time-date="${WED}"]`);
  const opened = await wed.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("the week view is an hour grid with a column per day", opened, (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
  if (!opened) throw new Error("no week grid to work in");
  ok("...seven of them", (await page.locator("[data-time-date]").count()) === 7);
  await hydrated(page, "[data-time-body]");
  await scrollGridTo(page, 8);

  const wedBox = await wed.boundingBox();
  await page.mouse.click(wedBox.x + wedBox.width / 2, wedBox.y + 10 * HOUR + 8);
  const quick = page.locator("[data-quick-add]");
  const quickShown = await quick.waitFor({ timeout: 15000 }).then(() => true, () => false);
  ok("clicking an empty slot opens the quick-add card", quickShown);
  if (quickShown) {
    const when = await page.locator("[data-quick-when]").innerText();
    ok("...for the slot clicked: Wednesday, 10 to 11", /Wednesday, January 14/.test(when) && when.includes("10:00am – 11:00am"), when);
    ok("...with the slot drawn on the grid as (No title)", (await page.locator(`[data-time-date="${WED}"] [data-draft]`).count()) === 1);
    await quick.locator('input[aria-label="Title"]').fill(TITLE);
    await quick.getByRole("button", { name: "Save", exact: true }).click();
  }
  const created = await poll(async () => {
    const { data } = await admin.from("personal_tasks").select("id, due_date, due_time, end_time").eq("owner_id", staff.id).eq("title", TITLE).maybeSingle();
    return data;
  });
  ok("Save creates the item", Boolean(created));
  if (!created) throw new Error("nothing was created to go on with");
  ok("...on Wednesday from 10:00 to 11:00", created.due_date === WED && created.due_time?.startsWith("10:00") && created.end_time?.startsWith("11:00"), JSON.stringify(created));

  const block = page.locator(`[data-time-date="${WED}"] [data-event-title="${TITLE}"]`);
  const drawn = await block.waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("the new item is drawn in Wednesday's column", drawn, browserErrors.slice(0, 3).join(" | "));
  if (drawn) {
    ok("...from 10:00 to 11:00", (await block.getAttribute("data-start")) === "10:00" && (await block.getAttribute("data-end")) === "11:00");
    const [b, c] = [await block.boundingBox(), await wed.boundingBox()];
    ok("...at the height of 10am", Math.abs(b.y - c.y - 10 * HOUR) <= 3, `${b.y - c.y}px down, expected ${10 * HOUR}`);
    ok("...an hour tall", Math.abs(b.height - HOUR) <= 4, `${b.height}px`);
  }

  // ----------------------------------------------------------- full editor
  await block.click();
  const popover = page.locator("[data-calendar-popover]");
  await popover.getByRole("button", { name: "Edit event" }).click();
  const editor = page.locator("[data-event-editor]");
  const editorShown = await editor.waitFor({ timeout: 15000 }).then(() => true, () => false);
  ok("Edit on the card opens the full editor", editorShown);
  if (editorShown) {
    await editor.locator('select[aria-label="End time"]').selectOption("12:00");
    await editor.locator('input[aria-label="Location"]').fill("zztmp Room 4");
    await editor.locator('select[aria-label="Notification"]').selectOption("30");
    await editor.locator('select[aria-label="Repeat"]').selectOption("weekly");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
  }
  const edited = await poll(async () => {
    const row = await personalRow(created.id);
    return row?.location === "zztmp Room 4" ? row : null;
  });
  ok(
    "the editor saves the end time, the place, the notification and the repeat",
    edited?.end_time?.startsWith("12:00") && edited.notify_minutes === 30 && edited.recurrence === "weekly",
    JSON.stringify(edited ?? (await page.locator("[data-event-editor] [role=alert]").innerText().catch(() => "no answer")))
  );
  ok("...and closes", await editor.waitFor({ state: "detached", timeout: 30000 }).then(() => true, () => false));

  // ------------------------------------------------------------------ drag
  const twoHours = page.locator(`[data-time-date="${WED}"] [data-event-title="${TITLE}"][data-end="12:00"]`);
  await twoHours.waitFor({ timeout: 30000 }).catch(() => {});
  await scrollGridTo(page, 8);
  const from = await twoHours.boundingBox();
  const thuBox = await page.locator(`[data-time-date="${THU}"]`).boundingBox();
  if (from && thuBox) {
    // Picked up just inside its top edge, so where the pointer lands is where it starts.
    await page.mouse.move(from.x + from.width / 2, from.y + 6);
    await page.mouse.down();
    await page.mouse.move(thuBox.x + thuBox.width / 2, thuBox.y + 14 * HOUR + 7, { steps: 12 });
    await page.mouse.up();
  }
  const moved = await poll(async () => {
    const row = await personalRow(created.id);
    return row?.due_date === THU ? row : null;
  });
  ok("dragging it to Thursday at 2pm saves the move", moved?.due_time?.startsWith("14:00"), JSON.stringify(moved ?? (await personalRow(created.id))));
  ok("...keeping its two hours", moved?.end_time?.startsWith("16:00"), JSON.stringify(moved));
  const onThursday = page.locator(`[data-time-date="${THU}"] [data-event-title="${TITLE}"]`);
  ok("...and it is drawn on Thursday", await onThursday.waitFor({ timeout: 30000 }).then(() => true, () => false));

  // ---------------------------------------------------------------- resize
  await page.locator(`[data-time-date="${THU}"] [data-event-title="${TITLE}"][data-end="16:00"]`).waitFor({ timeout: 30000 }).catch(() => {});
  await scrollGridTo(page, 8);
  const handle = await onThursday.locator("[data-resize-handle]").boundingBox();
  if (handle) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + HOUR, { steps: 8 });
    await page.mouse.up();
  }
  const resized = await poll(async () => {
    const row = await personalRow(created.id);
    return row?.end_time?.startsWith("17:00") ? row : null;
  });
  ok("dragging its bottom edge down an hour makes it end at 5pm", Boolean(resized), JSON.stringify(await personalRow(created.id)));
  ok("...and leaves the start alone", resized?.due_time?.startsWith("14:00") && resized.due_date === THU, JSON.stringify(resized));

  // ---------------------------------------------------------- My calendars
  const personalToggle = page.locator('[data-kind-toggle="personal"]');
  await personalToggle.uncheck();
  const hid = await poll(async () => (await page.locator(`[data-event-title="${TITLE}"]`).count()) === 0, 10);
  ok("unticking Personal in My calendars hides the item", Boolean(hid));
  await personalToggle.check();
  const back = await page.locator(`[data-event-title="${TITLE}"]`).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  ok("...and ticking it brings it back", back);

  // --------------------------------------------------------------- records
  const deadline = page.locator(`[data-allday-row] [data-event][data-kind="deadline"]`, { hasText: DOC });
  const deadlineShown = await deadline.waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("the document's deadline is on the calendar, in the all-day row", deadlineShown);
  if (deadlineShown) {
    ok("...marked as not draggable", (await deadline.getAttribute("data-draggable")) === "false");
    const before = await deadline.boundingBox();
    const tueCell = await page.locator(`[data-allday-date="${TUE}"]`).boundingBox();
    await page.mouse.move(before.x + 10, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(tueCell.x + tueCell.width / 2, tueCell.y + tueCell.height / 2, { steps: 8 });
    await page.mouse.up();
    // A negative: nothing is sent, so there is no outcome to poll for. The
    // pause is what a save would have needed to land.
    await page.waitForTimeout(3000);
    const { data: doc } = await admin.from("student_documents").select("deadline").eq("student_id", studentId).eq("custom_name", DOC).single();
    ok("...a drag leaves the deadline where it was", doc.deadline === MON, doc.deadline);
    const after = await deadline.boundingBox();
    ok("...and on Monday on screen", after && Math.abs(after.x - before.x) < 2, JSON.stringify({ before, after }));
    await page.keyboard.press("Escape");
    await deadline.click();
    const card = page.locator("[data-calendar-popover]");
    await card.waitFor({ timeout: 10000 }).catch(() => {});
    ok("...its card links to the student's documents", (await card.locator("[data-event-link]").getAttribute("href")) === `/students/${studentId}/documents`);
    ok("...with no Edit and no Delete", (await card.getByRole("button", { name: /^(Edit event|Delete)$/ }).count()) === 0);
    await page.keyboard.press("Escape");
  }
  await page.close();

  // --------------------------------------------------------------- student
  const context = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
  const sp = await context.newPage();
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await sp.fill('input[name="email"]', PORTAL_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });

  await sp.goto(`${BASE}/portal/calendar?view=month&date=${TUE}`, { waitUntil: "domcontentloaded" });
  const cal = sp.locator('[data-calendar][data-calendar-mode="read"]');
  const studentShown = await cal.waitFor({ timeout: 60000 }).then(() => true, () => false);
  await hydrated(sp, "[data-calendar]");
  ok("the student has a Calendar page, read-only", studentShown, (await sp.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
  if (studentShown) {
    const menu = await sp.evaluate(() => [...document.querySelectorAll("aside a[href]")].map((a) => a.getAttribute("href")));
    ok("...in the menu right after Appointments", menu.indexOf("/portal/calendar") === menu.indexOf("/portal/appointments") + 1, menu.join(" "));
    const instalment = sp.locator(`[data-month-grid] [data-event][data-kind="payment"]`, { hasText: "Instalment 1" });
    ok("...showing the instalment due", await instalment.waitFor({ timeout: 20000 }).then(() => true, () => false));
    const cellOfInstalment = await sp.locator(`[data-month-date="${MON}"]`).boundingBox();
    const instalmentBox = await instalment.boundingBox();
    ok("...on the Monday it is due", instalmentBox && cellOfInstalment && instalmentBox.x >= cellOfInstalment.x - 1 && instalmentBox.x < cellOfInstalment.x + cellOfInstalment.width);
    ok("...and the interview", (await sp.locator(`[data-month-grid] [data-event][data-kind="interview"]`, { hasText: "zztmp Round 1" }).count()) === 1);
    ok("...and the document to upload", (await sp.locator(`[data-month-grid] [data-event][data-kind="document"]`, { hasText: DOC }).count()) === 1);
    ok("no Create", (await sp.locator("[data-calendar-create]").count()) === 0);
    const draggable = await sp.locator('[data-event][data-draggable="true"]').count();
    ok("nothing can be dragged", draggable === 0, `${draggable} draggable`);
    const empty = await sp.locator(`[data-month-date="2099-01-22"]`).boundingBox();
    await sp.mouse.click(empty.x + empty.width / 2, empty.y + empty.height - 10);
    await sp.waitForTimeout(800);
    ok("clicking an empty day offers no quick add", (await sp.locator("[data-quick-add]").count()) === 0);
    await instalment.click();
    const card = sp.locator("[data-calendar-popover]");
    await card.waitFor({ timeout: 10000 }).catch(() => {});
    ok("the instalment's card links to Payments", (await card.locator("[data-event-link]").getAttribute("href").catch(() => null)) === "/portal/payments");
    ok("...with no Edit, no Delete and nothing to tick", (await card.getByRole("button", { name: /^(Edit event|Delete)$/ }).count()) === 0 && (await card.locator("[data-done-toggle]").count()) === 0);
    await sp.keyboard.press("Escape");

    // The week, where the interview has its time.
    await sp.locator("[data-view-switch]").getByRole("button", { name: "Week", exact: true }).click();
    const interview = sp.locator(`[data-time-date="${WED}"] [data-event][data-kind="interview"]`);
    ok("in the week view the interview is on Wednesday", await interview.waitFor({ timeout: 20000 }).then(() => true, () => false));
    ok("...at 2pm, Pakistan time", (await interview.getAttribute("data-start").catch(() => null)) === "14:00");
  }
  await context.close();
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("applications").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
    await admin.from("student_documents").delete().eq("student_id", studentId);
    await admin.storage.from("documents").remove([`${studentId}/agreements/zztmp-signed.pdf`]);
  }
  if (universityId) await admin.from("universities").delete().eq("id", universityId);
  // The staff go with their personal items (owner_id cascades).
  const removed = await fx.cleanup();
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
