// Applications & portal logins (/reports/applications-logins) and its PDF and
// Excel downloads, on the deployed portal. Needs migration 0347.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:appslogins
//
// Read-only on the real students: the only things it makes are three fixture
// staff, removed in a finally. What a login should say is read a second way —
// read_credential, one at a time, as the student's record reads it — and the
// report has to agree with that.
//
//   function     application_logins (0347) returns, for a processing officer,
//                exactly the logins read_credential gives one by one; for a
//                counsellor with no students, nothing
//   processing   finds the card on Reports; every registered student is
//                listed with the number of applications the database holds;
//                a student's list opens to each application, and a saved
//                login's password is hidden until Show, then is the real one
//   filters      "No login saved" lists no login; one student picked alone
//   PDF          the whole report, and a row's PDF named after its student,
//                with a real username and password drawn in it and marked
//                confidential
//   Excel        Summary, Applications (a row per application) and Portal
//                logins (a row per login, the password in full)
//   others       Management and a counsellor are not offered it, are turned
//                back from the page and refused the download; signed out, no file
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { apiAs, BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:appslogins");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const HREF = "/reports/applications-logins";

/** The text drawn on a react-pdf file's pages (WinAnsi hex strings in the inflated content streams). */
function pdfText(buf) {
  const s = buf.toString("latin1");
  const win = { 0x80: "€", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
  let out = "";
  for (const m of s.matchAll(/<<([^>]*?)\/Length (\d+)[^>]*?>>\s*stream\r?\n/g)) {
    if (/Subtype \/Image|Length1/.test(m[1])) continue;
    const start = m.index + m[0].length;
    let txt;
    try {
      txt = inflateSync(buf.subarray(start, start + Number(m[2]))).toString("latin1");
    } catch {
      continue;
    }
    for (const tj of txt.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      for (const h of (tj[1] ?? `<${tj[2]}>`).matchAll(/<([0-9a-fA-F]+)>/g)) {
        for (let i = 0; i < h[1].length; i += 2) {
          const c = parseInt(h[1].slice(i, i + 2), 16);
          out += win[c] ?? String.fromCharCode(c);
        }
      }
      out += " ";
    }
  }
  return out;
}

const parseLogin = (text) => {
  try {
    const p = JSON.parse(text);
    if (p && typeof p === "object") return { username: p.username ?? "", password: p.password ?? "" };
  } catch {}
  return { username: String(text ?? ""), password: "" };
};

let browser = null;
try {
  const proc = await fx.staff("appslgproc", ["processing"]);
  const mgmt = await fx.staff("appslgmgmt", ["management"]);
  const coun = await fx.staff("appslgcoun", ["counselor"]);

  // ---------------------------------------------------------------- what it should say
  const { data: students } = await admin.from("students").select("id, full_name, student_code").eq("registration_status", "registered");
  const ids = students.map((s) => s.id);
  const { data: apps } = await admin.from("applications").select("id, student_id").in("student_id", ids);
  const appsOf = new Map();
  for (const a of apps) appsOf.set(a.student_id, (appsOf.get(a.student_id) ?? 0) + 1);
  const { data: stored } = await admin.from("encrypted_credentials").select("owner_id, credential_type").eq("owner_type", "application").in("owner_id", apps.map((a) => a.id));

  const procDb = await apiAs(url, anonKey, proc.email);
  const expected = [];
  for (const c of stored) {
    const { data } = await procDb.rpc("read_credential", { p_owner_type: "application", p_owner_id: c.owner_id, p_credential_type: c.credential_type });
    const login = parseLogin(data);
    if (login.username.trim() || login.password.trim()) expected.push({ applicationId: c.owner_id, studentId: apps.find((a) => a.id === c.owner_id).student_id, ...login });
  }
  console.log(`      ${students.length} registered students, ${apps.length} applications, ${expected.length} logins saved against them`);

  // ---------------------------------------------------------------- the function
  const { data: bulk, error: bulkError } = await procDb.rpc("application_logins", { p_student_ids: ids });
  ok("function: application_logins exists (0347 applied)", !bulkError, bulkError?.message);
  const bulkKeys = (bulk ?? []).map((r) => `${r.application_id}|${parseLogin(r.plaintext).password}`).sort();
  const oneKeys = expected.map((e) => `${e.applicationId}|${e.password}`).sort();
  ok("function: the same logins read_credential gives one at a time", JSON.stringify(bulkKeys) === JSON.stringify(oneKeys), `${bulkKeys.length} vs ${oneKeys.length}`);
  const counDb = await apiAs(url, anonKey, coun.email);
  const { data: counRows } = await counDb.rpc("application_logins", { p_student_ids: ids });
  ok("function: a counsellor with no students gets nothing", (counRows ?? []).length === 0, `${(counRows ?? []).length} rows`);

  browser = await openBrowser();

  // ---------------------------------------------------------------- processing
  const page = await signIn(browser, proc.email);
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  ok("processing: the card is on Reports", (await page.locator(`a[href="${HREF}"]`).count()) > 0);
  await page.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-applications-report]").waitFor({ timeout: 40000 });
  ok("processing: no warning that the logins could not be read", (await page.locator("[data-logins-error]").count()) === 0);
  ok("processing: every registered student is listed", (await page.locator("tr[data-student-row]").count()) === students.length, `${await page.locator("tr[data-student-row]").count()}`);

  let counted = 0;
  for (const s of students.slice(0, 12)) {
    const text = (await page.locator(`tr[data-student-row="${s.id}"]`).innerText()).replace(/\s+/g, " ");
    const want = appsOf.get(s.id) ?? 0;
    // The count and "show" are separate spans, spaced by a margin: innerText runs them together.
    const shownCount = text.match(/(\d+)\s*show\b/)?.[1];
    if (want === 0 ? text.includes("No application yet") : shownCount === String(want)) counted++;
    else console.log(`      ${s.full_name}: "${text.slice(0, 140)}", expected ${want}`);
  }
  ok("processing: each student's number of applications is the database's", counted === Math.min(12, students.length), `${counted} matched`);

  const sample = expected[0];
  if (sample) {
    const row = page.locator(`tr[data-student-row="${sample.studentId}"]`);
    await row.locator("summary").first().click();
    const item = row.locator(`[data-application="${sample.applicationId}"]`);
    ok("processing: the application lists its login's username", (await item.locator("[data-login-username]").first().innerText()).trim() === sample.username);
    const pw = item.locator("[data-login-password]").first();
    ok("processing: the password is hidden until asked for", (await pw.getAttribute("data-login-password")) === "hidden" && !(await pw.innerText()).includes(sample.password));
    await item.getByRole("button", { name: "Show the password" }).first().click();
    ok("processing: Show gives the real password", (await pw.innerText()).trim() === sample.password);
  } else {
    console.log("      (no login is saved against any application: the login checks below are skipped)");
  }

  // "No login saved": no login on the page at all.
  await page.goto(`${BASE}${HREF}?login=missing`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-applications-report]").waitFor({ timeout: 40000 });
  for (const s of await page.locator("tr[data-student-row] summary").all()) await s.click();
  ok("filter: 'No login saved' shows no login", (await page.locator("[data-login]").count()) === 0 && (await page.locator("[data-no-login]").count()) > 0);

  // ---------------------------------------------------------------- downloads
  await page.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
  await page.locator("table[data-applications-report]").waitFor({ timeout: 40000 });
  const click = async (locator) => {
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), locator.click()]);
    return { name: file.suggestedFilename(), body: readFileSync(await file.path()) };
  };
  const pdf = await click(page.locator('button[data-download="pdf"]'));
  const drawn = pdfText(pdf.body);
  ok("PDF: downloads, named for the day", /^HMC-Applications-Logins-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name) && pdf.body.subarray(0, 5).toString() === "%PDF-", pdf.name);
  ok("PDF: marked confidential, with page numbers", drawn.includes("CONFIDENTIAL") && /Page 1 of \d+/.test(drawn));
  if (sample) ok("PDF: a real username and password are in it", drawn.includes(sample.username) && drawn.includes(sample.password));

  const xlsx = await click(page.locator('button[data-download="xlsx"]'));
  ok("Excel: downloads, named for the day", /^HMC-Applications-Logins-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsx.name) && xlsx.body.subarray(0, 2).toString() === "PK", xlsx.name);
  let ExcelJS = null;
  try {
    ExcelJS = (await import("exceljs")).default;
  } catch {
    console.log("      (exceljs not installed: the sheets are not read back — npm install --no-save playwright pg exceljs)");
  }
  if (ExcelJS) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    ok("Excel: Summary, Applications and Portal logins", wb.worksheets.map((w) => w.name).join("|") === "Summary|Applications|Portal logins");
    ok("Excel: a row per application", wb.getWorksheet("Applications").actualRowCount === apps.length + 2, `${wb.getWorksheet("Applications").actualRowCount} rows, ${apps.length} applications`);
    ok("Excel: a row per login", wb.getWorksheet("Portal logins").actualRowCount === (expected.length || 1) + 2, `${wb.getWorksheet("Portal logins").actualRowCount} rows, ${expected.length} logins`);
    if (sample) {
      const values = [];
      wb.getWorksheet("Portal logins").eachRow((r) => values.push(...r.values.map(String)));
      ok("Excel: the password in full", values.includes(sample.password));
    }
    ok("Excel: every sheet says it holds passwords", wb.worksheets.every((w) => [1, 2, 3].some((n) => String(w.getRow(n).getCell(1).value ?? "").startsWith("CONFIDENTIAL"))));
  }

  // One student: picked, and their row's own PDF.
  const one = sample ? students.find((s) => s.id === sample.studentId) : students.find((s) => appsOf.get(s.id));
  if (one) {
    await page.goto(`${BASE}${HREF}?students=${one.id}`, { waitUntil: "domcontentloaded" });
    await page.locator("table[data-applications-report]").waitFor({ timeout: 40000 });
    ok("pick: one student chosen, one shown", (await page.locator("tr[data-student-row]").count()) === 1);
    const rowPdf = await click(page.locator(`tr[data-student-row="${one.id}"] button[data-download="pdf-one"]`));
    const text = pdfText(rowPdf.body);
    ok("row PDF: named after the student", one.student_code ? rowPdf.name.includes(one.student_code) : rowPdf.name.startsWith("HMC-Applications-Logins-"), rowPdf.name);
    ok("row PDF: their applications, headed with their name", text.includes(`Student: ${one.full_name}`));
    if (sample) ok("row PDF: their login in full", text.includes(sample.password));
  }
  await page.close();

  // ---------------------------------------------------------------- not for them
  for (const who of [mgmt, coun]) {
    const p = await signIn(browser, who.email);
    await p.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
    ok(`${who.name}: not offered on Reports`, (await p.locator(`a[href="${HREF}"]`).count()) === 0);
    await p.goto(`${BASE}${HREF}`, { waitUntil: "domcontentloaded" });
    ok(`${who.name}: the page does not show it`, (await p.locator("table[data-applications-report]").count()) === 0, p.url());
    const refused = await p.request.get(`${BASE}${HREF}/download?format=xlsx`);
    ok(`${who.name}: the download is refused`, refused.status() === 403, `${refused.status()}`);
    await p.close();
  }
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}${HREF}/download?format=pdf`, { maxRedirects: 0 });
  ok("signed out: no file", anonRes.status() !== 200 || !/pdf/.test(anonRes.headers()["content-type"] ?? ""), `${anonRes.status()}`);
  await anon.close();
} catch (e) {
  ok("the check ran to the end", false, e?.stack ?? String(e));
} finally {
  await browser?.close();
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) ? 1 : 0;
}
