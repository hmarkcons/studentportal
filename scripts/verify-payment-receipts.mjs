// Payment receipts (0308), end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:receipts
//
//   each place   a consultancy fee instalment (on the student's Invoice
//                section), a staff commission (Staff Commission), a month's
//                salary (Payroll), a refund (Refunds) and a referral
//                commission (Referrals) each have a Receipts button; a Super
//                Admin uploads a receipt there, sees it listed with their
//                name, and opens the file itself through its link.
//   fee table    on Consultancy Fee, the instalment count and then a column
//                per instalment come before Paid, each showing its amount,
//                status and receipt; the rows are coloured. Replace there
//                puts a new file in the old one's place and keeps the old as
//                an earlier version, with who replaced it.
//   several      a payment takes more than one receipt, and counts only the
//                current ones. A Super Admin deletes any receipt, record and
//                file; deleting a replacement makes the one it replaced
//                current again. Anyone else who handles the receipts can
//                replace but not delete, and is offered no Delete.
//   status       no upload changes any payment's status.
//   who          each kind's receipts are open to exactly whoever holds the
//                permission that marks it paid, as Role Permissions has it
//                set for Finance, Management and Counsellor right now; and a
//                counsellor can neither list, open nor add a receipt, not even
//                on their own student's payments or their own commission.
//
// Everything is named zztmp and removed in a finally, files included.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:receipts");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const monthStart = `${today.slice(0, 7)}-01`;
const pdf = (label) => Buffer.from(`%PDF-1.4\n% zztmp ${label}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

async function poll(fn, seconds = 30) {
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

/** Opens a payment's receipts, uploads a file, and returns what the pop-up then shows. */
async function uploadReceipt(page, paymentId, fileName) {
  const button = `[data-receipts-button="${paymentId}"]`;
  await page.locator(button).waitFor({ timeout: 60000 });
  await hydrated(page, button);
  const before = Number(await page.locator(button).getAttribute("data-receipts-count"));
  await page.locator(button).click();
  const dialog = page.locator(`[data-receipts-dialog="${paymentId}"]`);
  await dialog.locator("[data-receipts-empty], [data-receipts-list]").first().waitFor({ timeout: 30000 });
  await hydrated(page, `[data-receipts-dialog="${paymentId}"] input[type="file"]`);
  await dialog.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: pdf(fileName) });
  const submit = dialog.getByRole("button", { name: "Upload receipt" });
  await poll(() => submit.isEnabled(), 60);
  await submit.click();
  await poll(async () => (await dialog.locator("[data-receipt]").count()) === before + 1, 60);
  const items = dialog.locator("[data-receipt]");
  const last = items.last();
  const result = {
    count: await items.count(),
    name: (await last.locator("[data-receipt-link]").innerText().catch(() => "")).trim(),
    meta: (await last.locator("[data-receipt-meta]").innerText().catch(() => "")).trim(),
    href: await last.locator("[data-receipt-link]").getAttribute("href").catch(() => null),
  };
  return { ...result, dialog, button };
}

async function closeDialog(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
}

let browser = null;
const made = { installment: null, staff_commission: null, payroll: null, refund: null, referral: null };

try {
  // The uploader holds every permission whatever Role Permissions says; who
  // else may see receipts is checked against what it says, below.
  const uploader = await fx.staff("rcptadmin", ["super_admin"]);
  const finance = await fx.staff("rcptfinance", ["finance"]);
  const management = await fx.staff("rcptmanagement", ["management"]);
  const counsellor = await fx.staff("rcptcounsellor", ["counselor"]);
  const studentId = await fx.lead({
    full_name: "zztmp Receipts Student",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    assigned_counselor_id: counsellor.id,
  });

  const must = async (label, q) => {
    const { data, error } = await q;
    if (error || !data) throw new Error(`${label}: ${error?.message ?? "no row"}`);
    return data.id;
  };
  const invoiceId = await must("invoice", admin.from("invoices").insert({ student_id: studentId, consultancy_fee: 1000, admin_charge: 0, currency: "PKR" }).select("id").single());
  made.installment = await must("instalment", admin.from("invoice_installments").insert({ invoice_id: invoiceId, installment_no: 1, amount: 1000, due_date: today, status: "unpaid" }).select("id").single());
  made.staff_commission = await must("commission", admin.from("staff_commissions").insert({ staff_id: counsellor.id, student_id: studentId, amount: 500, currency: "PKR", status: "unpaid", registration_date: today }).select("id").single());
  made.payroll = await must("payroll", admin.from("staff_payroll").insert({ staff_id: counsellor.id, payroll_month: monthStart, basic_salary: 1000 }).select("id").single());
  made.refund = await must("refund", admin.from("refund_requests").insert({ student_id: studentId, reason: "zztmp receipts check", amount: 200, currency: "PKR", status: "approved" }).select("id").single());
  made.referral = await must("referral", admin.from("referrals").insert({ lead_id: studentId, referrer_name: "zztmp Receipts Referrer", incentive_owed: 300, incentive_status: "owed", currency: "PKR" }).select("id").single());

  const statusOf = async () => ({
    installment: (await admin.from("invoice_installments").select("status").eq("id", made.installment).single()).data?.status,
    staff_commission: (await admin.from("staff_commissions").select("status").eq("id", made.staff_commission).single()).data?.status,
    payroll: (await admin.from("staff_payroll").select("payment_status").eq("id", made.payroll).single()).data?.payment_status,
    refund: (await admin.from("refund_requests").select("status").eq("id", made.refund).single()).data?.status,
    referral: (await admin.from("referrals").select("incentive_status").eq("id", made.referral).single()).data?.incentive_status,
  });
  const statusBefore = await statusOf();

  browser = await openBrowser();
  const page = await signIn(browser, uploader.email);
  await page.setViewportSize({ width: 1500, height: 1000 });

  // ------------------------------------------------------- each place
  console.log("\n--- each place ---");
  // Both lists are paged, so the fixture is searched for rather than hoped to be on page one.
  const searchFor = (placeholder, submit) => async () => {
    const box = page.getByPlaceholder(placeholder);
    await box.waitFor({ timeout: 60000 });
    await hydrated(page, `input[placeholder="${placeholder}"]`);
    await box.fill("zztmp Receipts");
    if (submit) await page.getByRole("button", { name: submit, exact: true }).click();
  };
  const places = [
    ["installment", `/students/${studentId}?open=invoice`, "a consultancy fee instalment, on the student's Invoice section"],
    ["staff_commission", "/finance/staff-commission", "a staff commission, on Staff Commission", searchFor("Student or staff name…", "Search")],
    ["payroll", `/finance/payroll?staff=${counsellor.id}&month=${today.slice(0, 7)}`, "a month's salary, on Payroll"],
    ["refund", "/finance/refunds", "a refund, on Refunds"],
    ["referral", "/marketing/referrals", "a referral commission, on Referrals", searchFor("Search party or student…")],
  ];
  for (const [kind, path, label, prepare] of places) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    if (prepare) await prepare();
    const r = await uploadReceipt(page, made[kind], `zztmp ${kind} slip.pdf`);
    ok(`${label}: a receipt is uploaded and listed under who uploaded it`,
      r.count === 1 && r.name === `zztmp ${kind} slip.pdf` && /^Uploaded .+ by zztmp rcptadmin/.test(r.meta), JSON.stringify({ count: r.count, name: r.name, meta: r.meta }));
    const file = r.href ? await page.request.get(r.href) : null;
    ok("...and opens the file itself through its link", Boolean(file?.ok()) && (await file.body()).toString().includes(`zztmp zztmp ${kind} slip.pdf`), String(file?.status()));
    const row = (await admin.from("payment_receipts").select("kind, path, uploaded_by").eq(`${kind}_id`, made[kind])).data ?? [];
    ok("...filed in that payment's own folder, under who uploaded it",
      row.length === 1 && row[0].kind === kind && row[0].path.startsWith(`payment-receipts/${kind}/${made[kind]}/`) && row[0].uploaded_by === uploader.id, JSON.stringify(row));
    await closeDialog(page);
    ok("...and the button now says so", (await page.locator(r.button).innerText()).trim() === "Receipts (1)");
  }

  // ------------------------------------------------ consultancy fee table
  console.log("\n--- consultancy fee table ---");
  await page.goto(`${BASE}/finance/consultancy-fee`, { waitUntil: "domcontentloaded" });
  const cell = page.locator(`[data-instalment-cell="${made.installment}"]`);
  await cell.waitFor({ timeout: 60000 });
  const headers = (await page.locator("table[data-row-highlight] thead th").allInnerTexts()).map((t) => t.trim().toLowerCase());
  const at = (h) => headers.indexOf(h);
  ok("the instalment count, then a column per instalment, come before Paid",
    at("total") >= 0 && at("instalments") === at("total") + 1 && at("instalment 1") === at("instalments") + 1 && at("paid") > at("instalment 1") &&
      headers.slice(at("instalment 1"), at("paid")).every((h) => /^instalment \d+$/.test(h)),
    headers.join(" | "));
  const feeRow = page.locator("table[data-row-highlight] > tbody > tr", { has: cell });
  ok("...the count saying how many and how many are paid",
    (await feeRow.locator("[data-instalment-count]").innerText()).replace(/\s+/g, " ").trim() === "1 0 paid · 1 left",
    await feeRow.locator("[data-instalment-count]").innerText());
  ok("...and the instalment's own column its amount, status and receipt",
    /PKR 1,000\.00/.test(await cell.innerText()) && /Due /.test(await cell.innerText()) &&
      (await cell.locator("[data-receipt-link]").innerText()).trim() === "zztmp installment slip.pdf",
    await cell.innerText());
  ok("...which opens", Boolean((await page.request.get(await cell.locator("[data-receipt-link]").getAttribute("href"))).ok()));
  await page.locator("table[data-row-highlight] > tbody > tr").first().locator("td").nth(2).click();
  ok("the table's rows are coloured, and the one clicked stays marked",
    (await page.locator("table[data-row-highlight] > tbody > tr[data-current]").count()) === 1);

  // Replaced from the cell: the old file stays, as an earlier version.
  const original = (await admin.from("payment_receipts").select("id").eq("installment_id", made.installment).single()).data?.id;
  await hydrated(page, `[data-instalment-cell="${made.installment}"] [data-cell-replace]`);
  await cell.locator("[data-cell-replace]").click();
  const dialog = page.locator(`[data-receipts-dialog="${made.installment}"]`);
  const replaceForm = dialog.locator(`[data-replace-form="${original}"]`);
  await replaceForm.waitFor({ timeout: 30000 });
  await hydrated(page, `[data-replace-form="${original}"] input[type="file"]`);
  await replaceForm.locator('input[type="file"]').setInputFiles({ name: "zztmp replacement slip.pdf", mimeType: "application/pdf", buffer: pdf("replacement") });
  const replaceButton = replaceForm.getByRole("button", { name: "Upload replacement" });
  await poll(() => replaceButton.isEnabled(), 60);
  await replaceButton.click();
  const versions = await poll(async () => {
    const { data } = await admin.from("payment_receipts").select("id, file_name, is_current, replaces").eq("installment_id", made.installment).order("uploaded_at");
    return data?.length === 2 ? data : null;
  }, 60);
  ok("Replace puts the new file in the old one's place, keeping the old one",
    versions?.[0].id === original && versions[0].is_current === false && versions[1].file_name === "zztmp replacement slip.pdf" && versions[1].is_current && versions[1].replaces === original,
    JSON.stringify(versions));
  await dialog.locator(`[data-receipt-earlier="${original}"]`).waitFor({ timeout: 30000 });
  ok("...listed beneath it as an earlier version, with who replaced it",
    /Replaced .+ by zztmp rcptadmin/.test(await dialog.locator(`[data-receipt-earlier="${original}"] [data-receipt-replaced]`).innerText()));
  await closeDialog(page);
  await poll(async () => (await cell.locator("[data-receipt-link]").innerText().catch(() => "")).trim() === "zztmp replacement slip.pdf", 30);
  ok("...and the instalment's column shows the replacement", (await cell.locator("[data-receipt-link]").innerText()).trim() === "zztmp replacement slip.pdf");

  // ------------------------------------------------- several, and deleting
  console.log("\n--- several, and deleting ---");
  await page.goto(`${BASE}/students/${studentId}?open=invoice`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-receipts-button="${made.installment}"]`).waitFor({ timeout: 60000 });
  ok("a count is of current receipts, not earlier versions", (await page.locator(`[data-receipts-button="${made.installment}"]`).getAttribute("data-receipts-count")) === "1");
  const second = await uploadReceipt(page, made.installment, "zztmp second slip.pdf");
  ok("a payment takes a second receipt beside the first", second.count === 2, String(second.count));

  // A Super Admin deletes — any receipt, its record and its file.
  const secondRow = (await admin.from("payment_receipts").select("id, path").eq("installment_id", made.installment).eq("file_name", "zztmp second slip.pdf").single()).data;
  page.once("dialog", (d) => d.accept());
  await second.dialog.getByRole("button", { name: "Delete zztmp second slip.pdf" }).click();
  await poll(async () => (await second.dialog.locator("[data-receipt]").count()) === 1, 30);
  const folder = `payment-receipts/installment/${made.installment}`;
  const listed = async () => ((await admin.storage.from("documents").list(folder)).data ?? []).map((o) => `${folder}/${o.name}`);
  ok("a Super Admin deletes a receipt: its record and its file",
    !(await admin.from("payment_receipts").select("id").eq("id", secondRow.id).maybeSingle()).data && !(await listed()).includes(secondRow.path));
  const replacement = versions?.[1];
  page.once("dialog", (d) => d.accept());
  await second.dialog.getByRole("button", { name: "Delete zztmp replacement slip.pdf" }).click();
  const restored = await poll(async () => {
    const { data } = await admin.from("payment_receipts").select("id, is_current").eq("installment_id", made.installment);
    return data?.length === 1 ? data[0] : null;
  }, 30);
  ok("...and deleting a replacement makes the receipt it replaced current again",
    Boolean(replacement) && restored?.id === original && restored.is_current === true, JSON.stringify(restored));
  await second.dialog.locator(`[data-receipt="${original}"]`).waitFor({ timeout: 15000 });
  await closeDialog(page);

  // Anyone else who handles the receipts uploads and replaces, but cannot delete.
  const asFinance = await apiAs(url, anonKey, finance.email);
  const { data: canFinance } = await asFinance.rpc("staff_has_permission", { p_key: "finance.invoices.manage" });
  const originalPath = (await admin.from("payment_receipts").select("path").eq("id", original).single()).data?.path;
  const { data: financeDeleted } = await asFinance.from("payment_receipts").delete().eq("id", original).select("id");
  await asFinance.storage.from("documents").remove([originalPath]);
  ok("someone who handles instalment receipts but is not a Super Admin can delete neither a record nor a file",
    Boolean(canFinance) && (financeDeleted ?? []).length === 0 &&
      Boolean((await admin.from("payment_receipts").select("id").eq("id", original).maybeSingle()).data) && (await listed()).includes(originalPath),
    JSON.stringify({ canFinance, deleted: financeDeleted?.length }));
  const financePage = await signIn(browser, finance.email);
  await financePage.goto(`${BASE}/finance/consultancy-fee`, { waitUntil: "domcontentloaded" });
  const financeCell = financePage.locator(`[data-instalment-cell="${made.installment}"]`);
  await financeCell.locator("[data-cell-replace]").waitFor({ timeout: 60000 });
  ok("...and is offered Replace in the table, but no Delete", (await financeCell.locator("[data-cell-delete]").count()) === 0);
  await financePage.close();

  // ---------------------------------------------------------- status
  console.log("\n--- status ---");
  const statusAfter = await statusOf();
  ok("no upload changed any payment's status", JSON.stringify(statusAfter) === JSON.stringify(statusBefore), `${JSON.stringify(statusBefore)} -> ${JSON.stringify(statusAfter)}`);

  // ------------------------------------------------------------- who
  console.log("\n--- who ---");
  const asCounsellor = await apiAs(url, anonKey, counsellor.email);
  const { data: seen } = await asCounsellor.from("payment_receipts").select("id");
  ok("a counsellor lists no receipts, not even on their own student's payments or their own commission", (seen ?? []).length === 0, String(seen?.length));
  const anyPath = (await admin.from("payment_receipts").select("path").eq("staff_commission_id", made.staff_commission).single()).data?.path;
  const { data: blob } = await asCounsellor.storage.from("documents").download(anyPath);
  ok("...cannot open the file of their own commission's receipt", !blob);
  const sneak = `payment-receipts/installment/${made.installment}/zztmp-sneak.pdf`;
  const { error: upErr } = await asCounsellor.storage.from("documents").upload(sneak, pdf("sneak"), { contentType: "application/pdf" });
  const { error: rowErr } = await asCounsellor.from("payment_receipts").insert({ kind: "installment", installment_id: made.installment, path: sneak, file_name: "x.pdf", uploaded_by: counsellor.id });
  ok("...and can add neither a file nor a record", Boolean(upErr) && Boolean(rowErr), JSON.stringify({ upErr: upErr?.message, rowErr: rowErr?.message }));
  if (!upErr) await admin.storage.from("documents").remove([sneak]);

  // Who sees each kind is whoever holds the permission that marks it paid —
  // asked of the database as that person, so this follows Role Permissions
  // as it is set, not as it was by default.
  const PERMISSION = {
    installment: "finance.invoices.manage",
    staff_commission: "finance.commissions.manage",
    payroll: "finance.commissions.manage",
    refund: "finance.refunds.review",
    referral: "marketing.referral_incentives",
  };
  for (const [who, person] of [["Finance", finance], ["Management", management], ["a counsellor", counsellor]]) {
    const as = who === "a counsellor" ? asCounsellor : await apiAs(url, anonKey, person.email);
    const mismatches = [];
    const seenKinds = [];
    for (const kind of Object.keys(PERMISSION)) {
      const { data: allowed } = await as.rpc("staff_has_permission", { p_key: PERMISSION[kind] });
      const { data: rows } = await as.from("payment_receipts").select("id").eq(`${kind}_id`, made[kind]);
      const sees = (rows ?? []).length > 0;
      if (sees) seenKinds.push(kind);
      if (sees !== Boolean(allowed)) mismatches.push(`${kind}: permission ${Boolean(allowed)}, sees ${sees}`);
    }
    ok(`${who} sees exactly the receipts their permissions allow`, mismatches.length === 0, mismatches.join("; ") || `sees: ${seenKinds.join(", ") || "none"}`);
  }
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  // The files first: the rows that point at them go with their payments.
  for (const [kind, id] of Object.entries(made)) {
    if (!id) continue;
    const folder = `payment-receipts/${kind}/${id}`;
    const { data } = await admin.storage.from("documents").list(folder);
    if (data?.length) await admin.storage.from("documents").remove(data.map((o) => `${folder}/${o.name}`));
  }
  if (made.payroll) await admin.from("staff_payroll").delete().eq("id", made.payroll);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
