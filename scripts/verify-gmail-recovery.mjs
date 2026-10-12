// A student's Gmail recovery details (0332), end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:gmailrecovery
//
//   * the student's processing officer, under the Gmail login in Portal
//     credentials, saves a recovery email, a recovery mobile and Google's
//     backup codes file; a wrong address or the wrong file is refused, and
//     what was typed stays to be corrected;
//   * Reveal shows all three, and the codes download as the file they came in;
//   * Management, who can see the student, is told what is on file and shown
//     none of it — on the page or through the API — and a counsellor, a
//     colleague in processing and anyone signed out get nothing either;
//   * a Super Admin sees them and removes the codes, leaving the rest;
//   * when the student moves to another officer, the details go with the
//     student: the new officer opens them and the old one no longer can.
//
// Everything is named zztmp and removed in a finally; the details go with the student.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:gmailrecovery");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);

// Ten codes no other run has, laid out as Google lays them out.
const codes = Array.from({ length: 10 }, () => String(10000000 + Math.floor(Math.random() * 89999999)).replace(/^(\d{4})(\d{4})$/, "$1 $2"));
const CODES_FILE =
  "SAVE YOUR BACKUP CODES\r\nKeep these backup codes somewhere safe but accessible.\r\n\r\n" +
  codes.map((c, i) => `${i + 1}. ${c}`).join("\r\n") +
  `\r\n\r\n(zztmp.${RUN}@gmail.com)\r\n\r\n* You can only use each backup code once.\r\n`;
const FILE_NAME = `Backup-codes-zztmp${RUN}.txt`;
const RECOVERY_EMAIL = `zztmp-recovery-${RUN}@example.invalid`;
const RECOVERY_PHONE = "+92 300 1234567";

const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  return { data, error: error?.message ?? null };
};

let browser = null;

/** Waits for the block to settle on text matching `pattern`; returns its text. */
async function blockSays(page, pattern) {
  const block = page.locator("[data-gmail-recovery]");
  let text = "";
  for (let i = 0; i < 40; i++) {
    text = (await block.innerText().catch(() => "")) ?? "";
    if (pattern.test(text)) return text;
    await page.waitForTimeout(500);
  }
  return text;
}

async function openCredentials(page, studentId) {
  await page.goto(`${BASE}/students/${studentId}?open=portal-credentials`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-gmail-recovery]").waitFor({ timeout: 60000 });
}

try {
  const sup = await fx.staff(`gmailsup${RUN}`, ["super_admin"]);
  const officer = await fx.staff(`gmailoff${RUN}`, ["processing"]);
  const nextOfficer = await fx.staff(`gmailnext${RUN}`, ["processing"]);
  const mgmt = await fx.staff(`gmailmgmt${RUN}`, ["management"]);
  const counsellor = await fx.staff(`gmailcoun${RUN}`, ["counselor"]);

  // No intake, so no real Student ID is taken.
  const studentId = await fx.lead({
    full_name: `zztmp Gmail ${RUN}`,
    email: `zztmp-gmail-${RUN}@example.invalid`,
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    level_applying_for: "bachelors",
    assigned_counselor_id: counsellor.id,
    processing_officer_id: officer.id,
  });
  const P = { p_student: studentId };

  const asOfficer = await apiAs(url, anonKey, officer.email);
  const asMgmt = await apiAs(url, anonKey, mgmt.email);
  const asCounsellor = await apiAs(url, anonKey, counsellor.email);
  const asNext = await apiAs(url, anonKey, nextOfficer.email);
  const asSup = await apiAs(url, anonKey, sup.email);

  const before = await rpc(asOfficer, "gmail_recovery_status", P);
  ok(
    "the officer may open them, and nothing is on file yet",
    before.data?.[0]?.can_open === true && before.data[0].has_codes === false,
    JSON.stringify(before),
  );

  // ------------------------------------------------------------ the officer saves them
  browser = await openBrowser();
  const context = await browser.newContext({ viewport: { width: 1500, height: 1200 }, acceptDownloads: true });
  const page = await signIn(browser, officer.email, { context });
  await openCredentials(page, studentId);
  const block = page.locator('[data-gmail-recovery="open"]');
  ok("the officer has the form under the Gmail login", (await block.count()) === 1 && (await block.locator('input[name="backup_codes"]').count()) === 1);

  await block.locator('input[name="recovery_email"]').fill("not an address");
  await block.locator('input[name="recovery_phone"]').fill(RECOVERY_PHONE);
  await block.getByRole("button", { name: "Save", exact: true }).click();
  const refused = await blockSays(page, /one address/);
  ok("a wrong address is refused", /one address/.test(refused), refused);
  ok("and what was typed stays", (await block.locator('input[name="recovery_email"]').inputValue()) === "not an address");

  await block.locator('input[name="recovery_email"]').fill(RECOVERY_EMAIL);
  await block.locator('input[name="backup_codes"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Dear student, welcome.") });
  await block.getByRole("button", { name: "Save", exact: true }).click();
  const wrongFile = await blockSays(page, /No backup codes/);
  ok("a text file with no codes in it is refused", /No backup codes/.test(wrongFile), wrongFile);
  const nothingYet = await rpc(asOfficer, "gmail_recovery_status", P);
  ok("and nothing was saved", nothingYet.data?.[0]?.has_email === false, JSON.stringify(nothingYet));

  await block.locator('input[name="backup_codes"]').setInputFiles({ name: FILE_NAME, mimeType: "text/plain", buffer: Buffer.from(CODES_FILE) });
  await block.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await blockSays(page, /Saved\./);
  ok("the officer saves all three", /On file:[\s\S]*Recovery email[\s\S]*Recovery mobile[\s\S]*Backup codes/.test(saved), saved);
  ok("the form empties once saved", (await block.locator('input[name="recovery_email"]').inputValue()) === "");

  const stored = await rpc(asOfficer, "read_gmail_recovery", P);
  ok(
    "they are stored as given",
    stored.data?.email === RECOVERY_EMAIL &&
      stored.data?.phone === RECOVERY_PHONE &&
      stored.data?.codes?.includes(codes[9]) &&
      stored.data?.codes_file_name === FILE_NAME,
    JSON.stringify(stored).slice(0, 300),
  );
  const { data: raw } = await admin
    .from("student_gmail_recovery")
    .select("encrypted_value, has_email, has_phone, has_codes")
    .eq("student_id", studentId)
    .single();
  // PostgREST gives a bytea as \x and hex.
  const rawBytes = Buffer.from(String(raw?.encrypted_value ?? "").replace(/^\\x/, ""), "hex").toString("latin1");
  ok("encrypted at rest", rawBytes.length > 100 && !codes.some((c) => rawBytes.includes(c)) && !rawBytes.includes(RECOVERY_EMAIL), rawBytes.slice(0, 40));
  const { count: audited } = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("entity_type", "student_gmail_recovery");
  ok("and kept out of the audit log", audited === 0, String(audited));

  await block.getByRole("button", { name: "Reveal" }).click();
  const shown = await blockSays(page, new RegExp(codes[3]));
  ok(
    "Reveal shows the email, the mobile and every code",
    shown.includes(RECOVERY_EMAIL) && shown.includes(RECOVERY_PHONE) && codes.every((c) => shown.includes(c)),
    shown.slice(0, 400),
  );
  ok("and says how many codes the file held", /Backup codes — 10 in/.test(shown), shown.slice(0, 400));

  const [download] = await Promise.all([page.waitForEvent("download"), block.getByRole("button", { name: /Download/ }).click()]);
  const downloaded = readFileSync(await download.path(), "utf8");
  ok(
    "the codes download as the file they came in",
    download.suggestedFilename() === FILE_NAME && codes.every((c) => downloaded.includes(c)),
    download.suggestedFilename(),
  );
  await page.close();

  // ------------------------------------------------------------ everyone else
  const mgmtPage = await signIn(browser, mgmt.email);
  await openCredentials(mgmtPage, studentId);
  const locked = await mgmtPage.locator("[data-gmail-recovery]").innerText();
  ok("Management is told what is on file", /Recovery email, recovery mobile and backup codes on file/.test(locked), locked);
  ok("and has no form", (await mgmtPage.locator("[data-gmail-recovery] input, [data-gmail-recovery] button").count()) === 0);
  const mgmtHtml = await mgmtPage.content();
  ok(
    "nothing of them is on Management's page",
    !codes.some((c) => mgmtHtml.includes(c)) && !mgmtHtml.includes(RECOVERY_EMAIL) && !mgmtHtml.includes(FILE_NAME),
  );
  await mgmtPage.close();

  const mgmtRead = await rpc(asMgmt, "read_gmail_recovery", P);
  ok("Management cannot read them through the API", mgmtRead.data === null && /Only a Super Admin/.test(mgmtRead.error ?? ""), JSON.stringify(mgmtRead));
  const mgmtWrite = await rpc(asMgmt, "store_gmail_recovery", { ...P, p_email: "x@example.invalid", p_phone: null, p_codes: null, p_codes_file_name: null });
  ok("nor change them", /Only a Super Admin/.test(mgmtWrite.error ?? ""), JSON.stringify(mgmtWrite));
  const mgmtTable = await asMgmt.from("student_gmail_recovery").select("student_id");
  ok("nor read the table", mgmtTable.error !== null, JSON.stringify(mgmtTable));
  const counsellorRead = await rpc(asCounsellor, "read_gmail_recovery", P);
  ok("the student's counsellor cannot read them", /Only a Super Admin/.test(counsellorRead.error ?? ""), JSON.stringify(counsellorRead));
  const colleagueRead = await rpc(asNext, "read_gmail_recovery", P);
  ok("nor can a colleague in processing", /Only a Super Admin/.test(colleagueRead.error ?? ""), JSON.stringify(colleagueRead));
  const anonRead = await rpc(createClient(url, anonKey), "read_gmail_recovery", P);
  ok("nor anyone signed out", anonRead.data === null && anonRead.error !== null, JSON.stringify(anonRead));

  // ------------------------------------------------------------ a Super Admin
  const supPage = await signIn(browser, sup.email);
  await openCredentials(supPage, studentId);
  const supBlock = supPage.locator('[data-gmail-recovery="open"]');
  await supBlock.getByRole("button", { name: "Reveal" }).click();
  const supShown = await blockSays(supPage, new RegExp(codes[0]));
  ok("a Super Admin sees them", supShown.includes(RECOVERY_EMAIL) && supShown.includes(codes[0]), supShown.slice(0, 300));
  ok("with who saved them", supShown.includes(`by ${officer.name}`), supShown.slice(0, 300));
  supPage.once("dialog", (d) => d.accept());
  await supBlock.getByRole("button", { name: "Remove backup codes" }).click();
  const afterRemove = await blockSays(supPage, /No backup codes saved/);
  ok(
    "and removes the codes, leaving the rest",
    /No backup codes saved/.test(afterRemove) && afterRemove.includes(RECOVERY_EMAIL) && !/Remove backup codes/.test(await supBlock.innerHTML()),
    afterRemove.slice(0, 300),
  );
  const afterRead = await rpc(asSup, "read_gmail_recovery", P);
  ok(
    "as stored",
    afterRead.data?.codes === null && afterRead.data?.codes_file_name === null && afterRead.data?.email === RECOVERY_EMAIL,
    JSON.stringify(afterRead),
  );
  await supPage.close();

  // ------------------------------------------------------------ another officer
  await admin.from("leads").update({ processing_officer_id: nextOfficer.id }).eq("id", studentId);
  const nextRead = await rpc(asNext, "read_gmail_recovery", P);
  ok("the student's new officer opens them", nextRead.data?.email === RECOVERY_EMAIL, JSON.stringify(nextRead));
  const oldRead = await rpc(asOfficer, "read_gmail_recovery", P);
  ok("and the old one no longer can", /Only a Super Admin/.test(oldRead.error ?? ""), JSON.stringify(oldRead));
  const oldStatus = await rpc(asOfficer, "gmail_recovery_status", P);
  ok("which the old one's page is told", oldStatus.data?.[0]?.can_open === false, JSON.stringify(oldStatus));
} catch (e) {
  ok("the run finished", false, e.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) ? 1 : 0;
}
