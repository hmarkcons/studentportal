// The invoice flow, end to end, on a throwaway student.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:invoice
//
// The invoice is what the student is actually asked to pay, so the arithmetic
// has to be right in four places at once — the generator's preview, the stored
// installments, the PDF and the email all read from invoiceMath, and none of
// them has a unit test underneath it.
//
//   generating     the fee, the SRB tax on it, the administrative charge, and
//                  the split into installments with the admin charge riding on
//                  the first one. A public-track destination is billed in EUR
//                  whatever the form says, and the last installment of a plan
//                  falls due on an admission rather than on a date.
//   the PDF        stored, and a real PDF.
//   sending        the status is written only after the mail actually goes —
//                  it used to be stamped regardless, so the CRM reported
//                  invoices as delivered that nobody had received.
//   payment        marking an installment paid, and what the invoice then
//                  reports as paid and outstanding.
//   deleting       the invoice and its installments together.
//
// The agreement is set up directly rather than through its own UI: it is the
// invoice under test here, and check:agreement already drives that path.
import { clients, fixtures, openBrowser, signIn, apiAs, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:invoice");

const { admin, url, anonKey } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

const expand = async (page, title) => {
  const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
  if (await header.count()) await header.click();
};

const waitForInvoice = async (page, studentId, done, seconds = 45) => {
  for (let i = 0; i < seconds; i++) {
    const { data } = await admin
      .from("invoices")
      .select("id, invoice_number, currency, admin_charge, consultancy_fee, discount_amount, " +
              "tax_rate, tax_amount, sent_status, sent_at, pdf_path, intake, terms, receipt_token")
      .eq("student_id", studentId)
      .maybeSingle();
    if (data && done(data)) return data;
    await page.waitForTimeout(1000);
  }
  return null;
};

const installmentsOf = async (invoiceId) => {
  const { data } = await admin
    .from("invoice_installments")
    .select("installment_no, amount, status, due_date, due_condition, amount_paid, payment_method, paid_date")
    .eq("invoice_id", invoiceId)
    .order("installment_no");
  return data ?? [];
};

// Italy (Public): a public track, so EUR and a public-university condition.
const FEE = 1800;
const ADMIN_CHARGE = 300;
const FIRST_DUE = "2026-10-05";

let studentId = null;

try {
  const sup = await fx.staff("invsuper", ["super_admin"]);
  const page = await signIn(browser, sup.email);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin.from("agreement_templates")
    .select("id").eq("destination_id", italy.id).limit(1).single();

  studentId = await fx.lead({
    full_name: "zztmp Invoice Student",
    email: "zztmp-invoice@example.invalid",
    contact_number: "0300-9999999",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });

  // A signed agreement is what puts the invoice panel on the page, and it is
  // where the track — and so the currency and the condition — comes from.
  const { data: agreement } = await admin.from("agreements").insert({
    student_id: studentId, template_id: template.id, signing_method: "paper",
    status: "signed", signed_file_path: `${studentId}/agreements/zztmp-signed.pdf`,
  }).select("id").single();

  // ===================================================== generating one
  console.log("\n--- generating an invoice ---");
  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(page, "Invoice");

  const generate = page.getByRole("button", { name: "Generate invoice" });
  ok("the invoice panel is offered once an agreement is signed", (await generate.count()) > 0,
    (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

  if (await generate.count()) {
    const form = page.locator("form").filter({ has: generate }).first();
    await form.locator('input[name="admin_charge"]').fill(String(ADMIN_CHARGE));
    await form.locator('input[name="consultancy_fee"]').fill(String(FEE));
    await form.locator('select[name="installment_count"]').selectOption("3");
    await form.locator('input[name="first_due_date"]').fill(FIRST_DUE);
    await form.locator('input[name="intake"]').fill("zztmp Winter 2026");
    // Deliberately asking for rupees on a public-track student: the currency
    // comes from the destination, not the form, so a stale or hand-posted
    // form cannot raise a public invoice in the wrong currency.
    await form.locator('select[name="currency"]').selectOption("PKR");
    await generate.click();

    const invoice = await waitForInvoice(page, studentId, (i) => i.id);
    ok("an invoice is created", invoice !== null,
      (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

    if (invoice) {
      ok("...billed in EUR because the destination is public, not in the PKR asked for",
        invoice.currency === "EUR", String(invoice.currency));
      ok("...with an invoice number allocated", Boolean(invoice.invoice_number), String(invoice.invoice_number));
      ok("...SRB tax charged on the consultancy fee only",
        Number(invoice.tax_rate) === 5 && Number(invoice.tax_amount) === 90,
        `rate=${invoice.tax_rate} amount=${invoice.tax_amount}`);

      const parts = await installmentsOf(invoice.id);
      const amounts = parts.map((p) => Number(p.amount));
      ok("...split into three installments", parts.length === 3, `${parts.length}`);
      // 1800 + 5% = 1890, in three = 630 each, and the administrative charge
      // rides on the first because that is how it is collected.
      ok("...with the administrative charge on the first one",
        JSON.stringify(amounts) === JSON.stringify([930, 630, 630]), JSON.stringify(amounts));
      ok("...summing to the total the student owes",
        amounts.reduce((a, b) => a + b, 0) === FEE + 90 + ADMIN_CHARGE, String(amounts.reduce((a, b) => a + b, 0)));

      ok("...the first due on the date given", parts[0]?.due_date === FIRST_DUE, String(parts[0]?.due_date));
      ok("...the second a month later", parts[1]?.due_date === "2026-11-05", String(parts[1]?.due_date));
      // Nobody knows in October when a Milan admission lands, and a date the
      // office invents is one the student quotes back at them later.
      ok("...and the last on the admission, not a date",
        parts[2]?.due_date === null && /public university/.test(parts[2]?.due_condition ?? ""),
        `date=${parts[2]?.due_date} condition=${parts[2]?.due_condition}`);

      // ------------------------------------------------------------ the PDF
      console.log("\n--- the PDF ---");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Invoice");
      const pdfButton = page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
      ok("a PDF can be produced", (await pdfButton.count()) > 0);
      if (await pdfButton.count()) {
        await pdfButton.click();
        const withPdf = await waitForInvoice(page, studentId, (i) => i.pdf_path, 90);
        ok("...and is stored", Boolean(withPdf?.pdf_path),
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        if (withPdf?.pdf_path) {
          const { data: file } = await admin.storage.from("documents").download(withPdf.pdf_path);
          const bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
          ok("...as a real PDF", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF",
            bytes ? `${bytes.length} bytes` : "no file");
        }
      }

      // ----------------------------------------------------------- sending
      // sent_status used to be stamped whether or not any mail went, so the
      // CRM reported invoices as delivered that nobody had received. What
      // proves the fix is a send that cannot succeed.
      //
      // The failure is forced by removing the student's email rather than by
      // posting to a dead address: nodemailer resolves as soon as the relay
      // accepts the message, so an undeliverable address is a bounce half an
      // hour later, not an error here — it would send real mail on every run
      // and still not test this. No email address fails before any mail is
      // attempted, which is the branch worth pinning.
      console.log("\n--- a send that cannot go ---");
      await admin.from("leads").update({ email: null }).eq("id", studentId);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Invoice");
      const send = page.getByRole("button", { name: /Send invoice|Email invoice|Send to student/i }).first();
      ok("the send is offered", (await send.count()) > 0,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-400));
      if (await send.count()) {
        await send.click();
        await page.waitForTimeout(6000);
        const after = await waitForInvoice(page, studentId, () => true, 5);
        ok("a send that cannot go does not mark the invoice as sent",
          after?.sent_status !== "sent" && after?.sent_at === null,
          `sent_status=${after?.sent_status} sent_at=${after?.sent_at}`);
        const { count: receipts } = await admin.from("receipts")
          .select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id);
        ok("...and writes no receipt row for a mail nobody got", receipts === 0, `${receipts} rows`);
        ok("...and says why", /no email address/i.test(await page.locator("body").innerText()),
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
      }
      await admin.from("leads").update({ email: "zztmp-invoice@example.invalid" }).eq("id", studentId);

      // ---------------------------------------------------------- payment
      console.log("\n--- taking a payment ---");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Invoice");
      const markPaid = page.getByRole("button", { name: /^Mark paid$/ }).first();
      ok("the first installment can be marked paid", (await markPaid.count()) > 0);
      if (await markPaid.count()) {
        await markPaid.click();
        let settled = null;
        for (let i = 0; i < 30; i++) {
          const rows = await installmentsOf(invoice.id);
          if (rows[0]?.status === "paid") { settled = rows; break; }
          await page.waitForTimeout(1000);
        }
        ok("...and is recorded as paid", settled !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        ok("...for its full amount", Number(settled?.[0]?.amount_paid) === 930,
          String(settled?.[0]?.amount_paid));
        ok("...leaving the other two outstanding",
          settled?.slice(1).every((r) => r.status !== "paid"),
          JSON.stringify(settled?.map((r) => r.status)));
      }

      // Recording money as received is a finance act, and the app agrees:
      // finance.invoices.manage defaults to finance and super_admin, the panel
      // hides every control without it, and updateInstallment refuses without
      // it. markInstallmentPaid did not check at all — it wrote the same
      // fields by another route — so the guard is asserted here.
      //
      // RLS is a separate question and deliberately not asserted: policy
      // "invoice_installments_write" (migration 0056) grants processing write
      // access, citing the Consultancy Fee module's stated role list, so the
      // database and the permission defaults disagree about processing. That
      // is a business decision, not something this check should assume — what
      // it does pin is that the two halves of the app agree with each other.
      console.log("\n--- who may record a payment ---");
      const financeOnly = await fx.staff("invnofin", ["counselor"]);
      const asCounselor = await apiAs(url, anonKey, financeOnly.email);
      const target = (await installmentsOf(invoice.id))[2];
      const attempt = await asCounselor.from("invoice_installments")
        .update({ status: "paid", amount_paid: target.amount }).eq("id", target.id).select("id");
      const afterAttempt = (await installmentsOf(invoice.id))[2];
      ok("a counselor cannot settle an installment through the API",
        afterAttempt.status !== "paid" && (attempt.data?.length ?? 0) === 0,
        `rows=${attempt.data?.length ?? 0} status=${afterAttempt.status}`);

      // --------------------------------------------------------- deleting
      console.log("\n--- deleting it ---");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Invoice");
      page.once("dialog", (d) => d.accept());
      const del = page.getByRole("button", { name: "🗑️ Delete invoice", exact: true }).first();
      ok("Super Admin is offered the delete", (await del.count()) > 0);
      if (await del.count()) {
        await del.click();
        let gone = false;
        for (let i = 0; i < 30; i++) {
          const { count } = await admin.from("invoices")
            .select("id", { count: "exact", head: true }).eq("id", invoice.id);
          if (count === 0) { gone = true; break; }
          await page.waitForTimeout(1000);
        }
        ok("deleting removes the invoice", gone,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        const left = await installmentsOf(invoice.id);
        ok("...and its installments with it", left.length === 0, `${left.length} left behind`);
      }
    }
  }

  await page.close();
} finally {
  if (studentId) {
    const { data: files } = await admin.storage.from("documents").list(`${studentId}/invoices`);
    if (files?.length) {
      await admin.storage.from("documents").remove(files.map((f) => `${studentId}/invoices/${f.name}`));
    }
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
  }
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
