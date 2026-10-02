// Sending a student their logins, from the two places on their page that do,
// end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:sendcredentials
//
// As a processing officer — whoever sees the sections and may press Reveal may
// send (a counsellor gets the stages-only view of a student, without them):
//
//   Registration & Portal Access   "Copy as message" copies their login for
//                                  this portal — where to sign in, the email,
//                                  the password — and nothing else; "Send to
//                                  student" asks first, then emails only that.
//   Portal credentials             this portal's own login is not there at
//                                  all. Either button opens the section's
//                                  logins to tick, none ticked, one with
//                                  nothing saved not tickable, and a login kept
//                                  against an application not offered; nothing
//                                  can go until something is ticked, and then
//                                  exactly what is ticked goes — by email, or
//                                  copied as a message, the ticks shared.
//   each                           leaves a note on the timeline naming what
//                                  went and who sent it, never a password.
//   who                            a counsellor who is not the student's
//                                  cannot read their logins at all.
//
// Everything is named zztmp and removed in a finally.
import { BASE, apiAs, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:sendcredentials");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const STUDENT_EMAIL = "zztmp-sendcreds-student@hmark-test.local";
const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

async function poll(fn, seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;
let studentId = null;
let appId = null;
let universityId = null;
let portalUserId = null;

try {
  const officer = await fx.staff("sendcreds", ["processing"]);
  const stranger = await fx.staff("sendcredsother", ["counselor"]);
  studentId = await fx.lead({
    full_name: "zztmp SendCreds Student", email: STUDENT_EMAIL, contact_number: "0300-9999983",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: karachiToday(), country_of_interest: "Italy (Public)", intake: "Fall 2099", level_applying_for: "masters",
  });
  // A portal login of their own, so Registration & Portal Access offers to send it.
  for (const u of (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? []) {
    if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  const { data: portalUser, error: portalError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (portalError) throw new Error(`portal login: ${portalError.message}`);
  portalUserId = portalUser.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId, portal_active: true }).eq("id", studentId);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp SendCreds University", city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: app, error: appError } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, intake: "Fall 2099" }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  appId = app.id;

  // Saved as the officer, the way the sections save them.
  const asOfficer = await apiAs(url, anonKey, officer.email);
  const store = async (ownerType, ownerId, type, username, password) => {
    const { error } = await asOfficer.rpc("store_credential", {
      p_owner_type: ownerType, p_owner_id: ownerId, p_credential_type: type, p_plaintext: JSON.stringify({ username, password }),
    });
    if (error) throw new Error(`store ${type}: ${error.message}`);
  };
  await store("student", studentId, "portal_login", STUDENT_EMAIL, "zztmp-Hmark-7Qx");
  await store("student", studentId, "gmail", "zztmp.sendcreds@gmail.com", "zztmp-Gmail-4Rk");
  await store("student", studentId, "university_portal", "ZZSTUDENT", "zztmp-Uni-2Pd");
  await store("student", studentId, "visa_appointment_portal", "", "");
  await store("student", studentId, "scholarship_portal:zztmp EDiSU", "zz-edisu", "zztmp-Sch-5Tn");
  await store("application", appId, "university_portal", "ZZAPP", "zztmp-App-9Ws");
  const PASSWORDS = ["zztmp-Hmark-7Qx", "zztmp-Gmail-4Rk", "zztmp-Uni-2Pd", "zztmp-Sch-5Tn", "zztmp-App-9Ws"];

  const notes = async () =>
    (await admin.from("messages").select("body, channel, sent_by").eq("entity_type", "student").eq("entity_id", studentId)).data ?? [];

  browser = await openBrowser();
  const page = await signIn(browser, officer.email);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  // Windows keeps clipboard text with CRLF line ends; the message itself has LF.
  const clipboardText = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  // A click before hydration does nothing; wait for React to own the bar's buttons.
  const hydrated = (scope) =>
    page.waitForFunction((s) => {
      const b = document.querySelector(`[data-send-credentials="${s}"] button`);
      return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
    }, scope, { timeout: 30000 });

  // ------------------------------------------- Registration & Portal Access
  console.log("\n--- Registration & Portal Access ---");
  await page.goto(`${BASE}/students/${studentId}?open=registration-portal-access#card-registration-portal-access`, { waitUntil: "domcontentloaded" });
  const portalBar = page.locator('[data-send-credentials="portal"]');
  await portalBar.waitFor({ timeout: 60000 });
  await hydrated("portal");
  await portalBar.getByRole("button", { name: "Copy as message" }).click();
  await portalBar.locator("[data-credentials-copied]").waitFor({ timeout: 60000 });
  let text = await clipboardText();
  ok("Copy as message copies their login for this portal, with where to sign in",
    /\*HMARK Student Portal\*\nSign in at: https?:\/\/[^\n]+\/login\n(?:Student ID: [^\n]+\n)?(?:or email|Email): zztmp-sendcreds-student@hmark-test\.local\nPassword: zztmp-Hmark-7Qx/.test(text), text.slice(0, 300));
  ok("...and nothing else", PASSWORDS.filter((p) => p !== "zztmp-Hmark-7Qx").every((p) => !text.includes(p)) && !/\*Gmail\*/.test(text));
  ok("...noted on the timeline", Boolean(await poll(async () => (await notes()).find((m) => m.body === "Copied the student's login details as a message: HMARK Student Portal."))));

  await portalBar.getByRole("button", { name: "Send to student" }).click();
  const confirmBox = portalBar.locator("[data-confirm-credentials-email]");
  await confirmBox.waitFor({ timeout: 30000 });
  ok("Send to student asks first, naming the address", (await confirmBox.innerText()).includes(STUDENT_EMAIL), (await confirmBox.innerText()).replace(/\s+/g, " "));
  await confirmBox.getByRole("button", { name: "Send email" }).click();
  let outcome = portalBar.locator("[data-credentials-emailed], [role=alert]").first();
  await outcome.waitFor({ timeout: 90000 });
  ok("...then emails only their portal login", /^Emailed HMARK Student Portal to zztmp-sendcreds-student@hmark-test\.local\./.test((await outcome.innerText()).trim()), await outcome.innerText());
  ok("...noted on the timeline",
    Boolean(await poll(async () => (await notes()).find((m) => m.body === `Emailed the student their login details at ${STUDENT_EMAIL}: HMARK Student Portal.`))));

  // ------------------------------------------------------ Portal credentials
  console.log("\n--- Portal credentials ---");
  await page.goto(`${BASE}/students/${studentId}?open=portal-credentials#card-portal-credentials`, { waitUntil: "domcontentloaded" });
  const card = page.locator("#card-portal-credentials");
  const sectionBar = page.locator('[data-send-credentials="section"]');
  await sectionBar.waitFor({ timeout: 60000 });
  await hydrated("section");
  ok("this portal's own login is not in Portal credentials", !(await card.innerText()).includes("HMARK Student Portal"));

  await sectionBar.getByRole("button", { name: "Send to student" }).click();
  const chooser = sectionBar.locator('[data-credentials-chooser="email"]');
  await chooser.waitFor({ timeout: 60000 });
  const offered = await chooser.locator("[data-credential-choice]").evaluateAll((els) =>
    els.map((e) => ({ type: e.getAttribute("data-credential-choice"), checked: e.checked, disabled: e.disabled }))
  );
  ok("it offers the section's logins only — not this portal's, not one kept on an application",
    JSON.stringify(offered.map((o) => o.type).sort()) === JSON.stringify(["gmail", "scholarship_portal:zztmp EDiSU", "university_portal", "visa_appointment_portal"]),
    JSON.stringify(offered));
  ok("...none ticked to begin with", offered.every((o) => !o.checked));
  ok("...and one with nothing saved cannot be ticked", offered.find((o) => o.type === "visa_appointment_portal")?.disabled === true);
  const sendButton = chooser.getByRole("button", { name: /^Send/ });
  ok("nothing can be sent until something is ticked", await sendButton.isDisabled());

  await chooser.locator('[data-credential-choice="gmail"]').check();
  await chooser.getByRole("button", { name: `Send 1 by email to ${STUDENT_EMAIL}` }).click();
  outcome = sectionBar.locator("[data-credentials-emailed], [role=alert]").first();
  await outcome.waitFor({ timeout: 90000 });
  ok("the email carries exactly what was ticked", /^Emailed Gmail to zztmp-sendcreds-student@hmark-test\.local\./.test((await outcome.innerText()).trim()), await outcome.innerText());
  ok("...noted on the timeline as just that",
    Boolean(await poll(async () => (await notes()).find((m) => m.body === `Emailed the student their login details at ${STUDENT_EMAIL}: Gmail.`))));

  await sectionBar.getByRole("button", { name: "Copy as message" }).click();
  const copyChooser = sectionBar.locator('[data-credentials-chooser="copy"]');
  await copyChooser.waitFor({ timeout: 30000 });
  ok("Copy as message opens the same list, the ticks kept", await copyChooser.locator('[data-credential-choice="gmail"]').isChecked());
  await copyChooser.locator('[data-credential-choice="university_portal"]').check();
  await copyChooser.getByRole("button", { name: "Copy 2 as a message" }).click();
  await sectionBar.locator("[data-credentials-copied]").waitFor({ timeout: 60000 });
  text = await clipboardText();
  ok("the message carries exactly what was ticked",
    /\*Gmail\*\nUsername: zztmp\.sendcreds@gmail\.com\nPassword: zztmp-Gmail-4Rk/.test(text) && /\*University portal\*\nUsername: ZZSTUDENT\nPassword: zztmp-Uni-2Pd/.test(text),
    text);
  ok("...and nothing it was not asked for", ["zztmp-Hmark-7Qx", "zztmp-Sch-5Tn", "zztmp-App-9Ws"].every((p) => !text.includes(p)) && !/HMARK Student Portal/.test(text));
  const wa = await sectionBar.locator("[data-credentials-whatsapp]").getAttribute("href").catch(() => null);
  ok("it offers WhatsApp on the student's number with that message typed in",
    Boolean(wa) && wa.startsWith("https://wa.me/923009999983?text=") && decodeURIComponent(wa.split("?text=")[1]) === text, String(wa).slice(0, 80));
  ok("...noted on the timeline",
    Boolean(await poll(async () => (await notes()).find((m) => m.body === "Copied the student's login details as a message: Gmail, University portal."))));

  ok("every note is the office's own, and none holds a password",
    (await notes()).every((m) => m.channel === "internal_note" && m.sent_by === officer.id && PASSWORDS.every((p) => !m.body.includes(p))),
    JSON.stringify((await notes()).map((m) => m.body)));

  // ---------------------------------------------------------------- who
  console.log("\n--- who ---");
  const asStranger = await apiAs(url, anonKey, stranger.email);
  const { data: strangerRead, error: strangerError } = await asStranger.rpc("read_credential", { p_owner_type: "student", p_owner_id: studentId, p_credential_type: "gmail" });
  ok("a counsellor who is not the student's cannot read their logins, so has nothing to send", !strangerRead && Boolean(strangerError), String(strangerError?.message));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    await admin.from("messages").delete().eq("entity_type", "student").eq("entity_id", studentId);
    await admin.from("encrypted_credentials").delete().in("owner_id", [studentId, appId].filter(Boolean));
    await admin.from("applications").delete().eq("student_id", studentId);
  }
  if (universityId) await admin.from("universities").delete().eq("id", universityId);
  const removed = await fx.cleanup();
  // After the lead: leads.auth_user_id references this login until it goes.
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
