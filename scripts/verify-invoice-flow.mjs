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
//   an added item  a product put on the invoice after it was raised. It is
//                  taxed at the invoice's rate and the schedule is re-priced
//                  to collect it: on the first instalment while nothing is
//                  paid, on the next unpaid one once money has come in, and
//                  removing it undoes exactly that. The student sees it on
//                  their Payments page. The row used to be written and shown
//                  on the staff card and nowhere else.
//   sending        the status is written only after the mail actually goes —
//                  it used to be stamped regardless, so the CRM reported
//                  invoices as delivered that nobody had received.
//   payment        marking an installment paid, and what the invoice then
//                  reports as paid and outstanding.
//   a part payment splitting an installment: what was paid is closed off at
//                  that amount and the balance becomes an installment of its
//                  own, with a due date so something chases it. The rule is
//                  unit-tested; what is checked here is the write — the
//                  renumbering, the trace of where the balance came from, and
//                  that the schedule still adds up to what the student owes.
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
//   the generator  the other way in, at /finance/invoice-generator: a discount,
//                  an instalment count up to 24 rather than a choice of three,
//                  and a live preview. The preview's figures are read off the
//                  screen and compared with what was written, since "computed
//                  once, printed in four places" is the claim the module rests
//                  on and recomputing them here would only restate the formula.
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
      // Every column, deliberately. Naming them cost three assertions that
      // silently read undefined and reported the app broken when it was not —
      // an assertion that passes or fails on a column nobody selected is worse
      // than no assertion. These read one fixture row; there is nothing to save.
      .select("*")
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
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("installment_no");
  return data ?? [];
};

/**
 * Picks a student in the Invoice Generator and waits for the form to appear.
 *
 * The picker is a React-controlled <select>: selecting an option only reveals
 * the form once the page has hydrated and the change handler is listening. A
 * single selectOption straight after a navigation sets the DOM value, nobody
 * hears it, and the next line then waits thirty seconds for a field that will
 * never render — which is exactly what skipped the last three sections of this
 * script. So the selection is repeated until the form is actually there.
 */
const pickStudentInGenerator = async (page, studentId, seconds = 30) => {
  const picker = page.locator("select").first();
  for (let waited = 0; waited < seconds; waited += 3) {
    await picker.selectOption(studentId).catch(() => {});
    try {
      await page.locator('input[name="consultancy_fee"]').waitFor({ state: "visible", timeout: 3000 });
      return true;
    } catch {
      // Not hydrated yet. Try again rather than assume the page is broken.
    }
  }
  return false;
};

const lineItemsOf = async (invoiceId) => {
  const { data } = await admin.from("invoice_line_items").select("*").eq("invoice_id", invoiceId);
  return data ?? [];
};

// Waits for the line-item table to hold `n` rows for the invoice. The
// instalments are re-priced in the same transaction, so once the row is there
// the schedule can be read straight away.
const waitForLineItems = async (page, invoiceId, n, seconds = 30) => {
  for (let i = 0; i < seconds; i++) {
    const rows = await lineItemsOf(invoiceId);
    if (rows.length === n) return rows;
    await page.waitForTimeout(1000);
  }
  return null;
};

// Adds a custom item through the card's "+ Add item" form. `placement` is the
// visible label of an option in the "on" dropdown — "Instalment 2", "Divide
// equally" — or null to accept whatever it opens on, which is the next
// instalment due. Returns the line item rows afterwards, or null if the row
// never appeared.
const addItemViaCard = async (page, invoiceId, name, amount, expectCount, placement = null) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expand(page, "Invoice");
  const button = page.getByRole("button", { name: "+ Add item" }).first();
  if ((await button.count()) === 0) return { offered: false, rows: null, opened: null };
  const form = page.locator("form").filter({ has: button }).first();
  const select = form.locator('select[name="placement"]');
  // What it opens on, before anything is chosen — the default staff get.
  const opened = (await select.count()) ? await select.locator("option:checked").innerText() : null;
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="amount"]').fill(String(amount));
  if (placement) await select.selectOption({ label: placement });
  await button.click();
  return { offered: true, rows: await waitForLineItems(page, invoiceId, expectCount), opened };
};

// Removes an item by the Remove button on its own row, not the first Remove
// on the page — the student page has other sections with one.
const removeItemViaCard = async (page, invoiceId, name, amount, currency, expectCount) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expand(page, "Invoice");
  const rowText = page.getByText(`${name} — ${currency} ${amount.toFixed(2)}`, { exact: true });
  if ((await rowText.count()) === 0) return { offered: false, rows: null };
  const remove = rowText.locator("..").getByRole("button", { name: "Remove" });
  if ((await remove.count()) === 0) return { offered: false, rows: null };
  await remove.click();
  return { offered: true, rows: await waitForLineItems(page, invoiceId, expectCount) };
};

// Italy (Public): a public track, so EUR and a public-university condition.
const FEE = 1800;
const ADMIN_CHARGE = 300;
// 5% of the whole invoice since migration 0258, administrative charge
// included: 5% of 2100 is 105, so the student owes 2205.
const TAX = 105;
const TOTAL = FEE + ADMIN_CHARGE + TAX;
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
    // One administrative fee per country now, so the field is named for the
    // destination. The prefix matches both it and the single legacy field.
    await form.locator('input[name^="admin_charge"]').first().fill(String(ADMIN_CHARGE));
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
      // 5% of the whole invoice — the fee AND the administrative charge, which
      // the tax used to skip. 5% of 2100 is 105.
      ok("...SRB tax charged on the whole invoice, administrative charge included",
        Number(invoice.tax_rate) === 5 && Number(invoice.tax_amount) === 105,
        `rate=${invoice.tax_rate} amount=${invoice.tax_amount}`);
      ok("...and stamped with the rule that priced it, so it can be reprinted",
        invoice.tax_base === "total", String(invoice.tax_base));

      const parts = await installmentsOf(invoice.id);
      const amounts = parts.map((p) => Number(p.amount));
      ok("...split into three installments", parts.length === 3, `${parts.length}`);
      // 1800 plus the 90 of tax that belongs to the fee is 1890, in three =
      // 630 each. The first also carries the 300 administrative charge and the
      // 15 of tax that belongs to it, because that is how it is collected.
      ok("...with the administrative charge and its tax on the first one",
        JSON.stringify(amounts) === JSON.stringify([945, 630, 630]), JSON.stringify(amounts));
      ok("...summing to the total the student owes",
        amounts.reduce((a, b) => a + b, 0) === TOTAL, String(amounts.reduce((a, b) => a + b, 0)));

      ok("...the first due on the date given", parts[0]?.due_date === FIRST_DUE, String(parts[0]?.due_date));
      ok("...the second a month later", parts[1]?.due_date === "2026-11-05", String(parts[1]?.due_date));
      // Nobody knows in October when a Milan admission lands, and a date the
      // office invents is one the student quotes back at them later.
      ok("...and the last on the admission, not a date",
        parts[2]?.due_date === null && /public university/.test(parts[2]?.due_condition ?? ""),
        `date=${parts[2]?.due_date} condition=${parts[2]?.due_condition}`);

      // ------------------------------------------------------------ the PDF
      // Raising an invoice produces the document, without anyone pressing a
      // button: "View invoice" used to be absent on a brand new invoice, and
      // the first student to open a receipt link paid for the render.
      console.log("\n--- the PDF ---");
      ok("the PDF is built automatically when the invoice is raised",
        (await waitForInvoice(page, studentId, (i) => i.pdf_path, 90)) !== null,
        "no pdf_path appeared without pressing Generate PDF");

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

      // ------------------------------------------------------ an added item
      // A product from the fee catalog, or a custom charge, put on the invoice
      // after it was raised. The row used to be written and shown on the
      // staff card and nowhere else: the schedule was not re-priced, so
      // paid/outstanding (derived from the instalments) never included it; the
      // PDF and the email never read the table; and the student could not
      // read it at all. Now it is taxed at the invoice's rate and collected
      // with the first instalment, like the administrative charge.
      //
      // Added and then removed, so the rest of this run proceeds from the
      // figures it was written against — and because removal has to undo
      // exactly what adding did.
      console.log("\n--- an added item ---");
      const ITEM = { name: "zztmp Courier", amount: 100 };
      {
        const added = await addItemViaCard(page, invoice.id, ITEM.name, ITEM.amount, 1);
        ok("an item can be added to the invoice", added.offered,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        // Staff are asked where it goes, and the dropdown opens on the next
        // instalment due rather than making them pick every time.
        ok("...after being asked which instalment it goes on, defaulting to the next due",
          /Instalment 1.*next due/i.test(added.opened ?? ""), String(added.opened));
        ok("...and is recorded", added.rows !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

        if (added.rows) {
          ok("...at the amount entered, under the name given",
            Number(added.rows[0].amount) === ITEM.amount && added.rows[0].name === ITEM.name,
            JSON.stringify(added.rows[0]));

          // 100 plus 5% tax is 105, on the first instalment alongside the
          // administrative charge and its own tax.
          const withItem = await installmentsOf(invoice.id);
          const amounts = withItem.map((p) => Number(p.amount));
          ok("the schedule is re-priced to collect it with the first instalment",
            JSON.stringify(amounts) === JSON.stringify([1050, 630, 630]), JSON.stringify(amounts));
          ok("...recording how much of that instalment is the item",
            Number(withItem[0]?.extras_amount) === 105 && withItem.slice(1).every((p) => Number(p.extras_amount) === 0),
            JSON.stringify(withItem.map((p) => p.extras_amount)));
          ok("...and the tax on record now includes the tax on the item",
            (await waitForInvoice(page, studentId, (i) => Number(i.tax_amount) === 110, 5)) !== null,
            String((await waitForInvoice(page, studentId, () => true, 1))?.tax_amount));

          // The card, once the page has caught up with the write.
          let card = "";
          for (let i = 0; i < 30; i++) {
            card = (await page.locator("body").innerText()).replace(/\s+/g, " ");
            if (/EUR 2310\.00/.test(card)) break;
            await page.waitForTimeout(1000);
          }
          // Anchored to the invoice number, which is what the header prints
          // the total beside. Matching "EUR 2310.00" anywhere on the page
          // passed while the header itself was wrong, because the Outstanding
          // tile happens to show the same figure — an assertion that can pass
          // on a coincidence is worse than none.
          // \s* rather than \s+: JSX strips the newline between the invoice
          // number's span and the currency, so innerText runs them together.
          ok("the card's total includes the item and its tax",
            new RegExp(`${invoice.invoice_number}\\s*EUR 2310\\.00`).test(card),
            // The card, not the top of the page — the header above it is the
            // student's own name and code, which says nothing about this.
            card.slice(card.indexOf(invoice.invoice_number), card.indexOf(invoice.invoice_number) + 300));
          ok("...names the item", card.includes(`${ITEM.name} — EUR 100.00`), card.slice(-600));
          ok("...and says the first instalment carries it",
            /includes the EUR 315\.00 admin fee and its tax and EUR 105\.00 for added items/.test(card), card.slice(-600));

          // Rebuilt with the item on it, the receipt lists it as its own row.
          // The file is upserted at the same path, so the thing to poll for is
          // the storage object's timestamp moving, not the path appearing.
          const rebuild = page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
          if (await rebuild.count()) {
            const folder = `${studentId}/invoices`;
            const stampOf = async () => {
              const { data } = await admin.storage.from("documents").list(folder);
              return data?.find((f) => f.name === `${invoice.id}.pdf`)?.updated_at ?? null;
            };
            const before = await stampOf();
            await rebuild.click();
            let rebuilt = false;
            for (let i = 0; i < 60; i++) {
              const now = await stampOf();
              if (now && now !== before) { rebuilt = true; break; }
              await page.waitForTimeout(1000);
            }
            ok("the PDF is rebuilt with the item on it", rebuilt, `before=${before} after=${await stampOf()}`);
            const { data: file } = await admin.storage.from("documents").download(`${folder}/${invoice.id}.pdf`);
            const bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
            // react-pdf compresses the page stream, so the text is not
            // greppable from here; what can be checked is that a real PDF
            // came back. The rows it prints are read from the same line-item
            // query as the email and the Payments page.
            ok("...and is still a real PDF", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF",
              bytes ? `${bytes.length} bytes` : "no file");
          }

          const removed = await removeItemViaCard(page, invoice.id, ITEM.name, ITEM.amount, "EUR", 0);
          ok("...and can be removed again", removed.offered);
          ok("removing the item takes it off the invoice", removed.rows !== null,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
          const restored = (await installmentsOf(invoice.id));
          ok("...and the schedule returns to exactly what it was",
            JSON.stringify(restored.map((p) => Number(p.amount))) === JSON.stringify([945, 630, 630])
            && restored.every((p) => Number(p.extras_amount) === 0),
            JSON.stringify(restored.map((p) => [Number(p.amount), Number(p.extras_amount)])));
          ok("...with the tax back to the fee and the administrative charge",
            (await waitForInvoice(page, studentId, (i) => Number(i.tax_amount) === TAX, 5)) !== null);
        }

        // The other answer staff can give: divide it across the plan instead
        // of loading it onto one payment. 105 over three is 35 each.
        const spread = await addItemViaCard(page, invoice.id, ITEM.name, ITEM.amount, 1, "Divide equally");
        ok("an item can be divided equally across the instalments instead", spread.rows !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        if (spread.rows) {
          const divided = await installmentsOf(invoice.id);
          ok("...so every instalment carries the same share of it",
            JSON.stringify(divided.map((p) => Number(p.amount))) === JSON.stringify([980, 665, 665])
            && divided.every((p) => Number(p.extras_amount) === 35),
            JSON.stringify(divided.map((p) => [Number(p.amount), Number(p.extras_amount)])));
          ok("...and the schedule still sums to what is owed",
            Math.round(divided.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100 === 2310,
            String(divided.reduce((s, r) => s + Number(r.amount), 0)));
          await removeItemViaCard(page, invoice.id, ITEM.name, ITEM.amount, "EUR", 0);
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
        ok("...for its full amount", Number(settled?.[0]?.amount_paid) === 945,
          String(settled?.[0]?.amount_paid));
        ok("...leaving the other two outstanding",
          settled?.slice(1).every((r) => r.status !== "paid"),
          JSON.stringify(settled?.map((r) => r.status)));
      }

      // ------------------------------------ an item added after a payment
      // A settled instalment is a record of money that changed hands, so an
      // item added now cannot go on the first one. It lands on the next unpaid
      // instalment, which then says so — and removing it comes off that same
      // instalment, not the first unpaid one at random.
      console.log("\n--- an item added after a payment ---");
      {
        const LATER = { name: "zztmp Translation", amount: 100 };
        // Explicitly on the third, not the one it would have defaulted to —
        // the point of asking staff is that the answer is honoured.
        const added = await addItemViaCard(page, invoice.id, LATER.name, LATER.amount, 1, "Instalment 3");
        ok("an item can still be added once money has come in", added.offered && added.rows !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        ok("...and the paid instalment is not even offered, the next due is",
          /Instalment 2.*next due/i.test(added.opened ?? ""), String(added.opened));
        if (added.rows) {
          const shifted = await installmentsOf(invoice.id);
          ok("the paid first instalment is left exactly as it was",
            Number(shifted[0]?.amount) === 945 && shifted[0]?.status === "paid" && Number(shifted[0]?.extras_amount) === 0,
            JSON.stringify(shifted[0]));
          ok("...the instalment staff did not choose is untouched too",
            Number(shifted[1]?.amount) === 630 && Number(shifted[1]?.extras_amount) === 0,
            JSON.stringify(shifted[1]));
          ok("...and the item lands on the one they did choose, with its tax",
            Number(shifted[2]?.amount) === 735 && Number(shifted[2]?.extras_amount) === 105,
            JSON.stringify(shifted[2]));
          ok("...so the schedule still sums to what is owed",
            Math.round(shifted.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100 === 2310,
            String(shifted.reduce((s, r) => s + Number(r.amount), 0)));

          // The database refuses what the app never asks for: re-pricing an
          // instalment with a payment on it. Checked against the RPC directly.
          const asSuperItems = await apiAs(url, anonKey, sup.email);
          const repriced = await asSuperItems.rpc("apply_invoice_line_item_change", {
            p_invoice_id: invoice.id,
            p_add: { product_id: null, name: "zztmp Should Fail", amount: 1 },
            p_delete_id: null,
            p_installments: [{ id: shifted[0].id, amount: 1, extras_amount: 0 }],
            p_tax_amount: 95,
          });
          ok("the database refuses to re-price a paid instalment, whatever the app asks",
            Boolean(repriced.error) && /payment recorded/.test(repriced.error?.message ?? ""),
            JSON.stringify(repriced.error?.message ?? repriced.data));
          ok("...and writes nothing when it refuses", (await lineItemsOf(invoice.id)).length === 1
            && Number((await installmentsOf(invoice.id))[0].amount) === 945);

          const removed = await removeItemViaCard(page, invoice.id, LATER.name, LATER.amount, "EUR", 0);
          ok("removing it comes off the instalment that carried it, not another", removed.rows !== null
            && JSON.stringify((await installmentsOf(invoice.id)).map((p) => [Number(p.amount), Number(p.extras_amount)]))
              === JSON.stringify([[945, 0], [630, 0], [630, 0]]),
            JSON.stringify((await installmentsOf(invoice.id)).map((p) => [Number(p.amount), Number(p.extras_amount)])));
        }
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

      // ------------------------------------- a part payment, and its balance
      // A student pays some of an instalment. Left as 'partial' the remainder
      // had no due date of its own, so nothing chased it: the overdue cron
      // cannot see an instalment without a date, and the student was never
      // told when the rest was expected. So the instalment is closed off at
      // what was actually paid and the balance becomes an instalment in its
      // own right, a week later unless staff choose otherwise.
      //
      // The rule is unit-tested (partial-payment-test.mjs). What is checked
      // here is the write: the renumbering, and that the schedule still adds
      // up to what the student owes.
      console.log("\n--- a part payment ---");
      const PAID_DATE = "2026-10-10";
      const PART = 200;

      const before = await installmentsOf(invoice.id);
      const second = before[1];
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Invoice");
      // The pencil on each instalment row opens its editor.
      const pencils = page.getByRole("button", { name: "✏️", exact: true });
      ok("an instalment can be edited", (await pencils.count()) >= 2, `${await pencils.count()} found`);

      if ((await pencils.count()) >= 2) {
        await pencils.nth(1).click();
        const editor = page.locator("form").filter({ has: page.locator('select[name="status"]') }).first();
        await editor.locator('select[name="status"]').selectOption("partial");
        await editor.locator('input[name="amount_paid"]').fill(String(PART));
        await editor.locator('input[name="paid_date"]').fill(PAID_DATE);

        // The balance date defaults to a week after the payment, filled in by
        // the form rather than left for staff to work out.
        const defaulted = await editor.locator('input[name="balance_due_date"]').inputValue();
        ok("...and the balance is dated a week later by default", defaulted === "2026-10-17", defaulted);

        await editor.getByRole("button", { name: /^Save$/ }).click();

        let split = null;
        for (let i = 0; i < 30; i++) {
          const rows = await installmentsOf(invoice.id);
          if (rows.length === before.length + 1) { split = rows; break; }
          await page.waitForTimeout(1000);
        }
        ok("the instalment splits in two", split !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

        if (split) {
          const paidPart = split.find((r) => r.installment_no === second.installment_no);
          const balance = split.find((r) => r.installment_no === second.installment_no + 1);

          ok("...what was paid is closed off at that amount",
            Number(paidPart.amount) === PART && paidPart.status === "paid"
            && Number(paidPart.amount_paid) === PART,
            JSON.stringify(paidPart));
          ok("...the rest becomes an instalment of its own",
            Number(balance.amount) === Number(second.amount) - PART && balance.status === "unpaid",
            JSON.stringify(balance));
          // The whole point of the split: something has to chase the balance.
          ok("...with a due date, so the overdue cron can see it",
            balance.due_date === "2026-10-17", String(balance.due_date));
          ok("...saying where it came from",
            balance.carried_from_installment_no === second.installment_no
            && Number(balance.carried_part_paid) === PART
            && balance.carried_paid_date === PAID_DATE,
            JSON.stringify(balance));

          // The instalment that waits on the admission was after the one that
          // split, so it has been renumbered. It must not have lost what makes
          // it different from the others.
          const waiting = split.find((r) => r.due_condition);
          ok("...and the admission instalment survives the renumbering",
            Boolean(waiting) && waiting.due_date === null
            && waiting.installment_no === split.length,
            JSON.stringify(waiting));
          ok("...numbered 1..n with no gaps or repeats",
            JSON.stringify(split.map((r) => r.installment_no))
            === JSON.stringify(split.map((_, i) => i + 1)),
            JSON.stringify(split.map((r) => r.installment_no)));

          // The invariant that matters: splitting moves money between rows, it
          // never creates or destroys any.
          const sum = split.reduce((s, r) => s + Number(r.amount), 0);
          ok("...and the schedule still adds up to what the student owes",
            sum === TOTAL, `${sum} vs ${TOTAL}`);

          // Both refusals are enforced in the RPC as well as the form, so the
          // database is checked directly rather than the message being taken
          // on trust.
          const whole = split.find((r) => r.status === "unpaid");
          const asSuperRpc = await apiAs(url, anonKey, sup.email);
          const full = await asSuperRpc.rpc("split_partial_installment", {
            p_installment_id: whole.id ?? balance.id, p_amount_paid: Number(whole.amount),
            p_paid_date: PAID_DATE, p_balance_due_date: "2026-10-20", p_payment_method: "Cash",
          });
          ok("paying the whole instalment is not a part payment, says the database",
            Boolean(full.error), JSON.stringify(full.error?.message ?? full.data));
          const nothing = await asSuperRpc.rpc("split_partial_installment", {
            p_installment_id: whole.id ?? balance.id, p_amount_paid: 0,
            p_paid_date: PAID_DATE, p_balance_due_date: "2026-10-20", p_payment_method: "Cash",
          });
          ok("...and neither is nothing", Boolean(nothing.error),
            JSON.stringify(nothing.error?.message ?? nothing.data));
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
      // With an item on the invoice this time, and left there: the student
      // could not read invoice_line_items at all before 0256, so the item
      // appearing on their page is the policy working, and the totals moving
      // with it is the arithmetic being the same one everywhere else.
      //
      // The schedule now is: 1 paid 945, 2 paid 200, 3 the 430 balance, 4 the
      // 630 that waits on the admission. The item's 105 lands on 3.
      console.log("\n--- the student's payments page ---");
      {
        const added = await addItemViaCard(page, invoice.id, ITEM.name, ITEM.amount, 1);
        const carried = (await installmentsOf(invoice.id)).find((p) => p.installment_no === 3);
        ok("an item added after a part payment lands on the balance instalment",
          added.rows !== null && Number(carried?.amount) === 535 && Number(carried?.extras_amount) === 105,
          JSON.stringify(carried));
        // 945 settled, then 200 of the 630 second instalment part-paid: the
        // balance instalment is 430, and the item puts 105 on top of it.
      }
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
        // 2,205 for the fee, the admin charge and the 5% on both, plus the 100
        // item and the 5 of tax on it.
        ok("...its total, including the added item and its tax", /Total\s+EUR 2,310\.00/.test(seen),
          seen.replace(/\s+/g, " ").slice(0, 400));
        ok("...the item itself, on a line of its own",
          new RegExp(`${ITEM.name}\\s+EUR 100\\.00`).test(seen), seen.replace(/\s+/g, " ").slice(0, 600));
        ok("...with the tax charged on the whole invoice", /SRB tax · 5%\s+EUR 110\.00/.test(seen),
          seen.replace(/\s+/g, " ").slice(0, 600));
        // Anchored to the labels. A bare amount also appears in the instalment
        // list, so matching the number alone passed while reading the wrong
        // figure entirely.
        //
        // 945 settled in full plus the 200 that part-paid the second
        // instalment: 1,145 of 2,310, leaving 1,165.
        ok("...what they have paid", /Paid\s*-?\s*EUR 1,145\.00/.test(seen),
          seen.replace(/\s+/g, " ").slice(0, 500));
        ok("...and what is left", /Balance\s+EUR 1,165\.00/.test(seen),
          seen.replace(/\s+/g, " ").slice(0, 500));
        ok("...told why the first instalment is the big one",
          /includes the EUR 315\.00 admin fee and its tax/.test(seen), seen.replace(/\s+/g, " ").slice(0, 600));
        ok("...and why the balance instalment grew",
          /includes EUR 105\.00 for added items/.test(seen), seen.replace(/\s+/g, " ").slice(-800));
        ok("...with no warning that the breakdown and the schedule disagree",
          !/don.t currently add up/.test(seen), seen.replace(/\s+/g, " ").slice(0, 800));

        // The last instalment has no date on purpose — it falls due on the
        // admission. This page did not select due_condition, so the one
        // instalment whose timing is most carefully explained everywhere else
        // was shown to the student as "No due date".
        ok("...where the extra instalment on their schedule came from",
          /Balance carried from instalment 2|Balance carried from installment 2/i.test(seen),
          seen.replace(/s+/g, " ").slice(-600));

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
        const items = await lineItemsOf(invoice.id);
        ok("...and its added items", items.length === 0, `${items.length} left behind`);
      }
    }

    // ================================================ the Invoice Generator
    // The other way in. It carries what the student-page panel does not — a
    // discount, an instalment count up to 24 rather than a choice of three,
    // and a live preview of the breakdown.
    //
    // Run last, once the first invoice has been deleted, so this student has
    // exactly one again.
    //
    // The preview is the thing worth checking here. The claim the whole module
    // rests on is that the figures are computed once and printed in four
    // places — this page, the stored instalments, the PDF and the email — so
    // the numbers are read off the screen and compared against what was
    // written, rather than both being recomputed here from the same formula
    // this script would have to duplicate.
    console.log("\n--- the Invoice Generator ---");
    const GEN = { fee: 2000, admin: 300, discount: 150, reason: "zztmp early registration", count: 9 };

    await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
    const picker = page.locator("select").first();
    ok("the generator lists registered students", (await picker.count()) > 0);

    // By value: the option's value is the student id, and its label carries
    // their country and intake, so matching on text is needlessly brittle.
    const picked = await pickStudentInGenerator(page, studentId);
    ok("...and opens the form once one is picked", picked,
      (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400));

    if (picked) {
      await page.locator('input[name="consultancy_fee"]').fill(String(GEN.fee));
      await page.locator('input[name^="admin_charge"]').first().fill(String(GEN.admin));
      await page.locator('input[name="discount_amount"]').fill(String(GEN.discount));
      await page.locator('input[name="discount_reason"]').fill(GEN.reason);
      await page.locator('input[name="installment_count"]').fill(String(GEN.count));
      await page.locator('input[name="first_due_date"]').fill(FIRST_DUE);

      const preview = page.locator("div").filter({ hasText: /Invoice preview/ }).last();
      const shown = (await preview.innerText()).replace(/−/g, "-");

      // 2000 less a 150 discount is 1850; plus the 300 administrative fee is
      // 2150, and 5% of that is 107.50.
      ok("the preview shows the discount coming off the fee first",
        /Net consultancy fee\s+EUR 1,850\.00/.test(shown), shown.replace(/\s+/g, " ").slice(0, 400));
      ok("...the tax charged on the discounted total, not on the whole fee",
        /SRB tax \(5% of EUR 2,150\.00\)\s+EUR 107\.50/.test(shown), shown.replace(/\s+/g, " ").slice(0, 400));
      ok("...and the discount reason beside it",
        shown.includes(GEN.reason), shown.replace(/\s+/g, " ").slice(0, 400));
      ok("...totalling the fee, its tax and the administrative charge",
        /Total payable\s+EUR 2,257\.50/.test(shown), shown.replace(/\s+/g, " ").slice(0, 400));

      // "9 installments of EUR 515.83 + EUR 215.83 + ... + EUR 215.86"
      const previewed = [...shown.matchAll(/EUR ([\d,]+\.\d{2})/g)]
        .map((m) => Number(m[1].replace(/,/g, "")))
        .slice(-GEN.count);
      ok(`...and the ${GEN.count} instalments it would write`, previewed.length === GEN.count,
        JSON.stringify(previewed));

      await page.getByRole("button", { name: "Generate invoice" }).click();

      const made = await waitForInvoice(page, studentId, (i) => i.id);
      ok("an invoice is generated from this page", made !== null,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

      if (made) {
        ok("...with the discount and its reason recorded",
          Number(made.discount_amount) === GEN.discount && made.discount_reason === GEN.reason,
          `${made.discount_amount} / ${made.discount_reason}`);
        ok("...and the tax the preview showed",
          Number(made.tax_amount) === 107.5, String(made.tax_amount));

        const written = (await installmentsOf(made.id)).map((r) => Number(r.amount));
        ok("...the instalments written are exactly the ones previewed",
          JSON.stringify(written) === JSON.stringify(previewed),
          `previewed ${JSON.stringify(previewed)} vs written ${JSON.stringify(written)}`);

        // 1942.50 over nine does not divide evenly. The parts must still sum
        // to the whole, so the remainder lands on the last one rather than
        // leaving the invoice a few cents short of ever reading as paid.
        const sum = Math.round(written.reduce((a, b) => a + b, 0) * 100) / 100;
        ok("...summing exactly to the total, despite not dividing evenly",
          sum === 2257.5, `${sum}`);
        // The administrative charge brings its own 5% with it now, so the
        // first instalment is bigger than the others by 300 plus 15.
        ok("...with the administrative charge and its tax on the first",
          written[0] === Math.round((written[1] + GEN.admin * 1.05) * 100) / 100,
          `${written[0]} vs ${written[1]} + ${GEN.admin} + tax`);
        ok("...and the rounding remainder on the last",
          written[written.length - 1] !== written[1],
          `last ${written[written.length - 1]}, middle ${written[1]}`);
      }

      // A discount bigger than the fee would invert the invoice. The button
      // refuses before the server has to.
      await page.locator('input[name="discount_amount"]').fill(String(GEN.fee + 1));
      const submit = page.getByRole("button", { name: "Generate invoice" });
      ok("a discount larger than the fee cannot be submitted", await submit.isDisabled());
      ok("...and says why", /Discount cannot exceed the consultancy fee/.test(
        await page.locator("body").innerText()));
    }

    // ============================================== a backup country's fee
    // A student registers for one primary country and up to three backups,
    // and a backup's agreement is administrative-fee only — so the office
    // charges one consultancy fee and one administrative fee PER COUNTRY.
    // The invoice had a single admin_charge column and no idea which country
    // any of it was for, so a student with a backup was either under-billed
    // or handed a lump sum their own agreements did not explain.
    console.log("\n--- a backup country's administrative fee ---");
    await admin.from("invoices").delete().eq("student_id", studentId);

    const { data: backupDest } = await admin.from("destinations")
      .select("id, display_name").neq("id", italy.id).not("display_name", "is", null)
      .order("display_name").limit(1).single();
    await admin.from("lead_destinations")
      .insert({ lead_id: studentId, destination_id: backupDest.id, is_backup: true });

    await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
    ok("the generator opens for a student with a backup country",
      await pickStudentInGenerator(page, studentId),
      (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400));

    const primaryField = page.locator(`input[name="admin_charge__${italy.id}"]`);
    const backupField = page.locator(`input[name="admin_charge__${backupDest.id}"]`);
    ok("the generator asks for an administrative fee for the primary country",
      (await primaryField.count()) === 1,
      (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600));
    ok("...and a separate one for the backup country", (await backupField.count()) === 1);

    const labels = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok("...each named for the country it is for",
      labels.includes(`Administrative fee — Italy (Public)`)
      && labels.includes(`Administrative fee — ${backupDest.display_name}`),
      labels.slice(0, 900));

    if ((await backupField.count()) === 1) {
      const PRIMARY_ADMIN = 300;
      const BACKUP_ADMIN = 150;
      await page.locator('input[name="consultancy_fee"]').fill("1800");
      await page.locator('input[name="discount_amount"]').fill("0");
      await page.locator('input[name="installment_count"]').fill("3");
      await page.locator('input[name="first_due_date"]').fill(FIRST_DUE);
      await primaryField.fill(String(PRIMARY_ADMIN));
      await backupField.fill(String(BACKUP_ADMIN));

      const previewText = (await page.locator("div").filter({ hasText: /Invoice preview/ }).last().innerText())
        .replace(/\s+/g, " ");
      // 1800 fee + 450 of administrative fees = 2250 taxable, 5% is 112.50.
      ok("the preview totals both countries' administrative fees",
        /Total payable EUR 2,362\.50/.test(previewText), previewText.slice(0, 700));

      await page.getByRole("button", { name: "Generate invoice" }).click();
      const multi = await waitForInvoice(page, studentId, (i) => i.id);
      ok("an invoice is raised for a student with a backup country", multi !== null,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-400));

      if (multi) {
        ok("...charging the sum of both administrative fees",
          Number(multi.admin_charge) === PRIMARY_ADMIN + BACKUP_ADMIN, String(multi.admin_charge));

        const { data: breakdown } = await admin.from("invoice_admin_charges")
          .select("*").eq("invoice_id", multi.id).order("sort_order");
        ok("...recorded as one charge per country", (breakdown ?? []).length === 2,
          JSON.stringify((breakdown ?? []).map((b) => [b.country_label, b.amount, b.is_backup])));
        ok("...the primary first, named and priced",
          breakdown?.[0]?.country_label === "Italy (Public)"
          && Number(breakdown[0].amount) === PRIMARY_ADMIN && breakdown[0].is_backup === false,
          JSON.stringify(breakdown?.[0]));
        ok("...and the backup marked as one",
          breakdown?.[1]?.country_label === backupDest.display_name
          && Number(breakdown[1].amount) === BACKUP_ADMIN && breakdown[1].is_backup === true,
          JSON.stringify(breakdown?.[1]));

        // The whole point of the breakdown: it is a statement about the same
        // money, so the database refuses one that says otherwise.
        const asSuperAdmin = await apiAs(url, anonKey, sup.email);
        const lying = await asSuperAdmin.rpc("generate_invoice", {
          p_student_id: studentId, p_agreement_id: null, p_admin_charge: 450, p_consultancy_fee: 1000,
          p_currency: "EUR", p_intake: null, p_terms: null, p_invoice_number: "zztmp-should-not-exist",
          p_installment_plan: null, p_installments: [], p_discount_amount: 0, p_discount_reason: null,
          p_tax_rate: 5, p_tax_amount: 50,
          p_admin_charges: [{ destination_id: italy.id, country_label: "Italy (Public)", amount: 999, is_backup: false }],
        });
        ok("a breakdown that does not add up to the charge is refused",
          Boolean(lying.error) && /add up to/.test(lying.error?.message ?? ""),
          JSON.stringify(lying.error?.message ?? lying.data));
        const { count: strays } = await admin.from("invoices")
          .select("id", { count: "exact", head: true }).eq("invoice_number", "zztmp-should-not-exist");
        ok("...and leaves no invoice behind when it refuses", strays === 0, `${strays} rows`);

        const withPdf = await waitForInvoice(page, studentId, (i) => i.pdf_path, 90);
        ok("its PDF is built automatically too", withPdf !== null);

        // 1800 plus its own 90 of tax is 1890, in three = 630 each. The first
        // also carries both administrative fees, 450, and the 22.50 of tax
        // that belongs to them.
        const parts = (await installmentsOf(multi.id)).map((p) => Number(p.amount));
        ok("both administrative fees, and their tax, ride on the first instalment",
          JSON.stringify(parts) === JSON.stringify([1102.5, 630, 630]), JSON.stringify(parts));

        // ================================================ editing an invoice
        // The office asked for everything on an invoice to be editable, and
        // the number of instalments is the one edit that has to delete rows
        // rather than reprice them.
        console.log("\n--- editing an invoice ---");
        await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
        await expand(page, "Invoice");
        const edit = page.getByRole("button", { name: "✏️ Edit" }).first();
        ok("an invoice can be opened for editing", (await edit.count()) > 0,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

        if (await edit.count()) {
          await edit.click();
          const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save invoice" }) }).first();
          await form.locator('input[name="installment_count"]').fill("2");
          await form.locator('input[name="issued_on"]').fill("2026-08-01");
          await form.locator('input[name="discount_amount"]').fill("100");
          await form.locator('input[name="discount_reason"]').fill("zztmp edited discount");
          await form.getByRole("button", { name: "Save invoice" }).click();

          let edited = null;
          for (let i = 0; i < 45; i++) {
            const rows = await installmentsOf(multi.id);
            if (rows.length === 2) { edited = rows; break; }
            await page.waitForTimeout(1000);
          }
          ok("the number of instalments can be changed", edited !== null,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-400));

          if (edited) {
            // 1800 less the 100 discount is 1700, plus 450 of administrative
            // fees is 2150 taxable, 5% is 107.50, so the total is 2257.50.
            // 1700 + 85 of its own tax = 1785 over two = 892.50 each, and the
            // first also takes 450 + 22.50.
            const editedAmounts = edited.map((p) => Number(p.amount));
            ok("...and the schedule is rebuilt around the new count and discount",
              JSON.stringify(editedAmounts) === JSON.stringify([1365, 892.5]), JSON.stringify(editedAmounts));
            ok("...still summing to what the student owes",
              Math.round(editedAmounts.reduce((a, b) => a + b, 0) * 100) / 100 === 2257.5,
              String(editedAmounts.reduce((a, b) => a + b, 0)));
            // The office's own rule still decides which one waits on the
            // admission, rather than the resize inventing a date.
            ok("...with the last one still falling due on the admission",
              edited[1]?.due_date === null && /public university/.test(edited[1]?.due_condition ?? ""),
              JSON.stringify([edited[1]?.due_date, edited[1]?.due_condition]));

            const after = await waitForInvoice(page, studentId, (i) => i.issued_on === "2026-08-01", 30);
            ok("an invoice can be dated to a day that has passed", after !== null,
              String((await waitForInvoice(page, studentId, () => true, 1))?.issued_on));
            ok("...without rewriting when it was actually raised",
              after !== null && new Date(after.created_at) > new Date("2026-08-02"),
              `created_at=${after?.created_at}`);
            ok("...and the discount typed into the edit form is what is stored",
              Number(after?.discount_amount) === 100 && after?.discount_reason === "zztmp edited discount",
              `${after?.discount_amount} / ${after?.discount_reason}`);
          }
        }
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
