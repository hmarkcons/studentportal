// The visa documentation and application service (0279, 0280), end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:visaonly
//
// A client who already holds an admission letter can be taken on for the visa
// alone. That touches five things that each fail quietly on their own, so they
// are checked together on one throwaway student:
//
//   who may set it     a counsellor is refused by the database itself; a
//                      processing officer sets it from the Registration card
//   the admission      its stages are marked done, the admission-only
//                      documents drop off the checklist, and the letter they
//                      already hold is recorded against a finalized
//                      application
//   the agreement      only visa-service templates are offered, the form asks
//                      for the visa fee and not the admission charges, and
//                      what is stored says so
//   the invoice        the visa fee alone, pre-filled from the agreement, no
//                      administrative charge, every installment dated — and
//                      generate_invoice refuses an administrative charge even
//                      from a hand-made call
//   Finance            the generator offers the student in visa mode to a
//                      counsellor who also holds Finance, and its quick edit
//                      no longer zeroes the fees it does not show
//
// Driven through the deployed UI wherever a person would use it, with fixtures
// named "zztmp" and removed in the finally block.
import { clients, fixtures, openBrowser, signIn, apiAs, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:visaonly");

const { admin, url, anonKey } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

const expand = async (page, title) => {
  const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
  if (await header.count()) await header.click();
};
const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);

// Polls the database for an outcome: a server action's write lands before its
// response does, and a page read once is a race.
async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const VISA_FEE = 500;
const FIRST_DUE = "2026-10-05";
const TEMPLATE_NAME = "zztmp Visa service";
let studentId = null;
let templateId = null;

async function removeFolder(prefix) {
  const { data } = await admin.storage.from("documents").list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id === null) await removeFolder(`${prefix}/${o.name}`);
    else await admin.storage.from("documents").remove([`${prefix}/${o.name}`]);
  }
}

try {
  const sup = await fx.staff("visasuper", ["super_admin"]);
  const proc = await fx.staff("visaproc", ["processing"]);
  const coun = await fx.staff("visacoun", ["counselor"]);
  // Primary role counsellor, Finance held second: the generator used to read
  // the primary role alone and turn this person away.
  const fin = await fx.staff("visafin", ["counselor", "finance"]);

  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();

  studentId = await fx.lead({
    full_name: "zztmp Visa Only Student",
    email: "zztmp-visa-only@example.invalid",
    contact_number: "0300-9999999",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
    assigned_counselor_id: coun.id,
    processing_officer_id: proc.id,
    date_of_birth: "2002-04-17",
    address: "12 Test Street, Karachi",
    intake: "Fall 2099",
    level_applying_for: "Master's",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });

  const supPage = await signIn(browser, sup.email);

  // ============================================== a visa-service template
  console.log("\n--- a visa-service agreement template, made in Setup ---");
  await supPage.goto(`${BASE}/setup/agreement-templates`, { waitUntil: "domcontentloaded" });
  const addTemplate = supPage.getByRole("button", { name: "Add template" });
  await addTemplate.waitFor({ timeout: 30000 });
  const tForm = supPage.locator("form").filter({ has: addTemplate }).first();
  await tForm.locator('select[name="destination_id"]').selectOption(italy.id);
  await tForm.locator('input[name="name"]').fill(TEMPLATE_NAME);
  await tForm.locator('input[name="signatory_name"]').fill("zztmp Signatory");
  await tForm.locator('select[name="service_type"]').selectOption("visa_only");
  const editor = tForm.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.type("zztmp visa service agreement for {{student_name}}. Fee {{visa_service_fee}}.");
  await addTemplate.click();
  const template = await poll(async () =>
    (await admin.from("agreement_templates").select("id, service_type").eq("name", TEMPLATE_NAME).maybeSingle()).data);
  templateId = template?.id ?? null;
  ok("a template saved with the visa service is stored as one", template?.service_type === "visa_only",
    template ? String(template.service_type) : await bodyTail(supPage));

  // ================================================== who may set it
  console.log("\n--- who may set the service ---");
  const counApi = await apiAs(url, anonKey, coun.email);
  const { error: counError } = await counApi.from("leads").update({ service_type: "visa_only" }).eq("id", studentId);
  const { data: afterCoun } = await admin.from("leads").select("service_type").eq("id", studentId).single();
  ok("a counsellor setting it is refused by the database", Boolean(counError) && afterCoun.service_type === "full",
    `error=${counError?.message} stored=${afterCoun.service_type}`);

  // The full service first, so the checklist holds the admission documents
  // that switching has to take away again.
  await supPage.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  const { data: skippable } = await admin.from("document_templates").select("id").eq("skip_for_visa_only", true);
  const skipIds = new Set((skippable ?? []).map((t) => t.id));
  const docsBefore = await poll(async () => {
    const { data } = await admin.from("student_documents").select("id, template_id").eq("student_id", studentId);
    return data?.length ? data : null;
  });
  const skippedBefore = (docsBefore ?? []).filter((d) => skipIds.has(d.template_id)).length;
  ok("a full-service student is asked for the admission documents", skippedBefore > 0,
    `${skippedBefore} of ${docsBefore?.length ?? 0} rows are admission-only`);

  const procPage = await signIn(browser, proc.email);
  await procPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(procPage, "Registration");
  await procPage.getByRole("button", { name: /Edit registration/ }).click();
  const serviceSelect = procPage.locator('select[name="service_type"]');
  ok("a processing officer is offered the service on the Registration card", (await serviceSelect.count()) > 0,
    await bodyTail(procPage));
  if (await serviceSelect.count()) {
    await serviceSelect.selectOption("visa_only");
    const regForm = procPage.locator("form").filter({ has: serviceSelect }).first();
    await regForm.getByRole("button", { name: /^Save$/ }).click();
  }
  const switched = await poll(async () =>
    (await admin.from("leads").select("service_type").eq("id", studentId).single()).data?.service_type === "visa_only");
  ok("...and saving it sets the student to the visa service only", Boolean(switched), await bodyTail(procPage));

  const stages = await poll(async () => {
    const { data } = await admin.from("lead_destinations").select("dashboard_stage_values").eq("lead_id", studentId).single();
    const v = data?.dashboard_stage_values ?? {};
    return v.admission_docs && v.admission && v.university_and_program ? v : null;
  }, 20);
  ok("the admission stages are recorded as done", Boolean(stages), JSON.stringify(stages));

  await procPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  ok("the student's header says visa service only", (await procPage.locator("[data-visa-only]").count()) > 0);

  await procPage.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  const docsAfter = await poll(async () => {
    const { data } = await admin.from("student_documents").select("id, template_id, category, template:document_templates(name)").eq("student_id", studentId);
    return data && !data.some((d) => skipIds.has(d.template_id)) ? data : null;
  }, 20);
  ok("the admission-only documents are no longer asked for", Boolean(docsAfter));
  ok("...while the passport still is",
    (docsAfter ?? []).some((d) => /passport/i.test((Array.isArray(d.template) ? d.template[0] : d.template)?.name ?? "")),
    JSON.stringify((docsAfter ?? []).map((d) => (Array.isArray(d.template) ? d.template[0] : d.template)?.name)));

  // ================================================ recording the admission
  console.log("\n--- recording the admission they already hold ---");
  await procPage.goto(`${BASE}/students/${studentId}/applications`, { waitUntil: "domcontentloaded" });
  ok("the Applications tab offers to record it", (await procPage.locator("[data-record-admission] a").count()) > 0,
    await bodyTail(procPage));
  await procPage.goto(`${BASE}/students/${studentId}/applications/record-admission`, { waitUntil: "domcontentloaded" });
  const raForm = procPage.locator("[data-record-admission-form]");
  await raForm.waitFor({ timeout: 30000 });
  const uniValue = await raForm.locator('select[name="university_id"] option').nth(1).getAttribute("value");
  await raForm.locator('select[name="university_id"]').selectOption(uniValue);
  await raForm.locator('input[type="file"]').setInputFiles({ name: "admission-letter.pdf", mimeType: "application/pdf", buffer: PDF_BYTES });
  await raForm.locator('input[type="file"][data-staged]').waitFor({ timeout: 120000 });
  await raForm.getByRole("button", { name: "Record admission" }).click();
  const app = await poll(async () =>
    (await admin.from("applications").select("id, university_id, current_stage, is_finalized").eq("student_id", studentId).maybeSingle()).data);
  ok("an application is created at the admitted university", app?.university_id === uniValue, JSON.stringify(app));
  const finalized = await poll(async () =>
    (await admin.from("applications").select("is_finalized").eq("student_id", studentId).maybeSingle()).data?.is_finalized === true, 20);
  ok("...finalized for the visa", Boolean(finalized));
  ok("...and standing where an offer counts as held", Boolean(app?.current_stage) && app.current_stage !== "shortlisted",
    String(app?.current_stage));
  const letter = await poll(async () => {
    const { data } = await admin.from("student_documents").select("status, file_path, application_id").eq("student_id", studentId).eq("custom_name", "Admission letter").maybeSingle();
    return data?.file_path ? data : null;
  }, 20);
  ok("the letter is filed against it, verified", letter?.status === "verified" && letter?.application_id === app?.id,
    JSON.stringify(letter));
  if (letter?.file_path) {
    const { data: file } = await admin.storage.from("documents").download(letter.file_path);
    const bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
    ok("...and the file is really there", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF");
  }
  const landed = await poll(async () => (procPage.url().includes(`/applications/${app?.id}`) ? true : null), 20);
  ok("...and staff land on the application", Boolean(landed), procPage.url());

  // ====================================================== the agreement
  console.log("\n--- the agreement ---");
  await supPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(supPage, "Agreement");
  const aForm = supPage.locator('form[data-agreement-service="visa_only"]');
  ok("the agreement form is in visa mode", (await aForm.count()) > 0, await bodyTail(supPage));
  if (await aForm.count()) {
    const options = await aForm.locator('select[name="template_id"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    const { data: offered } = await admin.from("agreement_templates").select("id, service_type").in("id", options.length ? options : ["00000000-0000-0000-0000-000000000000"]);
    ok("only visa-service templates are offered", options.includes(templateId) && (offered ?? []).every((t) => t.service_type === "visa_only"),
      JSON.stringify(offered));
    ok("...with a visa fee to enter and no administrative charge or consultancy fee",
      (await aForm.locator('input[name="visa_service_fee_override"]').count()) === 1 &&
        (await aForm.locator('input[name="admin_charge_override"], input[name="consultancy_fee_override"]').count()) === 0);
    await aForm.locator('select[name="template_id"]').selectOption(templateId);
    await aForm.locator('select[name="signing_method"]').selectOption("paper");
    await aForm.locator('input[name="visa_service_fee_override"]').fill(String(VISA_FEE));
    await aForm.locator('select[name="installment_count"]').selectOption("2");
    await aForm.getByRole("button", { name: "Generate agreement" }).click();
  }
  const agreement = await poll(async () =>
    (await admin.from("agreements").select("id, service_type, visa_service_fee_override, admin_charge_override, consultancy_fee_override, is_backup, pdf_path").eq("student_id", studentId).maybeSingle()).data);
  ok("the agreement is stored as a visa-service one with its fee",
    agreement?.service_type === "visa_only" && Number(agreement?.visa_service_fee_override) === VISA_FEE &&
      agreement?.admin_charge_override === null && agreement?.consultancy_fee_override === null,
    JSON.stringify(agreement));

  if (agreement) {
    await supPage.reload({ waitUntil: "domcontentloaded" });
    await expand(supPage, "Agreement");
    const pdfButton = supPage.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
    if (await pdfButton.count()) await pdfButton.click();
    const withPdf = await poll(async () =>
      (await admin.from("agreements").select("pdf_path").eq("id", agreement.id).single()).data?.pdf_path, 90);
    ok("its PDF renders", Boolean(withPdf), await bodyTail(supPage));

    // Signing is the precondition of an invoice, not the thing under test.
    await admin.from("agreements").update({ status: "signed", signed_file_path: `${studentId}/agreements/zztmp-signed.pdf` }).eq("id", agreement.id);
  }

  // ======================================================== the invoice
  console.log("\n--- the invoice ---");
  await supPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(supPage, "Invoice");
  const iForm = supPage.locator('form[data-invoice-service="visa_only"]');
  ok("the invoice form is in visa mode", (await iForm.count()) > 0, await bodyTail(supPage));
  if (await iForm.count()) {
    ok("...with no administrative charge to enter", (await iForm.locator('input[name^="admin_charge"]').count()) === 0);
    const prefilled = await iForm.locator('input[name="consultancy_fee"]').inputValue();
    ok("...and the visa fee pre-filled from the agreement", Number(prefilled) === VISA_FEE, prefilled);
    await iForm.locator('select[name="installment_count"]').selectOption("2");
    await iForm.locator('input[name="first_due_date"]').fill(FIRST_DUE);
    await iForm.locator('input[name="intake"]').fill("zztmp Fall 2099");
    await iForm.getByRole("button", { name: "Generate invoice" }).click();
  }
  const invoice = await poll(async () =>
    (await admin.from("invoices").select("id, service_type, admin_charge, consultancy_fee, tax_amount, terms, currency, invoice_number").eq("student_id", studentId).maybeSingle()).data);
  ok("the invoice is the visa fee alone",
    invoice?.service_type === "visa_only" && Number(invoice?.admin_charge) === 0 && Number(invoice?.consultancy_fee) === VISA_FEE,
    JSON.stringify(invoice) + " " + (await bodyTail(supPage)));
  ok("...under the visa terms, not the university-refusal refund", /non-refundable/.test(invoice?.terms ?? "") && !/university/i.test(invoice?.terms ?? ""),
    String(invoice?.terms));
  if (invoice) {
    const { data: parts } = await admin.from("invoice_installments").select("installment_no, amount, due_date, due_condition").eq("invoice_id", invoice.id).order("installment_no");
    const { data: breakdown } = await admin.from("invoice_admin_charges").select("id").eq("invoice_id", invoice.id);
    ok("...with no administrative charge rows", (breakdown ?? []).length === 0, JSON.stringify(breakdown));
    // 5% SRB tax on 500 is 25: 525 in two.
    ok("...split evenly, with nothing extra on the first", JSON.stringify((parts ?? []).map((p) => Number(p.amount))) === "[262.5,262.5]",
      JSON.stringify(parts));
    ok("...and both installments dated — there is no admission left to wait on",
      (parts ?? []).length === 2 && parts.every((p) => p.due_date && !p.due_condition), JSON.stringify(parts));

    await supPage.reload({ waitUntil: "domcontentloaded" });
    await expand(supPage, "Invoice");
    ok("the invoice card says visa service only", (await supPage.locator("[data-invoice-visa-only]").count()) > 0);
  }

  // The rule is the database's, not the form's.
  const finApi = await apiAs(url, anonKey, fin.email);
  const { error: rpcError } = await finApi.rpc("generate_invoice", {
    p_student_id: studentId, p_agreement_id: null, p_admin_charge: 100, p_consultancy_fee: VISA_FEE,
    p_currency: "EUR", p_intake: null, p_terms: "zztmp", p_invoice_number: `zztmp-${Date.now()}`,
    p_installment_plan: null, p_installments: [{ installment_no: 1, amount: 600, due_date: FIRST_DUE, due_condition: null }],
  });
  ok("generate_invoice refuses an administrative charge for a visa-only student",
    /visa service fee alone/.test(rpcError?.message ?? ""), String(rpcError?.message));

  // ==================================================== the generator
  console.log("\n--- the Finance invoice generator ---");
  const finPage = await signIn(browser, fin.email);
  await finPage.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  const picker = finPage.locator("select").filter({ has: finPage.locator("option", { hasText: "Choose a registered student" }) }).first();
  ok("a counsellor who also holds Finance can open it", (await picker.count()) > 0, await bodyTail(finPage));
  if (await picker.count()) {
    await picker.selectOption(studentId);
    const mode = finPage.locator("[data-generator-visa-only]");
    await mode.waitFor({ timeout: 15000 }).catch(() => {});
    ok("...and picking the student opens it in visa mode", (await mode.count()) > 0);
    const genForm = finPage.locator("form").filter({ has: finPage.getByRole("button", { name: "Generate invoice" }) }).first();
    ok("...with no administrative fee fields", (await genForm.locator('input[name^="admin_charge"]').count()) === 0);
  }

  if (invoice) {
    // The list's Modify posts only the number and the intake. It used to read
    // every other field as blank and zero the fees.
    await supPage.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
    const row = supPage.locator(`[data-invoice-row="${invoice.id}"]`);
    if (await row.count()) {
      await row.getByRole("button", { name: "Modify" }).click();
      await row.locator('input[name="intake"]').fill("zztmp Spring 2100");
      await row.getByRole("button", { name: "Save changes" }).click();
      const edited = await poll(async () => {
        const { data } = await admin.from("invoices").select("intake, consultancy_fee, admin_charge, currency, terms").eq("id", invoice.id).single();
        return data?.intake === "zztmp Spring 2100" ? data : null;
      });
      ok("the list's quick edit changes the intake", Boolean(edited), await bodyTail(supPage));
      ok("...and leaves the fee, the currency and the terms as they were",
        Number(edited?.consultancy_fee) === VISA_FEE && edited?.currency === invoice.currency && edited?.terms === invoice.terms,
        JSON.stringify(edited));
    } else {
      ok("the invoice appears in the generator's list", false, invoice.invoice_number);
    }
  }
} finally {
  if (studentId) {
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
    await admin.from("student_documents").delete().eq("student_id", studentId);
    await admin.from("applications").delete().eq("student_id", studentId);
    await removeFolder(studentId);
  }
  if (templateId) await admin.from("agreement_templates").delete().eq("id", templateId);
  else await admin.from("agreement_templates").delete().eq("name", TEMPLATE_NAME);
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
