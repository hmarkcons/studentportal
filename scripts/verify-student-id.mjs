// Student IDs by intake, end to end against the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:studentid
//
// Nothing here can be checked from unit tests. The numbering lives entirely in
// SQL (migration 0260) — two triggers, a per-intake counter and a table of
// held places — and the portal lock it drives lives in a layout and a landing
// page. Typecheck and build stay green whatever any of it does.
//
// The four rules the office set, each of which is one assertion below:
//
//   1. The number restarts at 0001 for every intake, counting across every
//      country within it.
//   2. A student with no intake yet holds their place by registration date, so
//      a later registration cannot overtake them.
//   3. A number, once issued, is never renumbered. A back-dated import takes
//      the next free number even though those students registered earlier.
//   4. No Student ID, no portal — and no staff override.
//
// Rules 2 and 3 pull against each other, and a change that satisfies one by
// breaking the other looks completely fine from the outside. That is what this
// is for.
//
// Everything is created as `zztmp *` against invented intakes (Fall 2098,
// Spring 2099) so it can never collide with a real cycle, and removed in a
// finally. One caveat worth knowing: between creating a student with no intake
// and giving them one, that student legitimately holds a place in any intake
// that hands out a number — so a real registration completed inside this
// script's few seconds would leave one permanent gap in its intake. The window
// is small and the gap is harmless, but it is not nothing.
import {
  BASE,
  FIXTURE_PASSWORD,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:studentid");

const INTAKE_A = "Fall 2098";
const INTAKE_B = "Spring 2099";
const TOKEN_A = "FALL98";
const TOKEN_B = "SPR99";

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const pad = (n) => String(n).padStart(4, "0");

const read = async (id) =>
  (
    await admin
      .from("leads")
      .select("student_code, student_seq, student_intake_code, student_intake_seq, legacy_student_codes")
      .eq("id", id)
      .single()
  ).data;

/**
 * Waits for a condition rather than sleeping past it.
 *
 * The numbering runs inside the write's own transaction, so in principle it is
 * there the moment the insert responds. In principle is not the same as in
 * fact when a pooler sits in between, and a sleep long enough to be safe is
 * long enough to hide a regression that made it slow.
 */
async function until(fn, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Registered students still waiting for an intake, who therefore hold places. */
async function waitingForIntake() {
  const { data } = await admin
    .from("leads")
    .select("id")
    .eq("registration_status", "registered")
    .not("registered_at", "is", null)
    .is("student_intake_seq", null);
  return (data ?? []).length;
}

const authUsers = [];

try {
  const { data: destination } = await admin
    .from("destinations")
    .select("id, country_code, display_name")
    .eq("status", "active")
    .order("display_name")
    .limit(1)
    .single();
  const CC = destination.country_code.toUpperCase();
  console.log(`using ${destination.display_name} (${CC})\n`);

  /** A registered student, optionally with their country and their intake. */
  async function register(name, { registeredAt, intake = null, withCountry = true } = {}) {
    const id = await fx.lead({
      full_name: `zztmp ${name}`,
      status: "registered",
      registration_status: "registered",
      registered_at: registeredAt,
      intake,
    });
    if (withCountry) {
      const { error } = await admin
        .from("lead_destinations")
        .insert({ lead_id: id, destination_id: destination.id, is_backup: false });
      if (error) throw new Error(`could not add a destination for ${name}: ${error.message}`);
    }
    return id;
  }

  // ------------------------------------------- a place is taken at registration
  const early = await register("sid-early", { registeredAt: daysAgo(3), intake: null });
  const earlyRow = await until(async () => {
    const r = await read(early);
    return r.student_seq ? r : null;
  }, "the early student's place");

  ok("a student with no intake still takes a place in the running order", Boolean(earlyRow.student_seq));
  ok("...and gets no Student ID until one is recorded", earlyRow.student_code === null,
    String(earlyRow.student_code));

  // ------------------------------- rule 2: the later registration cannot overtake
  const later = await register("sid-later", { registeredAt: daysAgo(2), intake: INTAKE_A });
  const laterRow = await until(async () => {
    const r = await read(later);
    return r.student_code ? r : null;
  }, "the later student's code");

  ok("a Student ID names the intake, the country and the place in it",
    new RegExp(`^HMC-${TOKEN_A}-${CC}-\\d{4}$`).test(laterRow.student_code ?? ""), String(laterRow.student_code));

  const { data: holds } = await admin
    .from("student_code_holds")
    .select("seq, lead_id")
    .eq("intake_code", TOKEN_A);
  const heldForEarly = (holds ?? []).find((h) => h.lead_id === early);

  ok("a place in that intake is held for the student still waiting", Boolean(heldForEarly),
    JSON.stringify(holds));
  ok("...and it is the place immediately before the later registration's",
    heldForEarly?.seq === laterRow.student_intake_seq - 1,
    `held ${heldForEarly?.seq}, issued ${laterRow.student_intake_seq}`);

  // ----------------------------------- the held place is claimed, not forfeited
  await admin.from("leads").update({ intake: INTAKE_A }).eq("id", early);
  const earlyCoded = await until(async () => {
    const r = await read(early);
    return r.student_code ? r : null;
  }, "the early student's code once their intake is set");

  ok("recording the intake issues the ID the student was always going to have",
    earlyCoded.student_code === `HMC-${TOKEN_A}-${CC}-${pad(heldForEarly.seq)}`,
    String(earlyCoded.student_code));
  ok("the earlier registration ends up ahead of the later one, despite being numbered second",
    earlyCoded.student_intake_seq < laterRow.student_intake_seq,
    `${earlyCoded.student_intake_seq} vs ${laterRow.student_intake_seq}`);

  const { data: holdsAfter } = await admin
    .from("student_code_holds")
    .select("lead_id")
    .eq("intake_code", TOKEN_A)
    .eq("lead_id", early);
  ok("the hold is released once it is claimed", (holdsAfter ?? []).length === 0);

  // ------------------------------------------------- the intake keeps counting
  const third = await register("sid-third", { registeredAt: daysAgo(1), intake: INTAKE_A });
  const thirdRow = await until(async () => {
    const r = await read(third);
    return r.student_code ? r : null;
  }, "the third student's code");
  ok("the next student in the intake takes the next number",
    thirdRow.student_intake_seq === laterRow.student_intake_seq + 1,
    `${thirdRow.student_intake_seq} after ${laterRow.student_intake_seq}`);

  // -------------------------- rule 3: a back-dated import never renumbers anyone
  const backdated = await register("sid-backdated", { registeredAt: daysAgo(30), intake: INTAKE_A });
  const backdatedRow = await until(async () => {
    const r = await read(backdated);
    return r.student_code ? r : null;
  }, "the back-dated student's code");

  ok("a back-dated student takes the next free number rather than their date's place",
    backdatedRow.student_intake_seq === thirdRow.student_intake_seq + 1,
    `${backdatedRow.student_intake_seq} after ${thirdRow.student_intake_seq}`);

  // The point of rule 3, stated as the thing that must NOT have happened.
  const stillLater = await read(later);
  const stillThird = await read(third);
  ok("...and no ID already issued in that intake changed",
    stillLater.student_code === laterRow.student_code && stillThird.student_code === thirdRow.student_code,
    `${stillLater.student_code} / ${stillThird.student_code}`);

  // ------------------------------------- rule 1: every intake starts again at 1
  const waiting = await waitingForIntake();
  const other = await register("sid-other-intake", { registeredAt: new Date().toISOString(), intake: INTAKE_B });
  const otherRow = await until(async () => {
    const r = await read(other);
    return r.student_code ? r : null;
  }, "the other intake's code");

  ok("a different intake counts from the start, not on from the last one",
    otherRow.student_intake_seq === waiting + 1,
    `${otherRow.student_intake_seq}, with ${waiting} students still holding places`);
  ok("...so the same number can exist in two intakes without clashing",
    otherRow.student_intake_seq <= laterRow.student_intake_seq &&
      otherRow.student_code.startsWith(`HMC-${TOKEN_B}-`),
    `${otherRow.student_code} vs ${laterRow.student_code}`);

  // --------------------------------------------- rule 4: no Student ID, no portal
  const browser = await openBrowser();
  const locked = await register("sid-locked", { registeredAt: daysAgo(1), intake: null });
  const email = "zztmp-sid-locked@hmark-test.local";
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (authError) throw new Error(`could not create the student login: ${authError.message}`);
  authUsers.push(created.user.id);
  // portal_active deliberately TRUE. This is the staff override the office
  // asked to be impossible: everything else says let them in, and the missing
  // Student ID alone has to keep them out.
  await admin.from("leads").update({ auth_user_id: created.user.id, portal_active: true }).eq("id", locked);

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', FIXTURE_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40_000 });

  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  ok("a student with no Student ID cannot reach the portal, even with portal_active on",
    new URL(page.url()).pathname === "/", page.url());
  // Asserting on the wording specific to this reason, not merely on being
  // bounced: the agreement screen bounces to the same place and would pass a
  // check that only looked at the path.
  ok("...and is told their intake is being confirmed, not to chase an agreement",
    await page.getByText("Your intake is being confirmed").isVisible().catch(() => false));

  await admin.from("leads").update({ intake: INTAKE_B }).eq("id", locked);
  await until(async () => (await read(locked)).student_code, "the locked student's code");

  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  ok("recording the intake opens the portal in the same moment it issues the ID",
    new URL(page.url()).pathname.startsWith("/portal"), page.url());

  await browser.close();
} finally {
  const removed = await fx.cleanup();
  for (const id of authUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  // The invented intakes' counters, which nothing else will ever use.
  await admin.from("student_intake_counters").delete().in("intake_code", [TOKEN_A, TOKEN_B]);
  process.exitCode = finish(removed + authUsers.length) === 0 ? 0 : 1;
}
