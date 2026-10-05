// Rupees per euro, given for each invoice and each payment (0318), end to end
// against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:pkrrates
//
// A Finance fixture raises a euro invoice on the Invoice generator at a rate of
// its own, offered the latest one; records a payment at another rate, offered
// the invoice's; and regenerates the PDF, which is read back: the total at the
// invoice's rate, the payment at its own, what is still due at the latest, and
// a note naming them. The database refuses to change either rate once given;
// undoing the payment clears its rate; both are in the log, and Setup lists
// them.
//
// The rates used are a quarter and a half rupee above the one on file, so
// anybody invoicing while this runs is offered something sensible; the rate on
// file and the log are put back as they were in a finally, with the fixtures.
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:pkrrates");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const started = new Date().toISOString();

async function poll(fn, seconds = 30) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** The words of a react-pdf document: standard fonts, so WinAnsi hex in TJ arrays. */
function pdfText(buf) {
  const bytes = Buffer.from(buf);
  const text = bytes.toString("latin1");
  let content = "";
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const len = Number((/\/Length (\d+)/.exec(m[1]) || [])[1]);
    if (/\/Subtype \/Image|\/Length1/.test(m[1])) continue;
    const raw = bytes.subarray(m.index + m[0].length, m.index + m[0].length + len);
    try { content += (/FlateDecode/.test(m[1]) ? inflateSync(raw) : raw).toString("latin1") + "\n"; } catch { /* not text */ }
  }
  const runs = [];
  for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
    const hexes = tj[1] !== undefined ? [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]) : [tj[2]];
    runs.push(hexes.map((h) => Buffer.from(h, "hex").toString("latin1")).join(""));
  }
  // WinAnsi's euro sign is 0x80.
  return runs.join(" ").replace(/\x80/g, "€").replace(/\s+/g, " ");
}
const pkr = (n) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

const { data: settingsBefore } = await admin.from("invoice_settings").select("pkr_per_eur").eq("id", true).single();
const before = Number(settingsBefore.pkr_per_eur);
const INVOICE_RATE = Math.round((before + 0.25) * 100) / 100;
const PAYMENT_RATE = Math.round((before + 0.5) * 100) / 100;
const INVOICE_NUMBER = `ZZTMP-PKR-${Date.now()}`;

let browser = null;
let studentId = null;
let invoiceId = null;
const staffIds = [];

try {
  const fin = await fx.staff("pkrfin", ["finance"]);
  staffIds.push(fin.id);
  studentId = await fx.lead({
    full_name: "zztmp Rate Student",
    // The Invoice generator bills by the country of interest: a public Italian university, in euro.
    country_of_interest: "Italy (Public)",
    contact_number: "0300-9999921",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
  });
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { error: destError } = await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  if (destError) throw new Error(`destination: ${destError.message}`);

  browser = await openBrowser();
  const page = await signIn(browser, fin.email);
  await page.setViewportSize({ width: 1400, height: 900 });

  // ---------------------------------------------------------- the invoice
  console.log("\n--- an invoice ---");
  await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  const picker = page.locator("label", { hasText: "Registered student" }).locator("select");
  await picker.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const s = document.querySelector("select");
    return Boolean(s && Object.keys(s).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  await picker.selectOption(studentId);
  const rateInput = page.locator('[data-pkr-rate-field] input[name="pkr_per_eur"]');
  await rateInput.waitFor({ timeout: 30000 });
  ok("a euro invoice asks for the rate, offered the latest one", Number(await rateInput.inputValue()) === before, `${await rateInput.inputValue()} (latest ${before})`);

  const form = page.locator("form", { has: rateInput });
  await form.locator('input[name="consultancy_fee"]').fill("1000");
  for (const admin_ of await form.locator('input[name^="admin_charge"]').all()) await admin_.fill("100");
  await form.locator('input[name="installment_count"]').fill("2");
  await form.locator('input[name="first_due_date"]').fill(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  await form.locator('input[name="invoice_number"]').fill(INVOICE_NUMBER);
  await rateInput.fill(String(INVOICE_RATE));
  await form.getByRole("button", { name: "Generate invoice" }).click();

  const invoice = await poll(async () => {
    const { data } = await admin.from("invoices").select("id, pkr_per_eur, currency").eq("invoice_number", INVOICE_NUMBER).maybeSingle();
    return data;
  }, 60);
  invoiceId = invoice?.id ?? null;
  ok("the invoice is issued at the rate given", invoice?.currency === "EUR" && Number(invoice?.pkr_per_eur) === INVOICE_RATE, JSON.stringify(invoice));
  const { data: invoiceLog } = await admin.from("pkr_rates").select("rate, used_for, set_by").eq("invoice_id", invoiceId).eq("used_for", "invoice");
  ok("...logged, with who gave it", invoiceLog?.length === 1 && Number(invoiceLog[0].rate) === INVOICE_RATE && invoiceLog[0].set_by === fin.id, JSON.stringify(invoiceLog));

  // ---------------------------------------------------------- a payment
  console.log("\n--- a payment ---");
  await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-invoice-row="${invoiceId}"]`);
  await row.waitFor({ timeout: 120000 });
  await page.waitForFunction((id) => {
    const b = document.querySelector(`[data-invoice-row="${id}"] button`);
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, invoiceId, { timeout: 60000 });
  await row.getByRole("button", { name: "View" }).click();
  const payForm = row.locator("form", { has: page.locator('input[name="pkr_per_eur"]') }).first();
  await payForm.waitFor({ timeout: 30000 });
  const payRate = payForm.locator('input[name="pkr_per_eur"]');
  ok("recording a payment asks for its rate, offered the latest one given", Number(await payRate.inputValue()) === INVOICE_RATE, await payRate.inputValue());
  await payRate.fill(String(PAYMENT_RATE));
  await payForm.getByRole("button", { name: "Record payment" }).click();

  const first = await poll(async () => {
    const { data } = await admin.from("invoice_installments").select("id, status, amount, amount_paid, pkr_per_eur").eq("invoice_id", invoiceId).eq("installment_no", 1).maybeSingle();
    return data?.status === "paid" ? data : null;
  }, 60);
  ok("the payment is recorded at the rate it was received at", Number(first?.pkr_per_eur) === PAYMENT_RATE, JSON.stringify(first));
  const { data: payLog } = await admin.from("pkr_rates").select("rate, set_by").eq("installment_id", first?.id).eq("used_for", "payment");
  ok("...logged, with who gave it", payLog?.length === 1 && Number(payLog[0].rate) === PAYMENT_RATE && payLog[0].set_by === fin.id, JSON.stringify(payLog));

  // ---------------------------------------------------------- the PDF
  console.log("\n--- the PDF ---");
  await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  await row.waitFor({ timeout: 120000 });
  await page.waitForFunction((id) => {
    const b = document.querySelector(`[data-invoice-row="${id}"] button`);
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, invoiceId, { timeout: 60000 });
  await row.getByRole("button", { name: /PDF/ }).first().click();
  await row.getByText(/PDF regenerated/).waitFor({ timeout: 90000 });
  const { data: file } = await admin.storage.from("documents").download(`${studentId}/invoices/${invoiceId}.pdf`);
  const pdfBytes = file ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
  // KEEP_PDF_TO=<folder> keeps a copy, to look at.
  if (process.env.KEEP_PDF_TO && pdfBytes.length) writeFileSync(`${process.env.KEEP_PDF_TO}/pkr-rates-invoice.pdf`, pdfBytes);
  const text = pdfBytes.length ? pdfText(pdfBytes) : "";
  const { data: schedule } = await admin.from("invoice_installments").select("installment_no, amount, amount_paid").eq("invoice_id", invoiceId).order("installment_no");
  const total = (schedule ?? []).reduce((s, i) => s + Number(i.amount), 0);
  const received = Number(first?.amount_paid ?? 0);
  const due = total - received;
  ok("the PDF says the total at the invoice's rate", text.includes(pkr(total * INVOICE_RATE)), pkr(total * INVOICE_RATE));
  ok("...the payment received at its own rate", text.includes(pkr(received * PAYMENT_RATE)), pkr(received * PAYMENT_RATE));
  ok("...what is still due at the latest rate", text.includes(pkr(due * PAYMENT_RATE)), pkr(due * PAYMENT_RATE));
  // Read to its end, not its first full stop: a rate has decimals.
  const at = text.indexOf("Rupee amounts shown:");
  const note = at === -1 ? "" : text.slice(at, at + 400);
  ok(
    "...and a note naming each rate",
    note.includes(`the total at PKR ${INVOICE_RATE} per €1`) && note.includes(`the payment at PKR ${PAYMENT_RATE} per €1`) && note.includes(`still due at PKR ${PAYMENT_RATE} per €1`),
    note || text.slice(-400)
  );

  // ---------------------------------------------------------- held for good
  console.log("\n--- held for good ---");
  const asFin = await apiAs(url, anonKey, fin.email);
  const { error: invoiceChange } = await asFin.from("invoices").update({ pkr_per_eur: INVOICE_RATE + 10 }).eq("id", invoiceId);
  ok("an issued invoice's rate cannot be changed", /keeps the rupee rate/.test(invoiceChange?.message ?? ""), invoiceChange?.message ?? "changed");
  const { error: paymentChange } = await asFin.from("invoice_installments").update({ pkr_per_eur: PAYMENT_RATE + 10 }).eq("id", first.id);
  ok("...nor a recorded payment's", /keeps the rupee rate/.test(paymentChange?.message ?? ""), paymentChange?.message ?? "changed");

  // Setup lists them.
  await page.goto(`${BASE}/setup/invoice-settings`, { waitUntil: "domcontentloaded" });
  const recent = page.locator("[data-recent-pkr-rates]");
  await recent.waitFor({ timeout: 60000 });
  const listed = (await recent.innerText()).replace(/\s+/g, " ");
  ok("Setup lists the rates given, for which invoice and payment", listed.includes(`PKR ${PAYMENT_RATE} payment on ${INVOICE_NUMBER}`) && listed.includes(`PKR ${INVOICE_RATE} invoice ${INVOICE_NUMBER}`), listed.slice(0, 300));

  const { error: undoError } = await asFin.rpc("undo_installment_payment", { p_installment_id: first.id });
  const { data: undone } = await admin.from("invoice_installments").select("status, pkr_per_eur").eq("id", first.id).single();
  ok("undoing the payment takes its rate with it", !undoError && undone.status !== "paid" && undone.pkr_per_eur === null, JSON.stringify({ undoError: undoError?.message, undone }));

  // The student's own page records a payment the same way.
  console.log("\n--- on the student's page ---");
  const THIRD_RATE = Math.round((before + 0.75) * 100) / 100;
  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  const card = page.locator("#card-invoice");
  await card.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const b = document.querySelector("#card-invoice [data-collapsible-toggle]");
    return Boolean(b && Object.keys(b).some((k) => k.startsWith("__reactProps")));
  }, null, { timeout: 60000 });
  await card.locator("[data-collapsible-toggle]").first().click();
  const markPaid = card.locator("form", { has: page.locator('input[name="pkr_per_eur"]') }).first();
  await markPaid.waitFor({ timeout: 30000 });
  const offered = Number(await markPaid.locator('input[name="pkr_per_eur"]').inputValue());
  ok("the student's page asks for the payment's rate too, offered the latest", offered === PAYMENT_RATE, String(offered));
  await markPaid.locator('input[name="pkr_per_eur"]').fill(String(THIRD_RATE));
  await markPaid.getByRole("button", { name: "Mark paid" }).click();
  const again = await poll(async () => {
    const { data } = await admin.from("invoice_installments").select("status, pkr_per_eur").eq("id", first.id).single();
    return data?.status === "paid" ? data : null;
  }, 60);
  ok("...and records it at the rate given", Number(again?.pkr_per_eur) === THIRD_RATE, JSON.stringify(again));
  const shown = await poll(async () => (await card.innerText()).includes(`received at PKR ${THIRD_RATE} per €1`), 30);
  ok("...which the invoice card then shows", Boolean(shown));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  // The log and the rate on file, as they were: this run's rates are not
  // anybody's to be offered next.
  if (invoiceId) await admin.from("pkr_rates").delete().eq("invoice_id", invoiceId);
  if (staffIds.length) await admin.from("pkr_rates").delete().in("set_by", staffIds);
  await admin.from("invoice_settings").update({ pkr_per_eur: before }).eq("id", true);
  await admin.from("pkr_rates").delete().eq("used_for", "setup").is("set_by", null).gte("set_at", started);
  if (invoiceId) await admin.from("invoices").delete().eq("id", invoiceId);
  if (studentId) {
    const { data: stored } = await admin.storage.from("documents").list(`${studentId}/invoices`);
    if (stored?.length) await admin.storage.from("documents").remove(stored.map((f) => `${studentId}/invoices/${f.name}`));
  }
  const removed = await fx.cleanup();
  const { data: after } = await admin.from("invoice_settings").select("pkr_per_eur").eq("id", true).single();
  ok("the rate on file is put back", Number(after?.pkr_per_eur) === before, `${after?.pkr_per_eur} (was ${before})`);
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
