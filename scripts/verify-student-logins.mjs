// A registered student's logins, end to end against a portal (0333):
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:studentlogins
//
//   * on a student's Portal credentials no field is one the browser takes for
//     a sign-in — no password-type input, autocomplete off, the password
//     masked by CSS — and a login saved there is read back on Reveal in a
//     panel of its own, large, with Copy, and put away with Hide;
//   * the student's Dashboard shows two of their logins — Gmail, then the
//     university portal named for its university — the username, the
//     password and the login page shown as they are, with when each was
//     last changed, no Reveal and no way to change them; View all 5 logins
//     goes to the Logins page in the same window, and the other three are
//     named, each opening the Logins page at itself, lit up; this portal's
//     own login and the Gmail recovery details are on neither page;
//   * the Logins page (in the menu) has all of them, grouped by kind, each
//     kind in its colour with a chip to jump to it, and how to keep them
//     safe; both pages fit a phone;
//   * the Visa and Scholarship pages show theirs the same way;
//   * each application shows the university's Links & contact: the course,
//     requirements and application portal links, the university's and the
//     coordinator's addresses, and the university portal login kept against
//     that application — and another application's login is not there;
//   * the database refuses a student who tries to change or delete a login.
//
// Everything is named zztmp and removed in a finally.
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:studentlogins");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Logins Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-logins-${RUN}@hmark-test.local`;
const UNI = `zztmp Logins University ${RUN}`;
const OTHER_UNI = `zztmp Other University ${RUN}`;
const LINKS = {
  page: `https://course.zztmp-${RUN}.example/msc`,
  requirements: `https://course.zztmp-${RUN}.example/requirements`,
  portal: `https://apply.zztmp-${RUN}.example/login`,
};
const UNI_EMAILS = `admissions@zztmp-${RUN}.example, international@zztmp-${RUN}.example`;
const COORDINATOR = `coordinator@zztmp-${RUN}.example`;

const GMAIL = { username: `zztmp.logins.${RUN}@gmail.com`, password: `Gm-${RUN}-pass`, link: "https://accounts.google.com/" };
const VISA = { username: `visa-${RUN}`, password: `Vi-${RUN}-pass`, link: `https://visa.zztmp-${RUN}.example/book` };
const SCHOLARSHIP = { username: `dsu-${RUN}`, password: `Ds-${RUN}-pass`, link: `https://dsu.zztmp-${RUN}.example/` };
const UNI_LOGIN = { username: `uni-${RUN}`, password: `Un-${RUN}-pass`, link: `https://apply.zztmp-${RUN}.example/login` };
const OTHER_LOGIN = { username: `other-${RUN}`, password: `Ot-${RUN}-pass`, link: null };
const PORTAL_LOGIN = { username: STUDENT_EMAIL, password: `Po-${RUN}-pass`, link: null };
const RECOVERY_EMAIL = `zztmp-recovery-${RUN}@example.invalid`;
const CODE = "4815 1623";

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

/** What a login panel shows: its username, its password and its login page. */
async function panelSays(panel) {
  if (!(await panel.count())) return null;
  const value = async (field) =>
    (await panel.locator(`[data-login-value="${field}"]`).count()) ? (await panel.locator(`[data-login-value="${field}"]`).innerText()).trim() : null;
  const link = panel.locator("[data-login-page]");
  return { username: await value("username"), password: await value("password"), link: (await link.count()) ? await link.getAttribute("href") : null };
}

const same = (shown, login) => shown && shown.username === login.username && shown.password === login.password && shown.link === login.link;

let browser = null;
let studentUserId = null;
const universityIds = [];
let studentId = null;
const appIds = [];

try {
  const officer = await fx.staff(`loginsproc${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin
    .from("universities")
    .insert({ destination_id: italy.id, name: UNI, city: "zztmp City", type: "public", contact_email: UNI_EMAILS })
    .select("id")
    .single();
  const { data: other } = await admin
    .from("universities")
    .insert({ destination_id: italy.id, name: OTHER_UNI, city: "zztmp City", type: "public" })
    .select("id")
    .single();
  universityIds.push(uni.id, other.id);
  const { data: program } = await admin
    .from("programs")
    .insert({
      university_id: uni.id,
      name: `zztmp MSc Logins ${RUN}`,
      level: "masters",
      page_link: LINKS.page,
      requirements_link: LINKS.requirements,
      application_portal_link: LINKS.portal,
      coordinator_email: COORDINATOR,
    })
    .select("id")
    .single();
  const { data: otherProgram } = await admin
    .from("programs")
    .insert({ university_id: other.id, name: `zztmp MSc Other ${RUN}`, level: "masters" })
    .select("id")
    .single();

  // An intake, so the student has a Student ID and a portal.
  studentId = await fx.lead({
    full_name: STUDENT,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999992",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    processing_officer_id: officer.id,
    assigned_counselor_id: officer.id,
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
  const { data: app } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, program_id: program.id }).select("id").single();
  const { data: otherApp } = await admin
    .from("applications")
    .insert({ student_id: studentId, university_id: other.id, program_id: otherProgram.id })
    .select("id")
    .single();
  appIds.push(app.id, otherApp.id);

  // What staff keep for them, written as the officer would.
  const asOfficer = await apiAs(url, anonKey, officer.email);
  const store = (ownerType, ownerId, type, login) =>
    asOfficer.rpc("store_credential", { p_owner_type: ownerType, p_owner_id: ownerId, p_credential_type: type, p_plaintext: JSON.stringify(login) });
  const stored = await Promise.all([
    store("student", studentId, "visa_appointment_portal", VISA),
    store("student", studentId, `scholarship_portal:zztmp Agency ${RUN}`, SCHOLARSHIP),
    store("student", studentId, "portal_login", PORTAL_LOGIN),
    store("application", app.id, "university_portal", UNI_LOGIN),
    store("application", otherApp.id, "university_portal", OTHER_LOGIN),
    asOfficer.rpc("store_gmail_recovery", {
      p_student: studentId,
      p_email: RECOVERY_EMAIL,
      p_phone: null,
      p_codes: `1. ${CODE}`,
      p_codes_file_name: "codes.txt",
    }),
  ]);
  ok(
    "(the record is set up)",
    stored.every((r) => !r.error),
    stored
      .map((r) => r.error?.message)
      .filter(Boolean)
      .join("; "),
  );

  // -------------------------------------------------------- staff, Portal credentials
  browser = await openBrowser();
  const page = await signIn(browser, officer.email);
  await page.goto(`${BASE}/students/${studentId}?open=portal-credentials`, { waitUntil: "domcontentloaded" });
  const gmail = page.locator('[data-credential="gmail"]');
  await gmail.waitFor({ timeout: 60000 });
  const fields = await gmail.locator("input:not([type=hidden])").evaluateAll((inputs) =>
    inputs.map((i) => ({
      type: i.type,
      name: i.name,
      autocomplete: i.getAttribute("autocomplete"),
      ignore: i.getAttribute("data-1p-ignore"),
      mask: getComputedStyle(i).webkitTextSecurity,
    })),
  );
  ok("no field is a password field the browser would fill", fields.length === 3 && fields.every((f) => f.type !== "password"), JSON.stringify(fields));
  ok(
    "...and none offers the browser's saved logins",
    fields.every((f) => f.autocomplete === "off" && f.ignore === "true"),
    JSON.stringify(fields),
  );
  ok("...the password is still masked as it is typed", fields.find((f) => f.name === "login_secret")?.mask === "disc", JSON.stringify(fields));

  await gmail.locator('input[name="login_user"]').fill(GMAIL.username);
  await gmail.locator('input[name="login_secret"]').fill(GMAIL.password);
  await gmail.locator('input[name="link"]').fill(GMAIL.link);
  await press(page, gmail.getByRole("button", { name: "Save", exact: true }));
  const saved = await poll(async () => (/Saved\./.test(await gmail.innerText()) ? true : null), 45);
  ok("staff save a login from the renamed fields", Boolean(saved));

  await press(page, gmail.getByRole("button", { name: "Reveal" }));
  const panel = gmail.locator('[data-login-details="gmail"]');
  const revealed = await poll(() => panelSays(panel), 30);
  ok("Reveal shows the login in a panel of its own", same(revealed, GMAIL), JSON.stringify(revealed));
  const size = await panel.locator('[data-login-value="password"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  ok("...large", size >= 16, String(size));
  ok("...with Copy for each", (await panel.getByRole("button", { name: /Copy (username|password)/ }).count()) === 2);
  await press(page, panel.getByRole("button", { name: "Hide" }));
  ok("...and Hide puts it away", await poll(async () => ((await panel.count()) === 0 ? true : null), 10));
  await page.close();

  // ------------------------------------------------------------ the student
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

  // ------------------------------------------------------------ the Dashboard: two, and the rest named
  await sp.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const mine = sp.locator("[data-my-logins]");
  await mine.waitFor({ timeout: 60000 });
  const panels = await mine.locator("[data-login-details]").evaluateAll((els) => els.map((e) => e.getAttribute("data-login-details")));
  ok(
    "the Dashboard shows two logins, Gmail and then the university portal",
    JSON.stringify(panels) === JSON.stringify(["gmail", "university_portal"]),
    JSON.stringify(panels),
  );
  ok("...Gmail as it is", same(await panelSays(mine.locator('[data-login-details="gmail"]')), GMAIL));
  const mineText = await mine.innerText();
  ok(
    "...the university portal named for its university, as it is",
    mineText.includes(UNI) &&
      (await mine.locator('[data-login-details="university_portal"] [data-login-caption]').innerText()) === "University portal" &&
      same(await panelSays(mine.locator('[data-login-details="university_portal"]')), UNI_LOGIN),
    mineText.slice(0, 400),
  );
  ok(
    "...and none of the other usernames or passwords",
    ![VISA, SCHOLARSHIP, OTHER_LOGIN].some((l) => mineText.includes(l.password) || mineText.includes(l.username)),
    mineText.slice(0, 600),
  );
  const viewAll = mine.locator("[data-view-all-logins]");
  ok(
    "it offers View all 5 logins, in the same window",
    (await viewAll.count()) === 1 &&
      /View all 5 logins/.test(await viewAll.innerText()) &&
      (await viewAll.getAttribute("href")) === "/portal/logins" &&
      !(await viewAll.getAttribute("target")),
  );
  const chips = await mine.locator("[data-more-login]").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  ok(
    "...and names the other three, each a way to it",
    JSON.stringify(chips) === JSON.stringify([`University portal — ${OTHER_UNI}`, "Visa appointment portal", `zztmp Agency ${RUN} (scholarship portal)`]),
    JSON.stringify(chips),
  );
  ok(
    "...with no Reveal and nothing to change",
    (await mine.getByRole("button", { name: /Reveal|Show|Edit|Save|changed/ }).count()) === 0 && (await mine.locator("input").count()) === 0,
  );
  ok(
    "each shown login says when HMARK last changed it",
    (await mine.locator("[data-login-updated]").count()) === 2 &&
      /^Updated \d{1,2} \w{3,4} \d{4}$/.test(await mine.locator("[data-login-updated]").first().innerText()),
  );
  const html = await sp.content();
  ok(
    "this portal's own login is not among them",
    (await mine.locator('[data-login-details="portal_login"]').count()) === 0 && !html.includes(PORTAL_LOGIN.password),
  );
  ok("nor anything of the Gmail recovery details, anywhere on the page", !html.includes(RECOVERY_EMAIL) && !html.includes(CODE));
  ok("Logins is in the student's menu", (await sp.locator('nav a[href="/portal/logins"]').count()) >= 1);

  // A chip goes to its own login on the Logins page, which lights up.
  await press(sp, mine.locator('[data-more-login="visa_appointment_portal"]'));
  await sp.waitForURL((u) => u.pathname === "/portal/logins" && u.hash.startsWith("#login-"), { timeout: 60000 });
  const landed = await poll(
    async () => {
      const lit = sp.locator('[data-login-details="visa_appointment_portal"][data-focused]');
      return (await lit.count()) ? await lit.getAttribute("id") : null;
    },
    30,
    200,
  );
  ok("a login picked there opens the Logins page at it, lit up", Boolean(landed) && sp.url().endsWith(`#${landed}`), sp.url());
  const box = await sp.locator('[data-login-details="visa_appointment_portal"]').boundingBox();
  ok("...scrolled into view", Boolean(box) && box.y >= 0 && box.y + box.height <= 1100, JSON.stringify(box));

  // ------------------------------------------------------------ the Logins page: all of them, grouped
  await sp.goto(`${BASE}/portal/logins`, { waitUntil: "domcontentloaded" });
  const all = sp.locator("[data-logins-page]");
  await all.waitFor({ timeout: 60000 });
  const groups = await all
    .locator("[data-login-group]")
    .evaluateAll((els) => els.map((e) => [e.getAttribute("data-login-group"), e.querySelectorAll("[data-login-details]").length]));
  ok(
    "the Logins page has all five, by kind: email, universities, visa, scholarships",
    JSON.stringify(groups) ===
      JSON.stringify([
        ["email", 1],
        ["university", 2],
        ["visa", 1],
        ["scholarship", 1],
      ]),
    JSON.stringify(groups),
  );
  const onPage = {
    gmail: await panelSays(all.locator('[data-login-details="gmail"]')),
    visa: await panelSays(all.locator('[data-login-details="visa_appointment_portal"]')),
    scholarship: await panelSays(all.locator(`[data-login-details="scholarship_portal:zztmp Agency ${RUN}"]`)),
  };
  ok("...each as it is", same(onPage.gmail, GMAIL) && same(onPage.visa, VISA) && same(onPage.scholarship, SCHOLARSHIP), JSON.stringify(onPage));
  const allText = await all.innerText();
  ok(
    "...both universities' portals, each under its university",
    allText.includes(UNI_LOGIN.password) &&
      allText.includes(OTHER_LOGIN.password) &&
      allText.includes(OTHER_UNI) &&
      (await all.locator('[data-login-kind="university"] [data-login-caption]').count()) === 2,
  );
  ok(
    "...each in the colour of its kind",
    (await all.locator('[data-login-kind="visa"]').count()) === 1 && (await all.locator('[data-login-kind="university"]').count()) === 2,
  );
  ok(
    "...with a chip to jump to each kind, and the count",
    (await all.locator("[data-login-jumps] a").count()) === 4 && /5 logins/.test(await all.locator("[data-logins-count]").innerText()),
  );
  ok(
    "...with no Reveal and nothing to change",
    (await all.getByRole("button", { name: /Reveal|Show|Edit|Save|changed/ }).count()) === 0 && (await all.locator("input").count()) === 0,
  );
  ok("...and how to keep them safe", (await all.locator("[data-logins-safety]").count()) === 1);
  const allHtml = await sp.content();
  ok(
    "...and nothing of this portal's own login or the Gmail recovery details",
    !allHtml.includes(PORTAL_LOGIN.password) && !allHtml.includes(RECOVERY_EMAIL) && !allHtml.includes(CODE),
  );

  for (const path of ["/portal", "/portal/logins"]) {
    await sp.setViewportSize({ width: 390, height: 900 });
    await sp.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await sp.locator(path === "/portal" ? "[data-my-logins]" : "[data-logins-page]").waitFor({ timeout: 60000 });
    const overflow = await sp.evaluate(() => {
      const edges = [...document.querySelectorAll("[data-login-details], [data-more-logins], [data-login-jumps]")].map((e) => e.getBoundingClientRect().right);
      return { right: Math.round(Math.max(...edges)), width: window.innerWidth, scroll: document.documentElement.scrollWidth };
    });
    ok(`${path} fits a phone`, overflow.right <= overflow.width && overflow.scroll <= overflow.width, JSON.stringify(overflow));
  }
  await sp.setViewportSize({ width: 1400, height: 1100 });

  // ------------------------------------------------------ the Visa and Scholarship pages
  await sp.goto(`${BASE}/portal/visa`, { waitUntil: "domcontentloaded" });
  const visaPanel = sp.locator('[data-login-details="visa_appointment_portal"]');
  await visaPanel.waitFor({ timeout: 60000 }).catch(() => {});
  ok("the Visa page shows the appointment login as it is", same(await panelSays(visaPanel), VISA));
  ok("...with no Show and no way to change it", (await sp.getByRole("button", { name: /^Show|changed this login/ }).count()) === 0);

  await sp.goto(`${BASE}/portal/scholarship`, { waitUntil: "domcontentloaded" });
  const scholarshipPanel = sp.locator(`[data-login-details="scholarship_portal:zztmp Agency ${RUN}"]`);
  await scholarshipPanel.waitFor({ timeout: 60000 }).catch(() => {});
  const scholarshipShown = await panelSays(scholarshipPanel);
  ok(
    "the Scholarship page shows its portal login under the portal's name",
    same(scholarshipShown, SCHOLARSHIP) && (await scholarshipPanel.innerText()).includes(`zztmp Agency ${RUN}`),
    JSON.stringify(scholarshipShown),
  );

  // ------------------------------------------------------------ an application
  await sp.goto(`${BASE}/portal/applications/${app.id}`, { waitUntil: "domcontentloaded" });
  const card = sp.locator("[data-links-contact]");
  await card.waitFor({ timeout: 60000 });
  const hrefs = await card.locator("[data-link-row] a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(
    "the application shows the course, requirements and application portal links",
    JSON.stringify(hrefs) === JSON.stringify([LINKS.page, LINKS.requirements, LINKS.portal]),
    JSON.stringify(hrefs),
  );
  const mails = await card.locator('[data-email-row] a[href^="mailto:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(
    "...the university's addresses and the coordinator's, each one to write to",
    JSON.stringify(mails) === JSON.stringify([`mailto:admissions@zztmp-${RUN}.example`, `mailto:international@zztmp-${RUN}.example`, `mailto:${COORDINATOR}`]),
    JSON.stringify(mails),
  );
  ok("...and the university portal login kept against it", same(await panelSays(card.locator('[data-login-details="university_portal"]')), UNI_LOGIN));
  ok("...and not another application's", !(await card.innerText()).includes(OTHER_LOGIN.username));

  await sp.goto(`${BASE}/portal/applications/${otherApp.id}`, { waitUntil: "domcontentloaded" });
  const otherCard = sp.locator("[data-links-contact]");
  await otherCard.waitFor({ timeout: 60000 });
  const otherText = await otherCard.innerText();
  ok(
    "an application with nothing on file says so, and shows its own login",
    /No links or contacts are recorded/.test(otherText) && otherText.includes(OTHER_LOGIN.username) && !otherText.includes(UNI_LOGIN.username),
    otherText,
  );
  await sp.close();

  // ------------------------------------------------------------ the database
  const asStudent = await apiAs(url, anonKey, STUDENT_EMAIL);
  const write = await asStudent.rpc("store_credential", {
    p_owner_type: "student",
    p_owner_id: studentId,
    p_credential_type: "gmail",
    p_plaintext: JSON.stringify({ username: "hijacked" }),
  });
  ok("the database refuses a student changing a login", /kept by HMARK/.test(write.error?.message ?? ""), JSON.stringify(write.error));
  const remove = await asStudent.rpc("delete_credential", { p_owner_type: "student", p_owner_id: studentId, p_credential_type: "gmail" });
  ok("...or deleting one", Boolean(remove.error), JSON.stringify(remove.error));
  const { data: still } = await asOfficer.rpc("read_credential", { p_owner_type: "student", p_owner_id: studentId, p_credential_type: "gmail" });
  ok("...so the login is as staff left it", JSON.parse(still ?? "{}").username === GMAIL.username, String(still));
  const recovery = await asStudent.rpc("read_gmail_recovery", { p_student: studentId });
  ok("...and the student cannot read the Gmail recovery details", Boolean(recovery.error) && recovery.data === null, JSON.stringify(recovery));
  const { data: theirs } = await asStudent.rpc("my_logins");
  ok(
    "my_logins gives the student only their own, without this portal's",
    (theirs ?? []).length === 5 && !(theirs ?? []).some((r) => r.credential_type === "portal_login"),
    JSON.stringify((theirs ?? []).map((r) => r.credential_type)),
  );
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // Saved logins have no foreign key to go with the student: removed by owner.
  for (const id of [studentId, ...appIds]) if (id) await admin.from("encrypted_credentials").delete().eq("owner_id", id);
  const removed = await fx.cleanup();
  for (const id of universityIds) {
    await admin.from("programs").delete().eq("university_id", id);
    await admin.from("universities").delete().eq("id", id);
  }
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
