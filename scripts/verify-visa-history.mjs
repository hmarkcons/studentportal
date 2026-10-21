// Each trip and each visa refusal on a student's profile asks for its own
// document, by name, end to end against a portal (0336):
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:visahistory
//
//   * a student adds two trips to one country and a refusal under Travel &
//     visa history, each with its visa type, and saves: each trip's visa —
//     "Previous visa — <country> (Student), 4–20 Aug 2026", and "… (Tourist),
//     28 Dec 2025 – 3 Jan 2026" — and the refusal's letter — "Student visa
//     refusal letter — <country>, 15 Aug 2025" — are asked for at once, named
//     with the visa type, before anybody opens Documents, in the visa section
//     of their Documents, each with the note saying what to send, and the one
//     row the travel history used to raise is not;
//   * their counsellor and processing officer are each alerted, with the
//     country, the date and the reason, and a link to the documents;
//   * a deportation asks for its own papers beside it, and the alerts group;
//   * a date corrected renames the letter and keeps it (same row, no alert);
//     a refusal or a trip taken off the profile takes its empty document with it;
//   * a refusal added by staff alerts the other one, never the one who added it;
//   * in a second intake, an approved letter is carried over and one still
//     missing is asked for again — the visa papers otherwise stay behind, and
//     the letter used to be lost with them.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:visahistory");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Refusal Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-refusal-${RUN}@hmark-test.local`;
const REFUSED_BY = `zztmp Narnia ${RUN}`;
const DEPORTED_FROM = `zztmp Atlantis ${RUN}`;
const STAFF_ADDED = `zztmp Lilliput ${RUN}`;
const REASON = `zztmp funds not shown ${RUN}`;
const TRAVELLED_TO = `zztmp Oz ${RUN}`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

async function press(page, locator) {
  await locator.waitFor({ timeout: 60000 });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await locator.elementHandle(), { timeout: 60000 });
  await locator.click();
}

const history = async () => (await admin.from("student_profiles").select("visa_refusal_history").eq("student_id", studentId).maybeSingle()).data?.visa_refusal_history ?? [];
const letters = async () =>
  (await admin.from("student_documents").select("id, derived_key, custom_name, category, status, cycle_id").eq("student_id", studentId).like("derived_key", "visa_refusal:%")).data ?? [];
const visas = async () =>
  (await admin.from("student_documents").select("id, derived_key, custom_name, category, status").eq("student_id", studentId).like("derived_key", "previous_visa:%")).data ?? [];
const trips = async () => (await admin.from("student_profiles").select("travel_history").eq("student_id", studentId).maybeSingle()).data?.travel_history ?? [];
const alertOf = async (staffId) =>
  (await admin.from("notifications").select("kind, title, title_many, body, link, count, read_at").eq("user_id", staffId).eq("group_key", `visa_refusal:${studentId}`).is("read_at", null).maybeSingle()).data;

/** Saves the Travel & visa history form and waits for it to say so. */
async function saveHistory(page) {
  const form = page.locator("form", { hasText: "Visa refusal / deportation history" });
  await press(page, form.getByRole("button", { name: /Save travel & visa history/ }));
  return poll(async () => {
    const text = await form.innerText();
    return /Saved\./.test(text) ? "saved" : /needs a country|didn't submit|Choose refusal/.test(text) ? text : null;
  }, 45);
}

let browser = null;
let studentUserId = null;
let studentId = null;
const uploaded = [];

try {
  const officer = await fx.staff(`refusalproc${RUN}`, ["processing"]);
  const counsellor = await fx.staff(`refusalcoun${RUN}`, ["counselor"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();

  // An intake, so the student has a Student ID and a portal.
  studentId = await fx.lead({
    full_name: STUDENT,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999993",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    processing_officer_id: officer.id,
    assigned_counselor_id: counsellor.id,
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: italy.display_name,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const { data: madeStudent, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = madeStudent.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  // ------------------------------------------------ the student adds a refusal
  browser = await openBrowser();
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });

  const form = sp.locator("form", { hasText: "Visa refusal / deportation history" });
  await form.waitFor({ timeout: 60000 });
  const note = form.locator("[data-refusal-letter-note]");
  ok(
    "the form says each refusal asks for its letter, and links to Documents",
    /asks for its letter in the visa section/.test(await note.innerText()) && (await note.locator("a").getAttribute("href")) === "/portal/documents",
    await note.innerText(),
  );

  const travelNote = form.locator("[data-previous-visa-note]");
  ok(
    "...and each trip its visa and stamps",
    /each trip asks for its visa and entry\/exit stamps/.test(await travelNote.innerText()) && (await travelNote.locator("a").getAttribute("href")) === "/portal/documents",
    await travelNote.innerText(),
  );

  for (const [from, to, visa] of [["2026-08-04", "2026-08-20", "student"], ["2025-12-28", "2026-01-03", "tourist"]]) {
    await press(sp, form.getByRole("button", { name: "+ Add trip" }));
    await form.locator('input[name="travel_country"]').last().fill(TRAVELLED_TO);
    await form.locator('select[name="travel_visa_type"]').last().selectOption(visa);
    await form.locator('input[name="travel_from"]').last().fill(from);
    await form.locator('input[name="travel_to"]').last().fill(to);
  }
  await press(sp, form.getByRole("button", { name: "+ Add record" }));
  await form.locator('input[name="visa_country"]').last().fill(REFUSED_BY);
  await form.locator('select[name="visa_type"]').last().selectOption("student");
  await form.locator('input[name="visa_date"]').last().fill("2025-08-15");
  await form.locator('input[name="visa_reason"]').last().fill(REASON);
  const saved = await saveHistory(sp);
  ok("the student saves two trips and a refusal", saved === "saved", String(saved));

  const entry = (await history()).find((r) => r.country === REFUSED_BY);
  ok("...it is on their profile, with an id of its own", Boolean(entry?.id) && entry.type === "refusal" && entry.date === "2025-08-15", JSON.stringify(entry));

  // Nobody has opened Documents: only the save can have raised it.
  const first = await poll(async () => (await letters()).find((d) => d.derived_key === `visa_refusal:${entry?.id}`), 20);
  ok(
    "its letter is asked for at once, named by visa type, country and date, in the visa section",
    first?.custom_name === `Student visa refusal letter — ${REFUSED_BY}, 15 Aug 2025` && first.category === "visa" && first.status === "missing",
    JSON.stringify(first),
  );
  const [tripA, tripB] = await trips();
  const tripVisas = await poll(async () => {
    const v = await visas();
    return v.length === 2 ? v : null;
  }, 20);
  const visaOf = (trip) => (tripVisas ?? []).find((d) => d.derived_key === `previous_visa:${trip?.id}`);
  ok(
    "...and each trip's visa, two trips to one country as two, named by their visa type and dates",
    visaOf(tripA)?.custom_name === `Previous visa — ${TRAVELLED_TO} (Student), 4–20 Aug 2026` &&
      visaOf(tripB)?.custom_name === `Previous visa — ${TRAVELLED_TO} (Tourist), 28 Dec 2025 – 3 Jan 2026` &&
      (tripVisas ?? []).every((d) => d.category === "visa" && d.status === "missing"),
    JSON.stringify(tripVisas ?? (await visas())),
  );
  const { count: generic } = await admin.from("student_documents").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("derived_key", "profile:travel_history");
  ok("...and not the one row the travel history used to raise", generic === 0, String(generic));

  // ------------------------------------------------------------ the alerts
  const forOfficer = await poll(() => alertOf(officer.id), 20);
  const forCounsellor = await poll(() => alertOf(counsellor.id), 20);
  const alertRight = (a) =>
    a?.kind === "visa_refusal" &&
    a.title === `${STUDENT} added a visa refusal by ${REFUSED_BY}` &&
    a.body === `Refused by ${REFUSED_BY} on 15 Aug 2025: ${REASON}. The refusal letter is now asked for in the visa section of their documents.` &&
    a.link === `/students/${studentId}/documents`;
  ok("the processing officer is alerted, with the country, date and reason", alertRight(forOfficer), JSON.stringify(forOfficer));
  ok("...and so is the counsellor", alertRight(forCounsellor), JSON.stringify(forCounsellor));

  // ------------------------------------------------- the student's Documents
  await sp.goto(`${BASE}/portal/documents?guide=${first?.id}`, { waitUntil: "domcontentloaded" });
  const visaSection = sp.locator("section[data-doc-section]", { has: sp.locator("h3", { hasText: /^Visa Application Requirements$/ }) });
  const row = visaSection.locator(`[data-document-row="${first?.id}"]`);
  await row.waitFor({ timeout: 60000 }).catch(() => {});
  const rowText = (await row.count()) ? await row.innerText() : "";
  ok("the student sees it under Visa Application Requirements", rowText.includes(`Student visa refusal letter — ${REFUSED_BY}, 15 Aug 2025`), rowText.slice(0, 300));
  const guideNote = (await row.locator("[data-guide-note]").count()) ? await row.locator("[data-guide-note]").innerText() : "";
  ok("...with the note saying what to send", /letter the embassy or consulate gave you/.test(guideNote), guideNote);
  const tripRow = visaSection.locator(`[data-document-row="${visaOf(tripB)?.id}"]`);
  const tripText = (await tripRow.count()) ? await tripRow.innerText() : "";
  ok(
    "...beside each trip's visa, with its own note",
    tripText.includes(`Previous visa — ${TRAVELLED_TO} (Tourist), 28 Dec 2025 – 3 Jan 2026`) &&
      /The visa for this trip/.test(tripText) &&
      (await visaSection.locator(`[data-document-row="${visaOf(tripA)?.id}"]`).count()) === 1,
    tripText.slice(0, 300),
  );

  // ------------------------------------------------------- a deportation too
  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60000 });
  await press(sp, form.getByRole("button", { name: "+ Add record" }));
  await form.locator('input[name="visa_country"]').last().fill(DEPORTED_FROM);
  await form.locator('select[name="visa_outcome"]').last().selectOption("deportation");
  // A visa type is required even for a deportation, though its papers are not
  // named by it — the kind is left to the profile, so this never shows "Work".
  await form.locator('select[name="visa_type"]').last().selectOption("work");
  const saved2 = await saveHistory(sp);
  const deportation = (await history()).find((r) => r.country === DEPORTED_FROM);
  const papers = await poll(async () => (await letters()).find((d) => d.derived_key === `visa_refusal:${deportation?.id}`), 20);
  ok(
    "a deportation asks for its own papers beside the letter",
    saved2 === "saved" && papers?.custom_name === `Deportation papers — ${DEPORTED_FROM}` && (await letters()).length === 2,
    JSON.stringify(await letters()),
  );
  const grouped = await poll(async () => {
    const a = await alertOf(officer.id);
    return a?.count === 2 ? a : null;
  }, 20);
  ok(
    "...and the alert groups: one unread alert, counting two",
    grouped?.title === `${STUDENT} added a deportation from ${DEPORTED_FROM}` && grouped.title_many === `${STUDENT} added {n} visa refusals or deportations`,
    JSON.stringify(grouped ?? (await alertOf(officer.id))),
  );

  // -------------------------------------------- corrected, then taken off
  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60000 });
  const refusalRow = form.locator("div.rounded-md", { has: sp.locator(`input[name="visa_country"][value="${REFUSED_BY}"]`) });
  await refusalRow.locator('input[name="visa_date"]').fill("2025-08-20");
  const saved3 = await saveHistory(sp);
  const renamed = await poll(async () => {
    const d = (await letters()).find((x) => x.id === first?.id);
    return d?.custom_name?.endsWith("20 Aug 2025") ? d : null;
  }, 20);
  ok("a date corrected renames the same letter", saved3 === "saved" && renamed?.custom_name === `Student visa refusal letter — ${REFUSED_BY}, 20 Aug 2025`, JSON.stringify(await letters()));
  ok("...and is not news to anyone", (await alertOf(officer.id))?.count === 2, JSON.stringify(await alertOf(officer.id)));

  await sp.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
  await form.waitFor({ timeout: 60000 });
  const deportRow = form.locator("div.rounded-md", { has: sp.locator(`input[name="visa_country"][value="${DEPORTED_FROM}"]`) });
  await press(sp, deportRow.getByRole("button", { name: "Remove" }));
  const tripRowB = form.locator("div.rounded-md", { has: sp.locator('input[name="travel_from"][value="2025-12-28"]') });
  await press(sp, tripRowB.getByRole("button", { name: "Remove" }));
  const saved4 = await saveHistory(sp);
  const afterRemove = await poll(async () => {
    const l = await letters();
    return l.length === 1 ? l : null;
  }, 20);
  ok(
    "a refusal taken off the profile takes its empty letter with it, and leaves the other",
    saved4 === "saved" && afterRemove?.[0]?.id === first?.id,
    JSON.stringify(await letters()),
  );
  const visasLeft = await poll(async () => {
    const v = await visas();
    return v.length === 1 ? v : null;
  }, 20);
  ok("...and a trip taken off takes its visa, leaving the other trip's", visasLeft?.[0]?.id === visaOf(tripA)?.id, JSON.stringify(await visas()));

  // ----------------------------------------------- added by staff, alerting
  const asOfficer = await apiAs(url, anonKey, officer.email);
  const staffEntry = { id: crypto.randomUUID(), country: STAFF_ADDED, type: "refusal", date: "2024-02-29", reason: null };
  const { error: staffWrite } = await asOfficer
    .from("student_profiles")
    .update({ visa_refusal_history: [...(await history()), staffEntry] })
    .eq("student_id", studentId)
    .select("student_id")
    .single();
  ok("(the officer adds a refusal for the student)", !staffWrite, JSON.stringify(staffWrite));
  const toCounsellor = await poll(async () => {
    const a = await alertOf(counsellor.id);
    return a?.count === 3 ? a : null;
  }, 20);
  ok(
    "a refusal staff add alerts the other one",
    toCounsellor?.title === `${STUDENT} added a visa refusal by ${STAFF_ADDED}` && toCounsellor.body.startsWith(`Refused by ${STAFF_ADDED} on 29 Feb 2024. `),
    JSON.stringify(await alertOf(counsellor.id)),
  );
  ok("...never the one who added it", (await alertOf(officer.id))?.count === 2, JSON.stringify(await alertOf(officer.id)));

  // ------------------------------------------------------ the second intake
  // The officer opens the documents (which raises the staff-added letter) and
  // approves the student's own letter, as they would with the letter in hand.
  const op = await signIn(browser, officer.email);
  await op.goto(`${BASE}/students/${studentId}/documents?doc=${first?.id}`, { waitUntil: "domcontentloaded" });
  await op.locator(`[data-document-row="${first?.id}"]`).waitFor({ timeout: 60000 }).catch(() => {});
  const staffLetter = await poll(async () => (await letters()).find((d) => d.derived_key === `visa_refusal:${staffEntry.id}`), 20);
  const staffRow = op.locator(`[data-document-row="${first?.id}"]`);
  ok("staff see the letter on the student's Documents", (await staffRow.count()) > 0 && (await staffRow.first().innerText()).includes(`Student visa refusal letter — ${REFUSED_BY}, 20 Aug 2025`));

  const path = `${studentId}/documents/${first?.id}/${RUN}/refusal-letter.pdf`;
  const { error: upError } = await asOfficer.storage
    .from("documents")
    .upload(path, Buffer.from("%PDF-1.4\n% zztmp refusal letter\n%%EOF\n"), { contentType: "application/pdf" });
  if (!upError) uploaded.push(path);
  const { error: addError } = await asOfficer.rpc("add_student_document_file", {
    p_document_id: first?.id,
    p_path: path,
    p_name: "refusal-letter.pdf",
    p_sources: null,
    p_role: "staff",
    p_status: "submitted",
  });
  const fileRow = await poll(async () => (await admin.from("student_document_files").select("id").eq("document_id", first?.id).maybeSingle()).data);
  const { error: reviewError } = await asOfficer.rpc("review_student_document_file", { p_file_id: fileRow?.id, p_status: "verified", p_reason: null });
  const approved = await poll(async () => ((await letters()).find((d) => d.id === first?.id)?.status === "verified" ? true : null), 20);
  ok("(the officer approves the student's letter)", !upError && !addError && !reviewError && approved, JSON.stringify({ upError, addError, reviewError }));

  // A second attempt, as Restart process makes one.
  const { data: c1 } = await admin.from("student_cycles").select("id").eq("student_id", studentId).eq("is_current", true).single();
  await admin.from("student_cycles").update({ is_current: false }).eq("id", c1.id);
  const { data: c2, error: cycleError } = await admin
    .from("student_cycles")
    .insert({ student_id: studentId, sequence: 2, intake: "Spring 2100", is_current: true, reason: "visa_refused", decision: "deferred" })
    .select("id")
    .single();
  if (cycleError) throw new Error(`second intake: ${cycleError.message}`);

  await sp.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  const raisedAgain = await poll(async () => (await letters()).find((d) => d.derived_key === `visa_refusal:${staffEntry.id}` && d.cycle_id === c2.id), 30);
  const all = await letters();
  ok(
    "in the second intake the letter still missing is asked for again",
    Boolean(raisedAgain) && raisedAgain.status === "missing" && raisedAgain.id !== staffLetter?.id,
    JSON.stringify(all),
  );
  ok(
    "...and the approved one is not",
    all.filter((d) => d.derived_key === `visa_refusal:${entry?.id}`).length === 1,
    JSON.stringify(all),
  );
  await sp.goto(`${BASE}/portal/documents?guide=${first?.id}`, { waitUntil: "domcontentloaded" });
  const carriedRow = visaSection.locator(`[data-document-row="${first?.id}"]`);
  await carriedRow.waitFor({ timeout: 60000 }).catch(() => {});
  const carriedText = (await carriedRow.count()) ? await carriedRow.innerText() : "";
  ok(
    "...it is carried over, approved, in the new intake's visa section",
    carriedText.includes(`Student visa refusal letter — ${REFUSED_BY}, 20 Aug 2025 — already approved, carried over`),
    carriedText.slice(0, 300),
  );
  ok(
    "...beside the one to upload, and without last intake's copy of it",
    (await visaSection.locator(`[data-document-row="${raisedAgain?.id}"]`).count()) === 1 && (await sp.locator(`[data-document-row="${staffLetter?.id}"]`).count()) === 0,
  );
  await sp.close();
  await op.close();
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // A fixture's own upload: nothing to restore, so storage's own remove.
  if (uploaded.length) await admin.storage.from("documents").remove(uploaded).catch(() => {});
  if (studentId) await admin.from("notifications").delete().eq("student_id", studentId);
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
