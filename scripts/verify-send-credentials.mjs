// Sending a student their logins: by email, or copied as a WhatsApp message,
// from Portal credentials on their page — end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:sendcredentials
//
// As a processing officer — whoever sees the section and may press Reveal may
// send (a counsellor gets the stages-only view of a student, without it):
//
//   copy    "Copy as message" puts one message on the clipboard carrying every
//           login on file: this portal's own first, with its sign-in link,
//           then Gmail, the university portal and one kept against an
//           application, each with its password; one with nothing saved is
//           left out. It offers WhatsApp on the student's number with the
//           message typed in. A note goes on the timeline — never a password.
//   email   "Email to student" first says what is going and where, then sends
//           it to the address on the student's record, says so, and notes it.
//   who     a counsellor who is not the student's cannot read the logins at
//           all, so has nothing to send.
//
// Everything is named zztmp and removed in a finally.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

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

try {
  const counsellor = await fx.staff("sendcreds", ["processing"]);
  const stranger = await fx.staff("sendcredsother", ["counselor"]);
  studentId = await fx.lead({
    full_name: "zztmp SendCreds Student", email: STUDENT_EMAIL, contact_number: "0300-9999983",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: karachiToday(), country_of_interest: "Italy (Public)", intake: "Fall 2099", level_applying_for: "masters",
    assigned_counselor_id: counsellor.id,
  });
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp SendCreds University", city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: app, error: appError } = await admin.from("applications").insert({ student_id: studentId, university_id: uni.id, intake: "Fall 2099" }).select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  appId = app.id;

  // Saved as the officer, the way the section saves them.
  const asCounsellor = await apiAs(url, anonKey, counsellor.email);
  const store = async (ownerType, ownerId, type, username, password) => {
    const { error } = await asCounsellor.rpc("store_credential", {
      p_owner_type: ownerType, p_owner_id: ownerId, p_credential_type: type, p_plaintext: JSON.stringify({ username, password }),
    });
    if (error) throw new Error(`store ${type}: ${error.message}`);
  };
  await store("student", studentId, "portal_login", STUDENT_EMAIL, "zztmp-Hmark-7Qx");
  await store("student", studentId, "gmail", "zztmp.sendcreds@gmail.com", "zztmp-Gmail-4Rk");
  await store("student", studentId, "visa_appointment_portal", "", "");
  await store("application", appId, "university_portal", "ZZ2026", "zztmp-Uni-9Ws");
  const PASSWORDS = ["zztmp-Hmark-7Qx", "zztmp-Gmail-4Rk", "zztmp-Uni-9Ws"];

  browser = await openBrowser();
  const page = await signIn(browser, counsellor.email);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.goto(`${BASE}/students/${studentId}?open=portal-credentials#card-portal-credentials`, { waitUntil: "domcontentloaded" });
  const bar = page.locator("[data-send-credentials]");
  await bar.waitFor({ timeout: 60000 });
  // A click before hydration does nothing; wait for React to own the button.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("[data-send-credentials] button")].find((x) => /Copy as message/.test(x.textContent ?? ""));
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 30000 });
  ok("the section offers both, and says where the email goes", (await bar.innerText()).includes(STUDENT_EMAIL), (await bar.innerText()).replace(/\s+/g, " "));

  // ---------------------------------------------------------------- copy
  console.log("\n--- copy as message ---");
  await bar.getByRole("button", { name: "Copy as message" }).click();
  const copied = page.locator("[data-credentials-copied]");
  await copied.waitFor({ timeout: 60000 });
  ok("it says it copied them", (await copied.getAttribute("data-credentials-copied")) === "clipboard", await copied.innerText());
  // Windows keeps clipboard text with CRLF line ends; the message itself has LF.
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  ok("the message carries this portal's login first, with where to sign in",
    /^Dear zztmp,/.test(text) && /\*HMARK Student Portal\*\nSign in at: https?:\/\/[^\n]+\/login\n(?:Student ID: [^\n]+\n)?(?:or email|Email): zztmp-sendcreds-student@hmark-test\.local\nPassword: zztmp-Hmark-7Qx/.test(text),
    text.slice(0, 300));
  ok("...then Gmail, and the university portal kept against the application, by its university",
    /\*Gmail\*\nUsername: zztmp\.sendcreds@gmail\.com\nPassword: zztmp-Gmail-4Rk/.test(text) &&
      /\*University portal — zztmp SendCreds University\*\nUsername: ZZ2026\nPassword: zztmp-Uni-9Ws/.test(text) &&
      text.indexOf("HMARK Student Portal") < text.indexOf("*Gmail*"),
    text);
  ok("...and leaves out a login with nothing saved", !/Visa appointment portal/.test(text));
  const wa = await copied.locator("[data-credentials-whatsapp]").getAttribute("href").catch(() => null);
  ok("it offers WhatsApp on the student's number with the message typed in",
    Boolean(wa) && wa.startsWith("https://wa.me/923009999983?text=") && decodeURIComponent(wa.split("?text=")[1]) === text, String(wa).slice(0, 80));

  const notes = async () =>
    (await admin.from("messages").select("body, channel, sent_by").eq("entity_type", "student").eq("entity_id", studentId)).data ?? [];
  const copyNote = await poll(async () => (await notes()).find((m) => /^Copied the student's login details as a message: HMARK Student Portal, Gmail, University portal — zztmp SendCreds University\.$/.test(m.body)));
  ok("a note on the timeline says it was copied, by whom, and what — for the office only",
    copyNote?.channel === "internal_note" && copyNote?.sent_by === counsellor.id, JSON.stringify(copyNote));

  // ---------------------------------------------------------------- email
  console.log("\n--- email to student ---");
  await bar.getByRole("button", { name: "Email to student" }).click();
  const confirmBox = page.locator("[data-confirm-credentials-email]");
  await confirmBox.waitFor({ timeout: 60000 });
  const confirmText = (await confirmBox.innerText()).replace(/\s+/g, " ");
  ok("it asks first, naming what is going and to which address",
    confirmText.includes(STUDENT_EMAIL) && /these 3 logins/.test(confirmText) && /HMARK Student Portal/.test(confirmText), confirmText);
  ok("...and nothing has been sent yet", !(await notes()).some((m) => /^Emailed/.test(m.body)));
  await confirmBox.getByRole("button", { name: "Send email" }).click();
  const outcome = page.locator("[data-credentials-emailed], [data-send-credentials] [role=alert]").first();
  await outcome.waitFor({ timeout: 90000 });
  const said = (await outcome.innerText()).replace(/\s+/g, " ");
  ok("it emails the address on the student's record, and says so", /^Emailed to zztmp-sendcreds-student@hmark-test\.local\./.test(said), said);
  const emailNote = await poll(async () => (await notes()).find((m) => m.body.startsWith(`Emailed the student their login details at ${STUDENT_EMAIL}:`)));
  ok("...and notes it on the timeline", emailNote?.channel === "internal_note", JSON.stringify(emailNote));
  ok("no note anywhere holds a password", (await notes()).every((m) => PASSWORDS.every((p) => !m.body.includes(p))));

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
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
