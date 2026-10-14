// Only the scholarship body of the university a student applied to — never the
// rest of the country's (src/lib/scholarshipScope.ts), end to end:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:scholarshipscope
//
//   * before a university is finalised, the student's Scholarship page names
//     no body and no region at all — not one of Italy's, not one of France's —
//     and says theirs appears once it is;
//   * finalised, the student sees that university's own body and no other;
//     the staff tab says it is the only one, and its guides are that one alone;
//   * a finalised university with no body linked shows the student none, and
//     staff are offered the chooser, with no other region's guide; once a body
//     is recorded for it, the student and staff see that one;
//   * a merit-based country (France) shows nothing until the student is put
//     forward for a scholarship, and then that one and no other.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:scholarshipscope");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const STUDENT_EMAIL = `zztmp-scope-${RUN}@hmark-test.local`;
const U1 = `zztmp Scope University ${RUN}`;
const U2 = `zztmp Unlinked University ${RUN}`;
const U3 = `zztmp Paris University ${RUN}`;
const A = `zztmp DSU Alpha ${RUN}`;
const B = `zztmp DSU Beta ${RUN}`;
const M = `zztmp Merit France ${RUN}`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const bodyIds = [];
const universityIds = [];
let studentUserId = null;
let studentId = null;
let browser = null;

try {
  const sup = await fx.staff(`scopesup${RUN}`, ["super_admin"]);
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: france } = await admin.from("destinations").select("id").eq("display_name", "France (Public)").single();

  const body = async (name, region, destinationId) => {
    const { data, error } = await admin.from("scholarship_bodies").insert({ name, region, academic_year: "2099/2100", covers: [] }).select("id").single();
    if (error) throw new Error(`body ${name}: ${error.message}`);
    bodyIds.push(data.id);
    await admin.from("scholarship_body_destinations").insert({ scholarship_body_id: data.id, destination_id: destinationId });
    return data.id;
  };
  const bodyA = await body(A, "zztmp Alpha region", italy.id);
  const bodyB = await body(B, "zztmp Beta region", italy.id);
  const bodyM = await body(M, null, france.id);

  const university = async (name, destinationId, dsu) => {
    const { data, error } = await admin
      .from("universities")
      .insert({ destination_id: destinationId, name, city: "zztmp City", type: "public", dsu_body_id: dsu })
      .select("id")
      .single();
    if (error) throw new Error(`university ${name}: ${error.message}`);
    universityIds.push(data.id);
    return data.id;
  };
  const u1 = await university(U1, italy.id, bodyA);
  const u2 = await university(U2, italy.id, null);
  const u3 = await university(U3, france.id, null);

  // Every body either country has, real ones included: none may show unless it is the student's.
  const namesOf = async (destinationId) =>
    ((await admin.from("scholarship_body_destinations").select("body:scholarship_bodies(name)").eq("destination_id", destinationId)).data ?? [])
      .map((l) => l.body?.name)
      .filter(Boolean);
  const italyNames = await namesOf(italy.id);
  const franceNames = await namesOf(france.id);
  const others = (except) => [...italyNames, ...franceNames].filter((n) => !except.includes(n));

  studentId = await fx.lead({
    full_name: `zztmp Scope Student ${RUN}`,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999996",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: "Italy (Public)",
  });
  await admin.from("lead_destinations").insert([
    { lead_id: studentId, destination_id: italy.id, is_backup: false },
    { lead_id: studentId, destination_id: france.id, is_backup: true },
  ]);
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  const { data: made, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);
  const app = async (universityId) =>
    (await admin.from("applications").insert({ student_id: studentId, university_id: universityId }).select("id").single()).data.id;
  const app1 = await app(u1);
  const app2 = await app(u2);
  const app3 = await app(u3);

  browser = await openBrowser();
  const sp = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp
    .waitForFunction(
      () =>
        Boolean(
          document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber")),
        ),
      null,
      { timeout: 60000 },
    )
    .catch(() => {});
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });

  const studentPage = async () => {
    await sp.goto(`${BASE}/portal/scholarship`, { waitUntil: "domcontentloaded" });
    await sp.locator("[data-scholarship-countries]").waitFor({ timeout: 60000 });
    return sp.content();
  };
  const shownOf = (html, names) => names.filter((n) => html.includes(n.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")) || html.includes(n));

  // ------------------------------------------------------------ nothing finalised
  let html = await studentPage();
  ok(
    "before a university is finalised, the student sees no body or region at all",
    shownOf(html, others([])).length === 0,
    shownOf(html, others([])).join(", "),
  );
  ok("...and is told theirs appears once it is", (await sp.locator("[data-scholarship-awaits]").count()) >= 1);

  // ------------------------------------------------------------ finalised, linked
  await admin.from("applications").update({ is_finalized: true }).eq("id", app1);
  html = await studentPage();
  const finalCard = sp.locator(`[data-finalized-for="${U1}"]`);
  ok("finalised, the student sees that university's own body", (await finalCard.count()) === 1 && (await finalCard.innerText()).includes(A));
  ok("...and no other body or region", shownOf(html, others([A])).length === 0, shownOf(html, others([A])).join(", "));

  const page = await signIn(browser, sup.email);
  const staffTab = async () => {
    await page.goto(`${BASE}/students/${studentId}/scholarship`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-scholarship-scope]").first().waitFor({ timeout: 60000 });
  };
  const card = (name) => page.locator("[data-card]", { has: page.locator("h3", { hasText: name }) });
  await staffTab();
  ok(
    "the staff tab says it is the only one",
    /Its scholarship body is .*zztmp DSU Alpha.* the only one shown here/s.test(await card(U1).locator("[data-scholarship-scope]").innerText()),
  );
  const guides = await card(U1).locator("[data-scholarship-guides]").innerText();
  ok("...and its guides are that body's alone", guides.includes(A) && shownOf(guides, others([A])).length === 0, shownOf(guides, others([A])).join(", "));

  // ------------------------------------------------------------ finalised, nothing linked
  await admin.from("applications").update({ is_finalized: true }).eq("id", app2);
  await staffTab();
  const unlinked = card(U2);
  ok(
    "a finalised university with no body linked says so on the staff tab",
    /No body in the directory is linked to it yet/.test(await unlinked.locator("[data-scholarship-scope]").innerText()),
  );
  ok("...offers the chooser", (await unlinked.locator("[data-scholarship-choose-body]").count()) === 1);
  ok("...and shows no other region's guide", (await unlinked.locator("[data-scholarship-guides]").count()) === 0);
  html = await studentPage();
  const unlinkedCard = sp.locator(`[data-finalized-for="${U2}"]`);
  ok(
    "the student sees no body for it, only that their counsellor will confirm",
    (await unlinkedCard.count()) === 1 && /will confirm/.test(await unlinkedCard.innerText()) && shownOf(html, others([A])).length === 0,
  );

  await admin.from("student_scholarships").insert({ student_id: studentId, application_id: app2, scholarship_body_id: bodyB, name: B, status: "pending" });
  html = await studentPage();
  ok("once a body is recorded for it, the student sees that one", (await sp.locator(`[data-finalized-for="${U2}"]`).innerText()).includes(B));
  ok("...still no other", shownOf(html, others([A, B])).length === 0, shownOf(html, others([A, B])).join(", "));
  await staffTab();
  ok(
    "...and so does staff, said to have been chosen",
    /was chosen for this student/.test(await card(U2).locator("[data-scholarship-scope]").innerText()) &&
      (await card(U2).locator("[data-scholarship-guides]").innerText()).includes(B),
  );

  // ------------------------------------------------------------ merit-based
  await admin.from("applications").update({ is_finalized: true }).eq("id", app3);
  html = await studentPage();
  ok("a merit-based country shows nothing until the student is put forward", shownOf(html, franceNames).length === 0, shownOf(html, franceNames).join(", "));
  await admin.from("student_scholarships").insert({ student_id: studentId, application_id: app3, scholarship_body_id: bodyM, name: M, status: "pending" });
  html = await studentPage();
  ok(
    "...and then that one and no other",
    html.includes(M) &&
      shownOf(
        html,
        franceNames.filter((n) => n !== M),
      ).length === 0,
    shownOf(
      html,
      franceNames.filter((n) => n !== M),
    ).join(", "),
  );
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  if (studentId) await admin.from("student_scholarships").delete().eq("student_id", studentId);
  const removed = await fx.cleanup();
  for (const id of universityIds) await admin.from("universities").delete().eq("id", id);
  for (const id of bodyIds) {
    await admin.from("scholarship_body_destinations").delete().eq("scholarship_body_id", id);
    await admin.from("scholarship_bodies").delete().eq("id", id);
  }
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
