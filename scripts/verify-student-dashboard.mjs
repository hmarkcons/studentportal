// The registered student's dashboard, and full-width student pages.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:studentdashboard
//
// A student is set up part-way through: agreement signed, documents half
// approved with two still to upload (one due in ten days), an application
// under review with a deadline coming, an invoice with one instalment paid and
// one due, and a passport expiring soon. Then, signed in as them:
//
//   the journey       Registered, Agreement and Applied ticked; Documents the
//                     current step with what is left; 3 of 7, 43%.
//   the four figures  documents approved of the total the Documents page
//                     counts; paid of the invoice total; profile; the next
//                     appointment (none here, and it says so).
//   coming up         the unpaid instalment, the application deadline, the
//                     document due and the passport, soonest first.
//   applications      the donut names the stage the application is at.
//   full width        the dashboard and every other student page use the
//                     width of the screen, not a 672px column.
//
// Every fixture is zztmp and removed in a finally. SHOT_DIR=<folder> saves a
// screenshot of the dashboard there.
import { apiAs, BASE, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation } from "./verify-portal-lib.mjs";

requireConfirmation("check:studentdashboard");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const PORTAL_EMAIL = "zztmp-dashboard-student@hmark-test.local";
const DAY = 86_400_000;
const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const inDays = (n) => new Date(Date.parse(`${karachiToday()}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;
let studentId = null;
let portalUserId = null;
let universityId = null;

try {
  // Any leftover login from a run that died.
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) if (u.email === PORTAL_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});

  const fin = await fx.staff("dashfin", ["finance"]);
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();

  // ------------------------------------------------------------ the student
  studentId = await fx.lead({
    full_name: "zztmp Dashboard Student", email: "zztmp-dashboard@example.invalid", contact_number: "0300-9999995",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: karachiToday(), country_of_interest: "Italy (Public)", intake: "Fall 2099",
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", level_applying_for: "masters",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  // A passport inside the six months a visa needs: the profile ring warns, and
  // the date joins what is coming up.
  await admin.from("student_profiles").upsert(
    { student_id: studentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111",
      passport_number: "ZZ1234567", passport_expiry: inDays(60) },
    { onConflict: "student_id" }
  );
  await admin.from("agreements").insert({ student_id: studentId, template_id: template.id, signing_method: "paper", status: "signed", signed_file_path: `${studentId}/agreements/zztmp-signed.pdf` });

  // Documents: three approved, one being checked, two to upload — one of them due.
  const docs = [
    ["verified"], ["verified"], ["verified"], ["submitted"], ["missing", inDays(10)], ["rejected"],
  ].map(([status, deadline], i) => ({ student_id: studentId, category: "personal", custom_name: `zztmp Doc ${i + 1}`, status, deadline: deadline ?? null }));
  const { error: docError } = await admin.from("student_documents").insert(docs);
  if (docError) throw new Error(`documents: ${docError.message}`);

  // An application under review, in a round that closes in twenty days.
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp Dashboard University", city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: prog } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: "zztmp Data Science" }).select("id").single();
  const { data: round } = await admin.from("program_intake_rounds").insert({ program_id: prog.id, label: "zztmp Round 1", application_deadline: inDays(20), sort_order: 1 }).select("id").single();
  const { error: appError } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: prog.id, round_id: round.id, current_stage: "under_review", intake: "Fall 2099" });
  if (appError) throw new Error(`application: ${appError.message}`);

  // An invoice: 500 paid, 700 due in fifteen days.
  const { data: agreementRow } = await admin.from("agreements").select("id").eq("student_id", studentId).single();
  const asFin = await apiAs(url, anonKey, fin.email);
  const { data: invoiceId, error: rpcError } = await asFin.rpc("generate_invoice", {
    p_student_id: studentId, p_agreement_id: agreementRow.id, p_admin_charge: 200, p_consultancy_fee: 1000,
    p_currency: "EUR", p_intake: "Fall 2099", p_terms: null, p_invoice_number: `ZZTMP-DASH-${Date.now()}`, p_installment_plan: null,
    p_installments: [{ installment_no: 1, amount: 500, due_date: inDays(-5) }, { installment_no: 2, amount: 700, due_date: inDays(15) }],
    p_tax_rate: 0, p_tax_amount: 0, p_tax_base: "total",
  });
  if (rpcError) throw new Error(`invoice: ${rpcError.message}`);
  await admin.from("invoice_installments").update({ status: "paid", amount_paid: 500, paid_date: inDays(-5) }).eq("invoice_id", invoiceId).eq("installment_no", 1);

  const opened = await poll(async () => {
    const { data } = await admin.from("leads").select("portal_active, student_code").eq("id", studentId).single();
    return data?.portal_active && data.student_code ? data : null;
  }, 20);
  ok("the fixture student has a Student ID and an open portal", Boolean(opened), JSON.stringify(opened));
  const { data: made } = await admin.auth.admin.createUser({ email: PORTAL_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  portalUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId }).eq("id", studentId);

  // What the Documents page counts, read from the database — the ring must say the same.
  const { data: rows } = await admin.from("student_documents").select("status").eq("student_id", studentId);
  const total = rows.length;
  const verified = rows.filter((r) => r.status === "verified").length;

  // ------------------------------------------------------------- signed in
  browser = await openBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  // A page that renders its header and then nothing has usually thrown in the
  // browser; say what it threw rather than only that it is empty.
  const browserErrors = [];
  page.on("pageerror", (e) => browserErrors.push(String(e?.message ?? e)));
  page.on("console", (m) => m.type() === "error" && browserErrors.push(m.text()));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // The form is in the server's HTML; submitted before React has it, the
  // login goes nowhere and the wait below times out.
  await page
    .waitForFunction(() => {
      const el = document.querySelector('input[type="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await page.fill('input[type="email"]', PORTAL_EMAIL);
  await page.fill('input[type="password"]', FIXTURE_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const journey = page.locator("[data-journey]");
  const shown = await journey.waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("the dashboard opens on the journey", shown,
    `${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)} | browser errors: ${browserErrors.slice(0, 5).join(" || ").slice(0, 1500)}`);
  if (!shown) throw new Error("no dashboard to read");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/student-dashboard.png`, fullPage: true });

  console.log("\n--- the journey ---");
  const state = async (key) => page.locator(`[data-journey-step="${key}"]`).getAttribute("data-state");
  ok("Registered, Agreement and Applied are ticked",
    (await state("registered")) === "done" && (await state("agreement")) === "done" && (await state("applied")) === "done",
    `${await state("registered")} ${await state("agreement")} ${await state("applied")}`);
  ok("Documents is the current step", (await state("documents")) === "current", await state("documents"));
  ok("...and Admission, Visa and Travel are still ahead",
    (await state("admission")) === "upcoming" && (await state("visa")) === "upcoming" && (await state("travel")) === "upcoming");
  ok("3 of 7 steps, 43%", (await page.locator("[data-journey-percent]").innerText()).trim() === "43%" && (await journey.innerText()).includes("3 of 7 steps"));
  const next = (await page.locator("[data-journey-next]").innerText()).replace(/\s+/g, " ");
  ok("the next step says what is left to do", next.includes("Next — Documents:") && next.includes("2 documents to upload"), next);

  console.log("\n--- the four figures ---");
  const ring = async (kpi) => page.locator(`[data-kpi="${kpi}"] svg[role="img"]`).getAttribute("aria-label").catch(() => null);
  ok("documents: approved of the total the Documents page counts", (await ring("documents")) === `Approved: ${verified}/${total} (${Math.round((verified / total) * 100)}%)`, await ring("documents"));
  const payments = (await page.locator('[data-kpi="payments"]').innerText()).replace(/\s+/g, " ");
  ok("payments: what is paid of the invoice total", payments.includes("€500 of €1,200 paid") && payments.includes("42%"), payments);
  ok("...and when the next instalment is due", /Next due/.test(payments), payments);
  const profile = (await page.locator('[data-kpi="profile"]').innerText()).replace(/\s+/g, " ");
  ok("profile: warns that the passport expires soon", profile.includes("Your passport expires soon"), profile);
  ok("no appointment booked says so", (await page.locator('[data-kpi="appointment"]').innerText()).includes("No appointment booked"));

  console.log("\n--- coming up ---");
  const timeline = await page.locator("[data-timeline] li").allInnerTexts();
  const flat = timeline.map((t) => t.replace(/\s+/g, " "));
  const at = (re) => flat.findIndex((t) => re.test(t));
  ok("the unpaid instalment is on it", at(/Instalment 2 — €700/) !== -1, flat.join(" | "));
  ok("...the application deadline", at(/Applications close — zztmp Dashboard University/) !== -1);
  ok("...the document that is due", at(/Upload zztmp Doc 5/) !== -1);
  ok("...and the passport", at(/Your passport expires/) !== -1);
  ok("soonest first: document (10 days), instalment (15), deadline (20), passport (60)",
    at(/zztmp Doc 5/) < at(/Instalment 2/) && at(/Instalment 2/) < at(/Applications close/) && at(/Applications close/) < at(/passport/),
    flat.join(" | "));
  ok("...each with how long is left", /in 10 days/.test(flat[at(/zztmp Doc 5/)] ?? ""), flat[at(/zztmp Doc 5/)]);

  console.log("\n--- applications ---");
  const donut = await page.locator('svg[aria-label^="Applications by stage"]').getAttribute("aria-label").catch(() => null);
  ok("the donut names the stage the application is at", Boolean(donut?.includes("Under Review 1")), String(donut));
  // The cards live on their own page now. "Acceptance Letter" is a stage only
  // a boarding pass prints, so its absence says the cards are gone.
  const dashText = await page.locator("main").innerText();
  ok("the dashboard no longer lists the application cards", !dashText.includes("Acceptance Letter"));
  ok("...but its chart links to them", (await page.getByRole("link", { name: /View applications/ }).getAttribute("href")) === "/portal/applications");

  console.log("\n--- the menu ---");
  const menu = (await page.locator("aside nav a, nav a").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pos = (label) => menu.findIndex((m) => m.includes(label));
  ok("Applications has its own entry, after Documents", pos("Applications") !== -1 && pos("Applications") === pos("Documents") + 1, menu.join(" | "));
  ok("Scholarship follows it, Italy having scholarship bodies", pos("Scholarship") === pos("Applications") + 1, menu.join(" | "));

  console.log("\n--- the Applications page ---");
  await page.getByRole("link", { name: /View applications/ }).click();
  await page.waitForURL((u) => u.pathname === "/portal/applications", { timeout: 40000 });
  const cards = page.locator("[data-applications]");
  await cards.waitFor({ timeout: 40000 });
  const cardsText = (await cards.innerText()).replace(/\s+/g, " ");
  ok("it lists the application as a boarding pass", cardsText.includes("zztmp Dashboard University") && cardsText.includes("Acceptance Letter"), cardsText.slice(0, 300));
  ok("...with its round's closing date", /apply by/i.test(cardsText), cardsText.slice(0, 300));
  const summaryText = (await page.locator("[data-applications-summary]").innerText()).replace(/\s+/g, " ");
  ok("the summary counts it: 1 application, 1 submitted, 0 offers",
    summaryText.includes("1 application") && summaryText.includes("1 submitted") && summaryText.includes("0 offers"), summaryText);
  ok("each country's progress is here too", (await page.locator("main").innerText()).includes("Progress by country"));
  await page.locator("[data-applications] a").first().click();
  await page.waitForURL((u) => /\/portal\/applications\/[^/]+$/.test(u.pathname), { timeout: 40000 });
  ok("an application leads back to Applications", (await page.getByRole("link", { name: /Back to applications/ }).getAttribute("href")) === "/portal/applications");

  console.log("\n--- the Scholarship page ---");
  await page.goto(`${BASE}/portal/scholarship`, { waitUntil: "domcontentloaded" });
  const italyCard = page.locator('[data-scholarship-country="Italy (Public)"]');
  const hasItaly = await italyCard.waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok("it says what Italy offers", hasItaly && (await italyCard.innerText()).includes("Every student can apply"), await page.locator("main").innerText().catch(() => ""));

  console.log("\n--- full width ---");
  const width = async () => page.evaluate(() => document.querySelector("h2")?.parentElement?.getBoundingClientRect().width ?? 0);
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-journey]").waitFor({ timeout: 40000 });
  const dashWidth = await page.locator("[data-journey]").evaluate((el) => el.getBoundingClientRect().width);
  ok("the dashboard uses the width of the screen", dashWidth > 1000, `${Math.round(dashWidth)}px`);
  for (const path of ["/portal/applications", "/portal/scholarship", "/portal/documents", "/portal/payments", "/portal/profile", "/portal/support", "/portal/agreement", "/portal/appointments", "/portal/messages", "/portal/guide", "/portal/visa"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("h2").first().waitFor({ timeout: 40000 }).catch(() => {});
    const w = await width();
    ok(`${path} is full width, not a narrow column`, w > 1000, `${Math.round(w)}px`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/student${path.split("/").join("-")}.png`, fullPage: true });
  }

  // On a phone the journey runs down the page and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-journey]").waitFor({ timeout: 40000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok("on a phone the dashboard does not scroll sideways", overflow <= 1, `${overflow}px too wide`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/student-dashboard-phone.png`, fullPage: true });
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("applications").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
    await admin.from("student_documents").delete().eq("student_id", studentId);
  }
  if (universityId) await admin.from("universities").delete().eq("id", universityId);
  const removed = await fx.cleanup();
  // After the lead: leads.auth_user_id references this login until it goes.
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
