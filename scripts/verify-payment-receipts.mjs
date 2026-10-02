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
//   several      a payment takes more than one receipt, and one attached by
//                mistake is removed — its record and its file.
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

  // -------------------------------------------------------- several
  console.log("\n--- several ---");
  await page.goto(`${BASE}/students/${studentId}?open=invoice`, { waitUntil: "domcontentloaded" });
  const second = await uploadReceipt(page, made.installment, "zztmp second slip.pdf");
  ok("a payment takes a second receipt beside the first", second.count === 2, String(second.count));
  const firstPath = (await admin.from("payment_receipts").select("path").eq("installment_id", made.installment).order("uploaded_at").limit(1).single()).data?.path;
  const first = second.dialog.locator("[data-receipt]").first();
  await first.getByRole("button", { name: /Remove zztmp installment slip\.pdf/ }).click();
  await first.getByRole("button", { name: "Remove", exact: true }).click();
  await poll(async () => (await second.dialog.locator("[data-receipt]").count()) === 1, 30);
  ok("one attached by mistake is removed from the list", (await second.dialog.locator("[data-receipt]").count()) === 1);
  const remaining = (await admin.from("payment_receipts").select("file_name").eq("installment_id", made.installment)).data ?? [];
  ok("...and from the record", remaining.length === 1 && remaining[0].file_name === "zztmp second slip.pdf", JSON.stringify(remaining));
  const folder = `payment-receipts/installment/${made.installment}`;
  const { data: left } = await admin.storage.from("documents").list(folder);
  ok("...and its file from storage", Boolean(firstPath) && !(left ?? []).some((o) => `${folder}/${o.name}` === firstPath) && (left ?? []).length === 1,
    JSON.stringify((left ?? []).map((o) => o.name)));
  await closeDialog(page);

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
