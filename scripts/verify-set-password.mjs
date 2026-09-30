// A Super Admin setting the password they choose, for anyone, end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:setpassword
//   PORTAL_URL=http://localhost:3000 ...      (against a local server)
//
// Asserted on the thing itself — a sign-in that works or fails, a session
// that ends, a copy the database keeps — never on wording alone:
//
//   1. The rules: a weak password cannot be saved, a generated one can.
//   2. A staff member's password: the chosen one signs in, the old one no
//      longer does, a session they had open ends, and Reveal shows it.
//   3. The Super Admin's own: set from their own record, and they stay signed
//      in on the page they set it from.
//   4. A student's: set from their record by a Super Admin; the student signs
//      in with it, and the kept portal copy holds it. Processing staff see no
//      way to reset or set it.
//   5. A partner university's: set from Staff Management's list of partner
//      accounts; they sign in with it and the database keeps a copy.
//   6. The database refuses anyone else the functions behind it.
//
// Mails go to fixture addresses on a domain that does not exist, so the
// mailbox the portal sends from may receive a bounce per run.
import {
  BASE,
  FIXTURE_PASSWORD,
  apiAs,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
  signIn,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:setpassword");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const STUDENT_EMAIL = "zztmp-setpw-student@hmark-test.local";
const PARTNER_EMAIL = "zztmp-setpw-partner@hmark-test.local";
const made = { users: [], universityId: null, partnerId: null, studentId: null };

/** Signs in with any password in a fresh browser; resolves to whether it got past /login. */
async function tryLogin(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const el = document.querySelector('input[name="email"]');
    return el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  }, null, { timeout: 60_000 }).catch(() => {});
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  const landed = await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).then(() => true, () => false);
  await context.close();
  return landed;
}

async function openLoginPanel(page, fullName) {
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const row = page.locator("tr", { hasText: fullName }).first();
  await row.locator('button[aria-label="Actions"]').click();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const panel = page.getByRole("dialog").last();
  await panel.getByText("Signs in with").waitFor({ timeout: 30_000 });
  return panel;
}

/** Types a password into a Set password form and saves it; resolves to what the box then shows. */
async function setPassword(page, scope, password) {
  const form = scope.locator("[data-set-password]").first();
  await form.locator("[data-set-password-open]").click();
  await form.locator("[data-set-password-input]").fill(password);
  page.once("dialog", (d) => d.accept());
  await form.locator("[data-set-password-save]").click();
  const shown = form.locator("[data-credentials] [data-credential-password]").first();
  const appeared = await shown.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  return appeared ? (await shown.innerText()).trim() : `(nothing shown: ${(await form.innerText()).slice(0, 300)})`;
}

async function freshUser(email) {
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of existing?.users ?? []) if (u.email === email) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const { data, error } = await admin.auth.admin.createUser({ email, password: FIXTURE_PASSWORD, email_confirm: true });
  if (error || !data?.user) throw new Error(`could not create ${email}: ${error?.message}`);
  made.users.push(data.user.id);
  return data.user.id;
}

let browser = null;
try {
  const superUser = await fx.staff("setpwsuper", ["super_admin"]);
  const target = await fx.staff("setpwtarget", ["counselor"]);
  const officer = await fx.staff("setpwproc", ["processing"]);

  const studentId = await fx.lead({
    full_name: "zztmp SetPw Student", email: STUDENT_EMAIL, contact_number: "0300-9999994",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    processing_officer_id: officer.id,
  });
  made.studentId = studentId;
  const studentUser = await freshUser(STUDENT_EMAIL);
  await admin.from("leads").update({ auth_user_id: studentUser, portal_active: true }).eq("id", studentId);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp SetPw University", city: "zztmp", type: "public" }).select("id").single();
  made.universityId = uni.id;
  const partnerUser = await freshUser(PARTNER_EMAIL);
  const { error: partnerError } = await admin.from("partner_university_accounts").insert({ id: partnerUser, university_id: uni.id, staff_name: "zztmp SetPw Partner", status: "active" });
  if (partnerError) throw new Error(`partner account: ${partnerError.message}`);
  made.partnerId = partnerUser;

  browser = await openBrowser();

  // ------------------------------------------------ 1–2. a staff member
  const targetPage = await signIn(browser, target.email);
  ok("the staff member starts signed in", !new URL(targetPage.url()).pathname.startsWith("/login"));

  const sa = await signIn(browser, superUser.email);
  let panel = await openLoginPanel(sa, target.name);
  const form = panel.locator("[data-staff-set-password] [data-set-password]").first();
  await form.locator("[data-set-password-open]").click();
  await form.locator("[data-set-password-input]").fill("abc");
  ok("a password without 8 characters and a number cannot be saved", await form.locator("[data-set-password-save]").isDisabled());
  await form.locator("[data-set-password-generate]").click();
  const generated = await form.locator("[data-set-password-input]").inputValue();
  ok("Generate fills in a strong password", /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{16}$/.test(generated), generated);
  ok("...which can be saved", !(await form.locator("[data-set-password-save]").isDisabled()));
  // Closed again, to set one typed by hand.
  await form.getByRole("button", { name: "Cancel" }).click();

  const chosen = `Karachi${Date.now() % 100000}x`;
  const shownStaff = await setPassword(sa, panel.locator("[data-staff-set-password]"), chosen);
  ok("setting a staff member's password shows the one chosen", shownStaff === chosen, shownStaff);

  await targetPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const out = new URL(targetPage.url()).pathname;
  ok("...and signs them out of the session they had open", out.startsWith("/login") || out === "/", targetPage.url());
  ok("...the chosen password signs in", await tryLogin(browser, target.email, chosen));
  ok("...the old one no longer does", !(await tryLogin(browser, target.email, FIXTURE_PASSWORD)));

  panel = await openLoginPanel(sa, target.name);
  await panel.getByRole("button", { name: "Reveal password" }).click();
  const revealed = panel.locator("[data-credentials] [data-credential-password]").first();
  await revealed.waitFor({ timeout: 30_000 });
  ok("...and Reveal shows it", (await revealed.innerText()).trim() === chosen, await revealed.innerText());

  // ------------------------------------------ 3. the Super Admin's own
  const mine = `Lahore${Date.now() % 100000}y`;
  panel = await openLoginPanel(sa, superUser.name);
  ok("their own record offers 'Set my password'", (await panel.getByRole("button", { name: /Set my password/ }).count()) === 1);
  const shownMine = await setPassword(sa, panel.locator("[data-staff-set-password]"), mine);
  ok("the Super Admin sets their own password", shownMine === mine, shownMine);
  await sa.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  ok("...and stays signed in on the page they set it from", new URL(sa.url()).pathname === "/dashboard", sa.url());
  ok("...their new password signs in", await tryLogin(browser, superUser.email, mine));

  // --------------------------------------------------------- 4. a student
  const proc = await signIn(browser, officer.email);
  await proc.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  let header = proc.locator("button[aria-expanded]").filter({ hasText: "Registration & Portal Access" }).first();
  await header.waitFor({ timeout: 90_000 });
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  await proc.getByText("Portal access:").first().waitFor({ timeout: 30_000 });
  ok("processing staff are not offered a password reset", (await proc.getByRole("button", { name: /Reset password|Set a password/ }).count()) === 0);
  ok("...and are told only a Super Admin can", (await proc.getByText("Only a Super Admin can reset or set").count()) > 0);

  await sa.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  header = sa.locator("button[aria-expanded]").filter({ hasText: "Registration & Portal Access" }).first();
  await header.waitFor({ timeout: 90_000 });
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  const studentPassword = `Student${Date.now() % 100000}z`;
  const shownStudent = await setPassword(sa, sa.locator("[data-student-set-password]"), studentPassword);
  ok("a Super Admin sets a student's password", shownStudent === studentPassword, shownStudent);
  ok("...the student signs in with it", await tryLogin(browser, STUDENT_EMAIL, studentPassword));
  ok("...not with the old one", !(await tryLogin(browser, STUDENT_EMAIL, FIXTURE_PASSWORD)));
  const { data: studentCopy } = await admin
    .from("encrypted_credentials")
    .select("updated_at")
    .eq("owner_type", "student")
    .eq("owner_id", studentId)
    .eq("credential_type", "portal_login")
    .maybeSingle();
  ok("...and a copy is kept for Reveal", Boolean(studentCopy), JSON.stringify(studentCopy));

  // ------------------------------------------------------- 5. a partner
  await sa.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const account = sa.locator(`[data-partner-account="${partnerUser}"]`);
  await account.waitFor({ timeout: 60_000 });
  await account.locator("summary").click();
  const partnerPassword = `Partner${Date.now() % 100000}w`;
  const shownPartner = await setPassword(sa, account, partnerPassword);
  ok("a Super Admin sets a partner university's password", shownPartner === partnerPassword, shownPartner);
  ok("...the partner signs in with it", await tryLogin(browser, PARTNER_EMAIL, partnerPassword));
  const { data: partnerCopy } = await admin.from("partner_login_credentials").select("partner_id").eq("partner_id", partnerUser);
  ok("...and a copy is kept in its own table", (partnerCopy ?? []).length === 1);

  // ------------------------------------------- 6. nobody else, in the database
  const asOfficer = await apiAs(url, anonKey, officer.email);
  const revoke = await asOfficer.rpc("revoke_user_sessions", { p_user_id: studentUser });
  ok("the database refuses anyone else a sign-out", Boolean(revoke.error));
  const readPartner = await asOfficer.rpc("read_partner_login", { p_partner_id: partnerUser });
  ok("...or a partner's password", Boolean(readPartner.error));
  const storePartner = await asOfficer.rpc("store_partner_login", { p_partner_id: partnerUser, p_plaintext: "{}" });
  ok("...or overwriting one", Boolean(storePartner.error));
} finally {
  if (browser) await browser.close();
  if (made.partnerId) await admin.from("partner_university_accounts").delete().eq("id", made.partnerId);
  if (made.universityId) await admin.from("universities").delete().eq("id", made.universityId);
  // The kept portal copy has no foreign key to go with the student.
  if (made.studentId) await admin.from("encrypted_credentials").delete().eq("owner_type", "student").eq("owner_id", made.studentId);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) ? 1 : 0;
}
