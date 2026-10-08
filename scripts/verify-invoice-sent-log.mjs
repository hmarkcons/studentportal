// An invoice's "Sent log" (0325), end to end against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:invoicelog
//
//   * finance emails an invoice from the student's page, then a receipt: each
//     is logged (invoice_email_log) with the address, the kind, the sender
//     and the time;
//   * "Sent log" on the invoice lists both, newest first, with the date and
//     time, the address and who sent it — and the same log opens from the
//     Invoice Generator;
//   * an invoice emailed before every email was logged says when it was last
//     sent and that the address was not recorded;
//   * a counsellor is not offered the log, and cannot read it.
//
// The student's address is a reserved test one, which is never emailed.
// Everything is named zztmp and removed in a finally.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:invoicelog");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const STUDENT = `zztmp Sentlog Student ${RUN}`;
const EMAIL = `zztmp-sentlog-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
};

/** Clicks a button once the page has wired it up. */
async function press(page, locator) {
  await locator.waitFor({ timeout: 60000 });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await locator.elementHandle(), { timeout: 60000 });
  await locator.click();
}

/** Opens an invoice's Sent log and reads its rows. */
async function readLog(page, invoiceId) {
  await press(page, page.locator(`[data-invoice-sent-log-open="${invoiceId}"]`).first());
  const dialog = page.locator(`[data-invoice-sent-log="${invoiceId}"]`);
  await dialog.waitFor({ timeout: 30000 });
  await page.waitForFunction((id) => !document.querySelector(`[data-invoice-sent-log="${id}"]`)?.textContent?.includes("Loading"), invoiceId, { timeout: 30000 });
  const rows = await dialog.locator("[data-invoice-sent-log-row]").evaluateAll((trs) =>
    trs.map((tr) => ({ cells: [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()), status: tr.getAttribute("data-status") }))
  );
  const legacy = await dialog.locator("[data-invoice-sent-log-legacy]").count();
  return { rows, legacy, close: () => page.keyboard.press("Escape") };
}

let browser = null;
let studentId = null;

try {
  const fin = await fx.staff(`sentlogfin${RUN}`, ["finance"]);
  const cou = await fx.staff(`sentlogcou${RUN}`, ["counselor"]);
  studentId = await fx.lead({
    full_name: STUDENT, email: EMAIL, contact_number: "0300-9999981",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), assigned_counselor_id: cou.id,
  });
  const { data: invoice, error: invError } = await admin
    .from("invoices").insert({ student_id: studentId, consultancy_fee: 5000, admin_charge: 0, currency: "PKR", invoice_number: `ZZTMP-${RUN}-1` }).select("id").single();
  if (invError) throw new Error(`invoice: ${invError.message}`);
  await admin.from("invoice_installments").insert({ invoice_id: invoice.id, installment_no: 1, amount: 5000, due_date: new Date().toISOString().slice(0, 10), status: "unpaid" });
  // One sent before the log was kept: only its last time, on the invoice.
  const earlier = "2026-09-01T09:30:00Z";
  const { data: older } = await admin
    .from("invoices").insert({ student_id: studentId, consultancy_fee: 1000, admin_charge: 0, currency: "PKR", invoice_number: `ZZTMP-${RUN}-0`, sent_status: "sent", sent_at: earlier }).select("id").single();

  browser = await openBrowser();
  const page = await signIn(browser, fin.email);
  await page.goto(`${BASE}/students/${studentId}?open=invoice`, { waitUntil: "domcontentloaded" });

  const card = page.locator(`[data-invoice-card="${invoice.id}"]`);
  await press(page, card.getByRole("button", { name: "Email invoice" }));
  const sentInvoice = await poll(async () => (await card.innerText()).includes(`Sent to ${EMAIL}`), 60);
  ok("finance emails the invoice", sentInvoice);
  await press(page, card.getByRole("button", { name: "Send receipt" }));
  const sentReceipt = await poll(async () => (await card.innerText()).split(`Sent to ${EMAIL}`).length > 2, 60);
  ok("and then a receipt", sentReceipt);

  const { data: logged } = await admin.from("invoice_email_log").select("kind, sent_to, status, sent_by, created_at").eq("invoice_id", invoice.id).order("created_at");
  ok("each email is logged: the address, the kind, the sender", logged?.length === 2 && logged.every((r) => r.sent_to === EMAIL && r.status === "sent" && r.sent_by === fin.id) && logged[0].kind === "invoice" && logged[1].kind === "receipt", JSON.stringify(logged));
  ok("...with the time it went", logged?.every((r) => Math.abs(Date.parse(r.created_at) - Date.now()) < 10 * 60_000));

  const log = await readLog(page, invoice.id);
  ok("Sent log lists both, newest first", log.rows.length === 2 && log.rows[0].cells[2].startsWith("Receipt") && log.rows[1].cells[2].startsWith("Invoice"), JSON.stringify(log.rows));
  const today = new Date(Date.now() + 5 * 3_600_000).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  ok("...with the date and time", log.rows.every((r) => r.cells[0].startsWith(today) && /\d:\d\d [AP]M/.test(r.cells[0])), JSON.stringify(log.rows.map((r) => r.cells[0])));
  ok("...the address it went to", log.rows.every((r) => r.cells[1] === EMAIL));
  ok("...and who sent it", log.rows.every((r) => r.cells[3] === fin.name));
  await shot(page, "sent-log");
  await log.close();

  const old = await readLog(page, older.id);
  ok("an invoice sent before the log was kept says when it was last sent, and that the address was not recorded", old.rows.length === 0 && old.legacy === 1);
  await old.close();

  await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  const fromGenerator = await readLog(page, invoice.id).catch(() => null);
  ok("the same log opens from the Invoice Generator", fromGenerator?.rows.length === 2);

  // A counsellor: not offered, and not readable.
  const couPage = await signIn(browser, cou.email);
  await couPage.goto(`${BASE}/students/${studentId}?open=invoice`, { waitUntil: "domcontentloaded" });
  await couPage.waitForLoadState("networkidle").catch(() => {});
  ok("a counsellor is not offered the log", (await couPage.locator(`[data-invoice-sent-log-open="${invoice.id}"]`).count()) === 0);
  const api = await apiAs(url, anonKey, cou.email);
  const { data: theirs } = await api.from("invoice_email_log").select("id").eq("invoice_id", invoice.id);
  ok("...and cannot read it", (theirs ?? []).length === 0);
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // The PDFs the sends built, which deleting the student by the service role leaves behind.
  if (studentId) {
    const { data: pdfs } = await admin.from("invoices").select("pdf_path").eq("student_id", studentId);
    const paths = (pdfs ?? []).map((p) => p.pdf_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
