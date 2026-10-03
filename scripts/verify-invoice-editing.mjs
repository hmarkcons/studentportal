// Invoices (0311): undoing a payment, editing an invoice fully, numbering
// without gaps, and the database following Role Permissions — end to end
// against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:invoiceedit
//
//   numbering   the next number is the lowest free one from 101: a deleted
//               invoice's number is given out again, and a number cannot be
//               used twice, whatever its case.
//   undo        on the Invoice Generator, a part payment is recorded (the
//               balance split off) and undone (merged back into one unpaid
//               instalment); a full payment with a blank date is dated today
//               and undone back to unpaid.
//   edit        Modify opens the full form: the number of instalments from a
//               dropdown and the first unpaid one's due date. Raising the
//               count re-spreads the balance over dated instalments, the last
//               on the admission; an unpaid instalment's receipt survives it;
//               a drop that would delete a receipt is refused; a paid
//               instalment is never altered.
//   who         each role may write an invoice's instalments exactly when Role
//               Permissions gives it finance.invoices.manage, and delete an
//               invoice exactly when it gives finance.invoices.delete.
//
// Everything is named zztmp and removed in a finally.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:invoiceedit");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = "zztmp Numbering Run";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function hydrated(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
    },
    selector,
    { timeout: 60000 }
  );
}

let browser = null;
const receiptPaths = [];

try {
  const sup = await fx.staff("invedit", ["super_admin"]);
  const finance = await fx.staff("inveditfin", ["finance"]);
  const processing = await fx.staff("inveditproc", ["processing"]);
  const counsellor = await fx.staff("inveditcoun", ["counselor"]);
  const studentId = await fx.lead({
    full_name: "zztmp Invoice Edit Student", email: "zztmp-invedit@example.invalid",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
  });
  const asSup = await apiAs(url, anonKey, sup.email);

  // ------------------------------------------------------------ numbering
  console.log("\n--- numbering ---");
  const next = async () => (await asSup.rpc("next_invoice_number", { p_intake: RUN })).data;
  const first = await next();
  ok("a new run starts at 101", first === `HMC-${RUN}-101`, first);
  const numbered = [];
  for (const n of [101, 102, 103]) {
    const { data, error } = await admin.from("invoices").insert({ student_id: studentId, consultancy_fee: 100, admin_charge: 0, currency: "PKR", intake: RUN, invoice_number: `HMC-${RUN}-${n}` }).select("id").single();
    if (error) throw new Error(`numbered invoice: ${error.message}`);
    numbered.push(data.id);
  }
  ok("with 101 to 103 taken, the next is 104", (await next()) === `HMC-${RUN}-104`);
  await admin.from("invoices").delete().eq("id", numbered[1]);
  ok("a deleted invoice's number is the next one given out", (await next()) === `HMC-${RUN}-102`);
  const { error: dupError } = await admin.from("invoices").insert({ student_id: studentId, consultancy_fee: 100, admin_charge: 0, currency: "PKR", invoice_number: `hmc-${RUN.toLowerCase()}-101` });
  ok("a number cannot be used twice, whatever its case", dupError?.code === "23505", dupError?.message);
  await admin.from("invoices").delete().in("id", numbered);

  // ------------------------------------------------- the invoice to work on
  const { data: inv, error: invError } = await admin
    .from("invoices")
    .insert({ student_id: studentId, consultancy_fee: 3000, admin_charge: 0, currency: "PKR", invoice_number: "zztmp-INV-EDIT", tax_rate: 0, tax_base: "services" })
    .select("id")
    .single();
  if (invError) throw new Error(`invoice: ${invError.message}`);
  const { error: instError } = await admin.from("invoice_installments").insert([
    { invoice_id: inv.id, installment_no: 1, amount: 1500, status: "unpaid", due_date: today, amount_paid: 0 },
    { invoice_id: inv.id, installment_no: 2, amount: 1500, status: "unpaid", due_date: "2026-12-01", amount_paid: 0 },
  ]);
  if (instError) throw new Error(`instalments: ${instError.message}`);
  const schedule = async () =>
    (await admin.from("invoice_installments").select("id, installment_no, amount, amount_paid, status, due_date, due_condition, paid_date, payment_method, carried_from_installment_no").eq("invoice_id", inv.id).order("installment_no")).data ?? [];
  const firstId = (await schedule())[0].id;

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);
  page.on("dialog", (d) => d.accept());
  const row = page.locator(`[data-invoice-row="${inv.id}"]`);
  const openRow = async () => {
    await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
    await row.waitFor({ timeout: 60000 });
    await hydrated(page, `[data-invoice-row="${inv.id}"] button`);
  };

  // ----------------------------------------------------------------- undo
  console.log("\n--- undo ---");
  await openRow();
  await row.getByRole("button", { name: "View" }).click();
  const instForm = row.locator("form", { hasText: "#1 ·" });
  await instForm.locator('input[name="amount_paid"]').fill("600");
  await instForm.locator('select[name="payment_method"]').selectOption("Bank transfer");
  await instForm.getByRole("button", { name: "Record payment" }).click();
  const split = await poll(async () => {
    const s = await schedule();
    return s.length === 3 ? s : null;
  });
  ok("a part payment in the generator splits the instalment",
    split?.[0].amount === 600 && split[0].status === "paid" && split[1].amount === 900 && split[1].carried_from_installment_no === 1 && split[2].amount === 1500,
    JSON.stringify(split?.map((r) => [r.installment_no, r.amount, r.status])));

  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page, `[data-invoice-row="${inv.id}"] button`);
  await row.getByRole("button", { name: "View" }).click();
  await row.locator(`[data-undo-payment="${firstId}"]`).click();
  const merged = await poll(async () => {
    const s = await schedule();
    return s.length === 2 && s[0].status === "unpaid" ? s : null;
  });
  ok("undoing it merges the balance back into one unpaid instalment",
    merged?.[0].amount === 1500 && merged[0].amount_paid === 0 && merged[0].paid_date === null && merged[0].payment_method === null && merged[1].installment_no === 2 && merged[1].amount === 1500,
    JSON.stringify(merged?.map((r) => [r.installment_no, r.amount, r.status, r.paid_date])));

  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page, `[data-invoice-row="${inv.id}"] button`);
  await row.getByRole("button", { name: "View" }).click();
  await row.locator("form", { hasText: "#1 ·" }).getByRole("button", { name: "Record payment" }).click();
  const full = await poll(async () => {
    const s = await schedule();
    return s[0]?.status === "paid" ? s : null;
  });
  ok("a full payment with the date left blank is dated today", full?.[0].paid_date === today && full[0].amount_paid === 1500, JSON.stringify(full?.[0]));

  // ----------------------------------------------------------------- edit
  console.log("\n--- edit ---");
  // A receipt on the unpaid instalment, which a resize must not take with it.
  const openId = (await schedule())[1].id;
  const receiptPath = `payment-receipts/installment/${openId}/zztmp-edit.pdf`;
  receiptPaths.push(receiptPath);
  await admin.storage.from("documents").upload(receiptPath, Buffer.from("%PDF-1.4\n%%EOF\n"), { contentType: "application/pdf" });
  await admin.from("payment_receipts").insert({ kind: "installment", installment_id: openId, path: receiptPath, file_name: "zztmp-edit.pdf", uploaded_by: sup.id });

  await openRow();
  await row.getByRole("button", { name: "Modify" }).click();
  const form = row.locator(`[data-invoice-edit="${inv.id}"] form`);
  await form.waitFor({ timeout: 30000 });
  await hydrated(page, `[data-invoice-edit="${inv.id}"] select[name="installment_count"]`);
  const choices = await form.locator('select[name="installment_count"] option').allInnerTexts();
  ok("Modify opens the full form, the number of instalments a dropdown that starts at what is paid",
    choices[0] === "1 installment" && choices.includes("3 installments") && (await form.locator('input[name="first_due_date"]').count()) === 1,
    choices.join(", "));
  await form.locator('select[name="installment_count"]').selectOption("3");
  await form.locator('input[name="first_due_date"]').fill("2026-11-15");
  await form.getByRole("button", { name: "Save invoice" }).click();
  const resized = await poll(async () => {
    const s = await schedule();
    return s.length === 3 ? s : null;
  });
  ok("raising the count to 3 re-spreads the balance: paid one kept, next dated, the last on the admission",
    resized?.[0].status === "paid" && resized[0].amount === 1500 &&
      resized[1].due_date === "2026-11-15" && resized[1].amount === 750 &&
      resized[2].due_date === null && Boolean(resized[2].due_condition) && resized[2].amount === 750,
    JSON.stringify(resized?.map((r) => [r.installment_no, r.amount, r.status, r.due_date, r.due_condition])));
  ok("...and the unpaid instalment's receipt is still on it", resized?.[1].id === openId &&
    Boolean((await admin.from("payment_receipts").select("id").eq("installment_id", openId).maybeSingle()).data));

  // Dropping back to 1 would delete the instalment holding the receipt.
  await openRow();
  await row.getByRole("button", { name: "Modify" }).click();
  await hydrated(page, `[data-invoice-edit="${inv.id}"] select[name="installment_count"]`);
  const form2 = row.locator(`[data-invoice-edit="${inv.id}"] form`);
  // Move the receipt to the last instalment, the one a drop to 2 removes.
  const lastId = resized?.[2].id;
  const lastPath = `payment-receipts/installment/${lastId}/zztmp-last.pdf`;
  receiptPaths.push(lastPath);
  await admin.storage.from("documents").upload(lastPath, Buffer.from("%PDF-1.4\n%%EOF\n"), { contentType: "application/pdf" });
  await admin.from("payment_receipts").insert({ kind: "installment", installment_id: lastId, path: lastPath, file_name: "zztmp-last.pdf", uploaded_by: sup.id });
  await form2.locator('select[name="installment_count"]').selectOption("2");
  await form2.getByRole("button", { name: "Save invoice" }).click();
  await form2.locator("p.text-danger").waitFor({ timeout: 30000 });
  ok("a drop that would delete an instalment holding a receipt is refused, saying why",
    /payment receipts attached/.test(await form2.locator("p.text-danger").innerText()) && (await schedule()).length === 3,
    await form2.locator("p.text-danger").innerText());

  // ------------------------------------------------------------------ who
  console.log("\n--- who ---");
  for (const [who, person] of [["Finance", finance], ["Processing", processing], ["a counsellor", counsellor]]) {
    const as = await apiAs(url, anonKey, person.email);
    const { data: mayManage } = await as.rpc("staff_has_permission", { p_key: "finance.invoices.manage" });
    const { data: mayDelete } = await as.rpc("staff_has_permission", { p_key: "finance.invoices.delete" });
    const { data: wrote } = await as.from("invoice_installments").update({ payment_method: "zztmp probe" }).eq("id", openId).select("id");
    const { data: canDeleteFn } = await as.rpc("can_delete_invoices");
    ok(`${who} may write instalments exactly when Role Permissions lets them manage invoices`,
      ((wrote ?? []).length > 0) === Boolean(mayManage), JSON.stringify({ permission: mayManage, wrote: wrote?.length }));
    ok(`...and delete invoices exactly when it lets them`, Boolean(canDeleteFn) === Boolean(mayDelete), JSON.stringify({ mayDelete, canDeleteFn }));
  }
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (receiptPaths.length) await admin.storage.from("documents").remove(receiptPaths);
  await admin.from("invoice_number_counters").delete().eq("intake_key", RUN.toLowerCase());
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
