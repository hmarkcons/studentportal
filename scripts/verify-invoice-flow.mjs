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
//   the receipt    a tokenised link is the one public, unauthenticated surface
//                  that serves a named person's financial document: it must
//                  open without a session, refuse a guess, refuse an expired
//                  link, die when a newer one is issued, and never be cached.
//   the portal     what the student is actually shown — the total, what they
//                  have paid, what is left, and when each instalment is due.
//   the cron       the daily overdue reminder emails students about money, so
//                  neither a plain run nor a dry one may be triggered by a
//                  stranger. Which invoices it picks and how often it may
//                  chase the same one are pure rules, covered by
//                  scripts/overdue-invoices-test.mjs.
//   deleting       the invoice and its installments together.
//
// The agreement is set up directly rather than through its own UI: it is the
// invoice under test here, and check:agreement already drives that path.
import { clients, fixtures, openBrowser, signIn, apiAs, requireConfirmation, BASE, FIXTURE_PASSWORD } from "./verify-portal-lib.mjs";

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

const PORTAL_EMAIL = "zztmp-invoice-student@hmark-test.local";
let studentId = null;
let portalUserId = null;

try {
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) {
    if (u.email === PORTAL_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }

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
      // Recording money as received is a finance act, and every layer has to
      // say so — not just the button. The app gates on finance.invoices.manage
      // (finance, super_admin); the RPCs that create and send an invoice raise
      // 'Only Finance/Super Admin'; and since 0255 the policies agree.
      //
      // Processing is the one worth naming. Five policies used to grant it
      // write access while no invoice control anywhere was reachable by it, so
      // it could not raise or send an invoice but could PATCH the rows
      // directly — change an amount, or mark money received.
      console.log("\n--- who may write to an invoice ---");
      const target = (await installmentsOf(invoice.id))[2];
      for (const role of ["counselor", "processing"]) {
        const who = await fx.staff(`invno${role.slice(0, 4)}`, [role]);
        const asThem = await apiAs(url, anonKey, who.email);

        const settle = await asThem.from("invoice_installments")
          .update({ status: "paid", amount_paid: target.amount }).eq("id", target.id).select("id");
        const afterSettle = (await installmentsOf(invoice.id))[2];
        ok(`a ${role} cannot settle an installment through the API`,
          afterSettle.status !== "paid" && (settle.data?.length ?? 0) === 0,
          `rows=${settle.data?.length ?? 0} status=${afterSettle.status}`);

        const repriced = await asThem.from("invoices")
          .update({ consultancy_fee: 1 }).eq("id", invoice.id).select("id");
        const { data: afterReprice } = await admin.from("invoices")
          .select("consultancy_fee").eq("id", invoice.id).single();
        ok(`...nor change what the student owes`,
          Number(afterReprice.consultancy_fee) === FEE && (repriced.data?.length ?? 0) === 0,
          `fee=${afterReprice.consultancy_fee} rows=${repriced.data?.length ?? 0}`);

        // Reading is untouched on purpose, and worth proving for processing:
        // 0255 must not read as locking the processing team out of the
        // students they handle. Not asserted for a counselor, who is excluded
        // from this student by invoices_select's staff_can_view_student — a
        // different rule, about whose students they are, that 0255 never
        // touched.
        if (role === "processing") {
          const { data: readable } = await asThem.from("invoices").select("id").eq("id", invoice.id).maybeSingle();
          ok("...but processing can still read it", Boolean(readable),
            "0255 locked the processing team out of their own students' invoices");
        }
      }

      // ------------------------------------------- the tokenised receipt
      // Students may have no portal login at all, so the receipt is reached
      // by an unguessable token with an expiry rather than a session. That
      // makes it the one public, unauthenticated surface in the system that
      // serves a named person's financial document.
      console.log("\n--- the receipt link ---");
      const asSuper = await apiAs(url, anonKey, sup.email);
      const { data: token, error: tokenError } = await asSuper.rpc("issue_receipt_token", {
        p_invoice_id: invoice.id, p_days: 90,
      });
      ok("a receipt token can be issued", Boolean(token), tokenError?.message ?? "");

      if (token) {
        const res = await fetch(`${BASE}/receipt/${token}`);
        const body = Buffer.from(await res.arrayBuffer());
        ok("the link opens the receipt with no session at all", res.status === 200, String(res.status));
        ok("...as a PDF", body.subarray(0, 4).toString() === "%PDF", body.subarray(0, 8).toString());
        ok("...shown in the tab rather than downloaded, named by the invoice number",
          (res.headers.get("content-disposition") ?? "").includes(`inline; filename="${invoice.invoice_number}.pdf"`),
          String(res.headers.get("content-disposition")));
        // No cookie is involved, so a shared cache holding this would serve
        // one student's invoice to whoever asked next.
        ok("...never cached by anything in between",
          /no-store/.test(res.headers.get("cache-control") ?? ""), String(res.headers.get("cache-control")));
        ok("...and kept out of search results",
          /noindex/.test(res.headers.get("x-robots-tag") ?? ""), String(res.headers.get("x-robots-tag")));

        const guessed = await fetch(`${BASE}/receipt/11111111-2222-3333-4444-555555555555`);
        ok("a guessed token opens nothing", guessed.status === 404, String(guessed.status));
        const junk = await fetch(`${BASE}/receipt/not-a-token`);
        ok("...and neither does a string that was never a token", junk.status === 404, String(junk.status));

        // Issuing a new link invalidates the one already in the student's
        // inbox — otherwise every receipt ever emailed stays live for 90 days.
        const { data: fresh } = await asSuper.rpc("issue_receipt_token", { p_invoice_id: invoice.id, p_days: 90 });
        ok("issuing a new link kills the previous one",
          (await fetch(`${BASE}/receipt/${token}`)).status === 404 && fresh !== token);
        ok("...and the new one works", (await fetch(`${BASE}/receipt/${fresh}`)).status === 200);

        await admin.from("invoices")
          .update({ receipt_token_expires_at: new Date(Date.now() - 86400_000).toISOString() })
          .eq("id", invoice.id);
        const expired = await fetch(`${BASE}/receipt/${fresh}`);
        const expiredText = await expired.text();
        ok("an expired link is refused, and says so", expired.status === 404 && /expired/i.test(expiredText),
          `${expired.status} ${expiredText.slice(0, 120)}`);
      }

      // ------------------------------------------- what the student sees
      console.log("\n--- the student's payments page ---");
      const { data: openedPortal } = await admin.from("leads").select("portal_active").eq("id", studentId).single();
      ok("a signed agreement has opened their portal", openedPortal.portal_active === true);

      const { data: made } = await admin.auth.admin.createUser({
        email: PORTAL_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true,
      });
      if (made?.user) {
        portalUserId = made.user.id;
        await admin.from("leads").update({ auth_user_id: portalUserId }).eq("id", studentId);

        const studentPage = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
        await studentPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
        await studentPage.fill('input[type="email"]', PORTAL_EMAIL);
        await studentPage.fill('input[type="password"]', FIXTURE_PASSWORD);
        await studentPage.click('button[type="submit"]');
        await studentPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
        await studentPage.goto(`${BASE}/portal/payments`, { waitUntil: "domcontentloaded" });
        const seen = await studentPage.locator("body").innerText();

        ok("the student can see the invoice", seen.includes(invoice.invoice_number),
          seen.replace(/\s+/g, " ").slice(0, 300));
        ok("...its total", /EUR 2,190\.00/.test(seen), seen.replace(/\s+/g, " ").slice(0, 400));
        // 930 of 2190 paid, so 1260 left.
        ok("...what they have paid", /EUR 930\.00/.test(seen));
        ok("...and what is left", /EUR 1,260\.00/.test(seen));
        ok("...told why the first instalment is the big one",
          /includes the EUR 300\.00 admin fee/.test(seen), seen.replace(/\s+/g, " ").slice(0, 600));

        // The last instalment has no date on purpose — it falls due on the
        // admission. This page did not select due_condition, so the one
        // instalment whose timing is most carefully explained everywhere else
        // was shown to the student as "No due date".
        ok("...and when the last instalment actually falls due",
          /admission approval from your first public university/i.test(seen)
          && !/No due date/.test(seen),
          seen.replace(/\s+/g, " ").slice(-500));

        await studentPage.close();
      }

      // ------------------------------------- the daily overdue reminder
      // The cron that chases unpaid instalments emails real students about
      // money, so the thing worth checking from outside is that a stranger
      // cannot make it do either of its jobs.
      //
      // All three cron routes once carried `if (process.env.CRON_SECRET &&
      // ...)`, which authenticates nothing while the variable is unset — and
      // it was unset. The dry run is the half that leaks: it names the
      // students it would chase. CRON_SECRET is set now, so both halves must
      // refuse. Which invoices it picks and how often it may chase the same
      // one are decided by computeInvoiceStatus and shouldSendOverdueReminder,
      // covered by scripts/overdue-invoices-test.mjs — they need no secret and
      // send no mail.
      console.log("\n--- the overdue reminder cron ---");
      const cron = `${BASE}/api/cron/overdue-invoices`;
      for (const [label, suffix] of [["a plain run", ""], ["a dry run", "?dry=1"]]) {
        const res = await fetch(`${cron}${suffix}`);
        ok(`${label} is refused without the secret`, res.status === 401,
          `${res.status} ${(await res.text()).slice(0, 160)}`);
      }
      const wrong = await fetch(cron, { headers: { authorization: "Bearer not-the-secret" } });
      ok("...and refused with the wrong one", wrong.status === 401, String(wrong.status));
      const guessy = await fetch(`${cron}?dry=1`, { headers: { authorization: "Bearer not-the-secret" } });
      const guessyBody = await guessy.text();
      ok("...without naming a single student on the way out",
        guessy.status === 401 && !guessyBody.includes("zztmp"), `${guessy.status} ${guessyBody.slice(0, 160)}`);

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
  // After the lead, not before: leads.auth_user_id still references this login
  // until the lead goes, so deleting it first fails and the catch hides that.
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
