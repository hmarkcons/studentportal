// The agreement flow, end to end, on throwaway students.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:agreement
//
// The agreement is the hinge of the whole system: it opens the student portal,
// it is what prices the counselor's commission, and it is what an invoice is
// raised against. It also has two quite different branches, and until this was
// written no agreement had ever been created — so neither had run.
//
//   paper (Karachi)    generate -> PDF -> staff upload the signed scan
//   e-signature        generate -> PDF -> the student submits the signed copy
//                      and a consent video from their portal -> staff approve
//   sending it back    undo the approval of one half -> send that half back
//                      with a reason -> the student replaces only that half
//                      -> staff approve again. Run for the video and for the
//                      signed agreement, since each is a separate branch in
//                      the RPC and in both UIs.
//   editing            correct an unsigned agreement's fees without touching
//                      the PDF, then apply it with Regenerate PDF. Closed
//                      once the agreement is signed.
//   deleting           Super Admin only, and it must take every file with it
//                      — the PDF, the signed copy, the video and everything
//                      archived by a rejection.
//
// Both are driven through the deployed UI rather than by writing rows, because
// three of the four things it found were only reachable that way: an
// e-signature student could not get to the page they are told to use
// (migration 0253), a paper agreement never booked its commission, and the
// button that renders the PDF answered to the same name as the button that
// creates the agreement.
import { createHash } from "node:crypto";
import { clients, fixtures, openBrowser, signIn, apiAs, requireConfirmation, BASE, FIXTURE_PASSWORD } from "./verify-portal-lib.mjs";

requireConfirmation("check:agreement");

const { admin, url, anonKey } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

// The student page is a stack of CollapsibleCards. They keep their children
// mounted and merely `hidden`, so the text reads fine but nothing inside is
// clickable until the header is opened, and collapsed state resets on reload.
const expand = async (page, title) => {
  const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
  if (await header.count()) await header.click();
};

// Server actions land after the click resolves; poll the row rather than the
// page, and give up with the visible text so a failure says something.
const waitForAgreement = async (page, studentId, done, seconds = 45) => {
  for (let i = 0; i < seconds; i++) {
    const { data } = await admin
      .from("agreements")
      .select("id, status, signing_method, template_id, pdf_path, signed_file_path, video_recording_path, " +
              "document_status, video_status, document_review_note, video_review_note, email_verified")
      .eq("student_id", studentId)
      .maybeSingle();
    if (data && done(data)) return data;
    await page.waitForTimeout(1000);
  }
  return null;
};

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const students = [];
const STUDENT_EMAIL = "zztmp-esign-student@hmark-test.local";

async function makeStudent(label, counselorId) {
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const id = await fx.lead({
    full_name: `zztmp ${label}`,
    email: `zztmp-${label.toLowerCase().replace(/\W+/g, "-")}@example.com`,
    contact_number: "0300-9999999",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
    assigned_counselor_id: counselorId,
    // The PDF prints these directly and generateAgreementPdf refuses rather
    // than handing a student a legal document with blanks in it.
    date_of_birth: "2002-04-17",
    address: "12 Test Street, Karachi",
  });
  await admin.from("lead_destinations").insert({ lead_id: id, destination_id: italy.id });
  await admin.from("student_profiles").upsert({
    student_id: id,
    emergency_contact_name: "zztmp Next of Kin",
    emergency_contact_relation: "Father",
    emergency_contact_number: "0300-1111111",
  }, { onConflict: "student_id" });
  students.push(id);
  return id;
}

// Generates through the real form. template_id opens on a "Template…"
// placeholder and is required, so a bare click is swallowed by native
// validation with nothing rendered to explain it — staff have to pick even
// when only one template exists.
async function generate(page, studentId, method) {
  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(page, "Agreement");
  const button = page.getByRole("button", { name: "Generate agreement" });
  if (!(await button.count())) return null;
  const value = await page.locator('select[name="template_id"] option').nth(1).getAttribute("value");
  await page.locator('select[name="template_id"]').selectOption(value);
  await page.locator('select[name="signing_method"]').selectOption(method);
  await button.first().click();
  return waitForAgreement(page, studentId, (a) => a.id);
}

async function renderPdf(page, studentId) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expand(page, "Agreement");
  // Exact: the button that creates the agreement used to carry this same
  // accessible name, and a loose match picked that one instead — which is why
  // the label was changed. Nothing else on the page answers to "PDF".
  const button = page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
  if (!(await button.count())) return { found: false };
  await button.click();
  const row = await waitForAgreement(page, studentId, (a) => a.pdf_path, 90);
  // The button renders its own error beside itself; without this a failure
  // reports only whatever text happened to be at the end of the page.
  const said = await button.locator("xpath=following-sibling::p").allInnerTexts().catch(() => []);
  return { found: true, row, error: said.join(" ").trim() };
}

// Same shape as waitForAgreement, but addressed by agreement id and with the
// columns the caller actually wants — the student-wide lookup returns the one
// agreement, which stops being true the moment a student has two.
const waitForRow = async (page, agreementId, done, seconds, columns) => {
  for (let i = 0; i < seconds; i++) {
    const { data } = await admin.from("agreements").select(columns).eq("id", agreementId).maybeSingle();
    if (data && done(data)) return data;
    await page.waitForTimeout(1000);
  }
  return null;
};

// Content, not the path. Regenerating writes to the same key, so comparing
// pdf_path would call an unchanged document changed and a rewritten one
// identical — the exact two mistakes this is here to catch.
async function pdfFingerprint(path) {
  if (!path) return null;
  const { data } = await admin.storage.from("documents").download(path);
  if (!data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

async function checkStoredPdf(path) {
  const { data: file } = await admin.storage.from("documents").download(path);
  if (!file) return "nothing at that path";
  const bytes = Buffer.from(await file.arrayBuffer());
  return bytes.subarray(0, 4).toString() === "%PDF" ? null : `starts ${JSON.stringify(bytes.subarray(0, 8).toString())}`;
}

// Signing is when the consultancy fee becomes known, so it is when the
// counselor's commission can first be priced — before that there is nothing to
// take a percentage of.
const commissionFor = async (studentId) => {
  const { data } = await admin
    .from("staff_commissions")
    .select("amount, currency, status")
    .eq("student_id", studentId)
    .maybeSingle();
  return data;
};

try {
  const sup = await fx.staff("agrsuper", ["super_admin"]);
  // Italy (Public) is a public-university track, so it is the public rate that
  // prices this one.
  const counselor = await fx.staff("agrcounsel", ["counselor"], {
    pay: { commission_rate_public_universities: 10, commission_type_public_universities: "percentage", currency: "PKR" },
  });
  const page = await signIn(browser, sup.email);

  // ======================================================= paper (Karachi)
  console.log("\n--- paper (Karachi): staff upload the signed scan ---");
  const paperId = await makeStudent("Paper Agreement", counselor.id);
  const { data: paperBefore } = await admin.from("leads").select("portal_active").eq("id", paperId).single();
  ok("the student starts with no portal access", paperBefore.portal_active === false);

  const paper = await generate(page, paperId, "paper");
  ok("a paper agreement is generated", paper !== null, (await page.locator("body").innerText()).slice(-300));

  if (paper) {
    ok("...starting at pending_signature", paper.status === "pending_signature", paper.status);
    ok("...recorded as paper", paper.signing_method === "paper", String(paper.signing_method));

    const pdf = await renderPdf(page, paperId);
    ok("the PDF button is offered once it exists", pdf.found);
    ok("...and a PDF is stored", Boolean(pdf.row?.pdf_path), pdf.error || "no error shown on the page");
    if (pdf.row?.pdf_path) {
      const bad = await checkStoredPdf(pdf.row.pdf_path);
      ok("...which is a real PDF", bad === null, bad ?? "");
    }

    // ============================================ editing an unsigned one
    // A wrong override typed at generation time used to mean deleting the
    // agreement and starting again. Editing is Super Admin only, closed once
    // the agreement is signed, and deliberately does NOT touch the PDF: a
    // student may already be reading the one on file, so applying an edit to
    // the document is a second, explicit step.
    console.log("\n--- editing an unsigned agreement ---");
    const beforeEdit = await pdfFingerprint(pdf.row?.pdf_path);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Agreement");
    await page.getByRole("button", { name: "Actions" }).first().click();
    // Exact. "Edit registration" sits in another card on the same page, and
    // only escapes this by being collapsed — which is not something to rely on.
    const edit = page.getByRole("button", { name: "✏️ Edit", exact: true }).first();
    ok("Super Admin is offered the edit", (await edit.count()) > 0,
      (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-200));

    if (await edit.count()) {
      await edit.click();

      // The country rule, at the only place a person can reach it: the picker
      // is narrowed to templates for countries this student is registered
      // for. Without that, an agreement generated for their own country could
      // be edited onto any other in a second step.
      // The generate form is still on the page behind the slide-over and
      // carries the same field names, so the edit form is identified by the
      // pair only it has: the instalment picker and a Save button.
      const editForm = page.locator("form")
        .filter({ has: page.locator('select[name="installment_count"]') })
        .filter({ has: page.getByRole("button", { name: /^Save$/ }) })
        .first();
      const offered = await editForm.locator('select[name="template_id"] option').allInnerTexts();
      ok("...offering only templates for a country they are registered for",
        offered.filter((t) => t.trim() && !/^Template/.test(t)).every((t) => /Italy \(Public\)/.test(t)),
        JSON.stringify(offered));

      await editForm.locator('input[name="admin_charge_override"]').fill("777");
      await editForm.locator('input[name="consultancy_fee_override"]').fill("2500");
      await editForm.locator('input[name="discount_amount"]').fill("100");
      await editForm.locator('select[name="installment_count"]').selectOption("3");
      await editForm.getByRole("button", { name: /^Save$/ }).click();

      const edited = await waitForRow(page, paper.id, (a) => a.admin_charge_override === 777, 45,
        "id, admin_charge_override, consultancy_fee_override, discount_amount, installment_count, pdf_path");
      ok("the edit is saved", edited !== null,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
      ok("...including the fee, the discount and the instalments",
        edited?.consultancy_fee_override === 2500 && edited?.discount_amount === 100
        && edited?.installment_count === 3,
        JSON.stringify(edited));

      // The promise made in the form's own helper text.
      const afterEdit = await pdfFingerprint(edited?.pdf_path);
      ok("...without rewriting the PDF the student may already be reading",
        afterEdit !== null && afterEdit === beforeEdit, `${beforeEdit} -> ${afterEdit}`);

      // And the second step does apply it, otherwise the edit would be
      // unreachable in the document for ever.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Agreement");
      await page.getByRole("button", { name: /^Regenerate PDF$/i }).first().click();
      let regenerated = null;
      for (let i = 0; i < 60; i++) {
        const fp = await pdfFingerprint(edited?.pdf_path);
        if (fp && fp !== beforeEdit) { regenerated = fp; break; }
        await page.waitForTimeout(1000);
      }
      ok("...until Regenerate PDF is pressed, which applies it", regenerated !== null,
        "the document never changed, so the edit is invisible to the student");
    }

    // The signed scan comes back over the counter and staff upload it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Agreement");
    const upload = page.locator('input[name="file"]').first();
    ok("the signed-copy upload is offered", (await upload.count()) > 0);
    if (await upload.count()) {
      await upload.setInputFiles({
        name: "signed-agreement.pdf", mimeType: "application/pdf", buffer: PDF_BYTES,
      });
      await page.getByRole("button", { name: /Upload signed agreement/i }).first().click();
      const signed = await waitForAgreement(page, paperId, (a) => a.status === "signed");
      ok("uploading the scan marks it signed", signed !== null,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
      ok("...and files the scan", Boolean(signed?.signed_file_path), String(signed?.signed_file_path));

      let active = false;
      for (let i = 0; i < 20; i++) {
        const { data } = await admin.from("leads").select("portal_active").eq("id", paperId).single();
        if (data.portal_active) { active = true; break; }
        await page.waitForTimeout(500);
      }
      ok("a signed paper agreement opens the student portal", active, "portal_active stayed false");

      // Same question asked of both branches. The fee only becomes known when
      // the agreement is signed, so this is the moment the counselor's
      // commission can first be priced.
      let paperCommission = null;
      for (let i = 0; i < 15; i++) {
        paperCommission = await commissionFor(paperId);
        if (paperCommission) break;
        await page.waitForTimeout(1000);
      }
      ok("signing a paper agreement books the counselor's commission", paperCommission !== null,
        "nothing in staff_commissions for this student");

      // An agreement somebody has signed is not something to re-price.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Agreement");
      await page.getByRole("button", { name: "Actions" }).first().click();
      ok("...and the edit closes once it is signed",
        (await page.getByRole("button", { name: "✏️ Edit", exact: true }).count()) === 0,
        "Edit is still offered on a signed agreement");
      await page.keyboard.press("Escape");
    }
  }

  // ========================================================= e-signature
  console.log("\n--- e-signature: the student submits, staff approve ---");
  const eId = await makeStudent("Esign Agreement", counselor.id);
  const esign = await generate(page, eId, "e_signature");
  ok("an e-signature agreement is generated", esign !== null);

  if (esign) {
    ok("...recorded as e_signature", esign.signing_method === "e_signature", String(esign.signing_method));
    const pdf = await renderPdf(page, eId);
    ok("...and its PDF renders", Boolean(pdf.row?.pdf_path), pdf.error || "no error shown on the page");

    // Staff must not be able to upload over an e-signature agreement: the
    // video belongs to the student's submission and would be left pointing at
    // a different one.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Agreement");
    const staffUpload = page.getByRole("button", { name: /Upload signed agreement/i });
    ok("staff are not offered the scan upload for an e-signature agreement", (await staffUpload.count()) === 0);

    // Generating it must open the portal — gated. The student is the one who
    // submits, and they can only do that from inside (migration 0253).
    const { data: opened } = await admin.from("leads").select("portal_active").eq("id", eId).single();
    ok("generating an e-signature agreement opens the portal, gated", opened.portal_active === true,
      "portal_active is false — the student cannot reach the page they are asked to use");

    // The student's side. A portal login is what the "Create portal login"
    // button makes; made directly here so the password is known.
    // A run that dies mid-flight leaves this user behind, and createUser then
    // fails on the duplicate — so clear any leftover first rather than needing
    // a hand-cleanup between runs.
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of existing?.users ?? []) {
      if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
    const { data: made, error: madeError } = await admin.auth.admin.createUser({
      email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true,
    });
    if (madeError || !made?.user) throw new Error(`could not create the student login: ${madeError?.message}`);
    await admin.from("leads").update({ auth_user_id: made.user.id }).eq("id", eId);

    const studentPage = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    await studentPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await studentPage.fill('input[type="email"]', STUDENT_EMAIL);
    await studentPage.fill('input[type="password"]', FIXTURE_PASSWORD);
    await studentPage.click('button[type="submit"]');
    await studentPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
    // Open, but held to the agreement: the rest of the portal bounces back to
    // it so the task cannot be scrolled past.
    await studentPage.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
    ok("...but held to the agreement until it is submitted",
      new URL(studentPage.url()).pathname === "/portal/agreement", studentPage.url());

    await studentPage.goto(`${BASE}/portal/agreement`, { waitUntil: "domcontentloaded" });

    const submit = studentPage.getByRole("button", { name: /Submit signed agreement/i });
    ok("the student is asked to submit their signed agreement", (await submit.count()) > 0,
      (await studentPage.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));

    if (await submit.count()) {
      await studentPage.locator('input[type="file"][accept*="video"]').first().setInputFiles({
        name: "consent.webm", mimeType: "video/webm", buffer: Buffer.from("zztmp consent recording"),
      });
      await studentPage.locator('input[type="file"][name="agreement"]').setInputFiles({
        name: "my-signed-agreement.pdf", mimeType: "application/pdf", buffer: PDF_BYTES,
      });
      await submit.click();

      const submitted = await waitForAgreement(studentPage, eId, (a) => a.signed_file_path, 60);
      ok("the submission is recorded", submitted !== null,
        (await studentPage.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
      ok("...but is not signed yet — staff have not seen it", submitted?.status === "pending_signature",
        String(submitted?.status));

      // Both halves are attached, so the gate lifts immediately — waiting on
      // staff verification would lock the student out for a reason they cannot
      // act on. Approval is still outstanding; the portal is simply open.
      await studentPage.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
      ok("...and submitting lifts the gate, without waiting on staff",
        new URL(studentPage.url()).pathname === "/portal/documents", studentPage.url());

      // Staff review it.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expand(page, "Agreement");
      const approve = page.getByRole("button", { name: /Approve .* mark signed/i });
      ok("staff are offered the approval", (await approve.count()) > 0,
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-400));

      if (await approve.count()) {
        ok("...disabled until both halves are ticked", await approve.isDisabled());
        for (const label of [/The signed agreement is correct/, /watched the video/]) {
          await page.locator("label").filter({ hasText: label }).first().locator("input").check();
        }
        await approve.click();
        const done = await waitForAgreement(page, eId, (a) => a.status === "signed", 60);
        ok("approving marks it signed", done !== null,
          (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
        ok("...with both halves approved",
          done?.document_status === "approved" && done?.video_status === "approved",
          `document=${done?.document_status} video=${done?.video_status}`);

        let active = false;
        for (let i = 0; i < 20; i++) {
          const { data } = await admin.from("leads").select("portal_active").eq("id", eId).single();
          if (data.portal_active) { active = true; break; }
          await page.waitForTimeout(500);
        }
        ok("an approved e-signature agreement opens the student portal", active, "portal_active stayed false");

        let esignCommission = null;
        for (let i = 0; i < 15; i++) {
          esignCommission = await commissionFor(eId);
          if (esignCommission) break;
          await page.waitForTimeout(1000);
        }
        ok("approving an e-signature agreement books the counselor's commission", esignCommission !== null,
          "nothing in staff_commissions for this student");

        // ================================================== sending it back
        // The path a mistake takes, run for each half in turn.
        //
        // Undoing one half alone is what makes the interesting state
        // reachable: an approved artefact sitting beside one that is going
        // back to the student. Migration 0124 exists so that replacing the
        // rejected half does not cost the student the half they already got
        // right, and an undo of a single half is the only way to get there —
        // approving writes both at once.
        //
        // Both halves are driven, because they are separate branches in the
        // RPC and in both UIs: the staff panel hides itself when the document
        // is the missing one (submitted is Boolean(signed_file_path)), and the
        // student's form picks its inputs per artefact.
        const HALVES = [
          {
            noun: "video",
            other: "agreement",
            undoLabel: /Only the consent video/,
            rejectLabel: /Ask to re-record video/i,
            reasonPlaceholder: 'input[placeholder*="Face not visible"]',
            reason: "zztmp - audio is unclear",
            pathField: "video_recording_path",
            statusField: "video_status",
            otherPathField: "signed_file_path",
            otherStatusField: "document_status",
            studentInput: 'input[type="file"][accept*="video"]',
            absentInput: 'input[type="file"][name="agreement"]',
            file: { name: "consent-take-2.webm", mimeType: "video/webm", buffer: Buffer.from("zztmp second take") },
          },
          {
            noun: "signed agreement",
            other: "video",
            undoLabel: /Only the signed agreement/,
            rejectLabel: /Reject agreement/i,
            reasonPlaceholder: 'input[placeholder*="Signature missing"]',
            reason: "zztmp - page 3 is not signed",
            pathField: "signed_file_path",
            statusField: "document_status",
            otherPathField: "video_recording_path",
            otherStatusField: "video_status",
            studentInput: 'input[type="file"][name="agreement"]',
            absentInput: 'input[type="file"][accept*="video"]',
            file: { name: "signed-take-2.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
          },
        ];

        for (const half of HALVES) {
          console.log(`\n--- sending back the ${half.noun}: undo, reject, resubmit, re-approve ---`);

          const approved = await waitForAgreement(page, eId, (a) => a[half.statusField] === "approved");
          const keptOther = approved[half.otherPathField];
          const rejectedPath = approved[half.pathField];

          await page.reload({ waitUntil: "domcontentloaded" });
          await expand(page, "Agreement");
          const undo = page.getByRole("button", { name: /^Undo approval$/ }).first();
          ok(`an approval of the ${half.noun} can be taken back`, (await undo.count()) > 0,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
          if (!(await undo.count())) break;

          await undo.click();
          await page.locator("label").filter({ hasText: half.undoLabel }).first().locator("input").check();
          await page.getByRole("button", { name: /^Undo approval$/ }).last().click();

          const undone = await waitForAgreement(page, eId, (a) => a[half.statusField] === "pending", 60);
          ok(`undoing the ${half.noun} alone leaves the ${half.other} approved`,
            undone !== null && undone[half.otherStatusField] === "approved",
            `${half.statusField}=${undone?.[half.statusField]} ${half.otherStatusField}=${undone?.[half.otherStatusField]}`);
          ok("...and puts the agreement back in front of staff",
            undone?.status === "pending_signature", String(undone?.status));
          ok("...without touching either file",
            Boolean(undone?.signed_file_path) && Boolean(undone?.video_recording_path),
            `document=${undone?.signed_file_path} video=${undone?.video_recording_path}`);

          // Nothing is missing, so the student must not be asked to resend.
          await studentPage.goto(`${BASE}/portal/agreement`, { waitUntil: "domcontentloaded" });
          const undoneText = await studentPage.locator("body").innerText();
          ok("the student is told we are re-checking, not asked to resend",
            /checking your agreement again/i.test(undoneText)
            && (await studentPage.getByRole("button", { name: /Submit/i }).count()) === 0,
            undoneText.replace(/\s+/g, " ").slice(0, 300));
          await studentPage.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
          ok("...and the portal closes again while it is unapproved",
            new URL(studentPage.url()).pathname === "/portal/agreement", studentPage.url());

          // --------------------------------------------- send this half back
          await page.reload({ waitUntil: "domcontentloaded" });
          await expand(page, "Agreement");
          const sendBack = page.getByRole("button", { name: half.rejectLabel }).first();
          ok(`staff can send the ${half.noun} back on its own`, (await sendBack.count()) > 0,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
          if (!(await sendBack.count())) break;

          await sendBack.click();
          await page.locator(half.reasonPlaceholder).fill(half.reason);
          await page.getByRole("button", { name: /^Send back$/ }).click();

          const sentBack = await waitForAgreement(page, eId, (a) => a[half.statusField] === "rejected", 60);
          ok(`the ${half.noun} is sent back with a reason`, sentBack !== null,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
          ok("...unlinked so the student can replace it",
            sentBack?.[half.pathField] === null, String(sentBack?.[half.pathField]));
          ok(`...while the approved ${half.other} is left alone`,
            sentBack?.[half.otherStatusField] === "approved" && sentBack?.[half.otherPathField] === keptOther,
            `${half.otherStatusField}=${sentBack?.[half.otherStatusField]} path changed=${sentBack?.[half.otherPathField] !== keptOther}`);

          // A rejection archives rather than deletes. Holding a consent video
          // at all is pointless if sending one back destroys it.
          const { data: archived } = await admin
            .from("agreement_submission_archive")
            .select("kind, file_path, reason")
            .eq("agreement_id", esign.id);
          ok("...and the original is kept on record",
            (archived ?? []).some((r) => r.file_path === rejectedPath),
            JSON.stringify(archived));
          const stillThere = await admin.storage.from("documents").download(rejectedPath);
          ok("...as a file, not just a row", Boolean(stillThere.data),
            "the archive points at an object that is no longer in the bucket");

          // ----------------------------------- the student replaces one half
          await studentPage.goto(`${BASE}/portal/agreement`, { waitUntil: "domcontentloaded" });
          const redoText = await studentPage.locator("body").innerText();
          ok("the student is told what was wrong with it",
            redoText.includes(half.reason), redoText.replace(/\s+/g, " ").slice(0, 400));
          ok(`...and is asked for the ${half.noun} only`,
            (await studentPage.locator(half.absentInput).count()) === 0
            && (await studentPage.locator(half.studentInput).count()) > 0,
            `the ${half.other} was asked for again, which the student already got right`);

          await studentPage.locator(half.studentInput).first().setInputFiles(half.file);
          await studentPage.getByRole("button", { name: /Submit new video|Submit signed agreement/i }).first().click();

          const replaced = await waitForAgreement(studentPage, eId, (a) => a[half.pathField] !== null, 60);
          ok("the replacement is recorded", replaced !== null,
            (await studentPage.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
          ok("...as a different file from the one sent back",
            replaced?.[half.pathField] !== rejectedPath, String(replaced?.[half.pathField]));
          ok(`...and the ${half.other} they already got right stays approved`,
            replaced?.[half.otherStatusField] === "approved" && replaced?.[half.otherPathField] === keptOther,
            `${half.otherStatusField}=${replaced?.[half.otherStatusField]}`);

          // ---------------------------------------------- staff approve again
          await page.reload({ waitUntil: "domcontentloaded" });
          await expand(page, "Agreement");
          const reapprove = page.getByRole("button", { name: /Approve .* mark signed/i }).first();
          ok("the resubmission comes back for review", (await reapprove.count()) > 0,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));
          if (!(await reapprove.count())) break;

          for (const label of [/The signed agreement is correct/, /watched the video/]) {
            await page.locator("label").filter({ hasText: label }).first().locator("input").check();
          }
          await reapprove.click();
          const resigned = await waitForAgreement(page, eId, (a) => a.status === "signed", 60);
          ok("re-approving signs it again", resigned !== null,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

          // These fields describe a live situation or nothing at all — the
          // trigger clears them, rather than leaving a stale note behind.
          const { data: cleared } = await admin.from("agreements")
            .select("approval_undone_at, document_review_note, video_review_note").eq("id", esign.id).single();
          ok("...and the withdrawn-approval mark is cleared",
            cleared.approval_undone_at === null, String(cleared.approval_undone_at));
          ok("...along with the note about what was wrong",
            cleared.document_review_note === null && cleared.video_review_note === null,
            `document=${cleared.document_review_note} video=${cleared.video_review_note}`);

          await studentPage.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
          ok("...and the student's portal opens back up",
            new URL(studentPage.url()).pathname === "/portal/documents", studentPage.url());

          // The commission was booked at the first approval. Going round the
          // loop again must not book a second one.
          const { count: ledger } = await admin
            .from("staff_commissions")
            .select("id", { count: "exact", head: true })
            .eq("student_id", eId);
          ok("...without booking the commission twice", ledger === 1, `${ledger} rows`);
        }

        // ================================================ deleting one
        // Done last and on this agreement deliberately: after two rounds of
        // send-back it carries every kind of file the delete has to account
        // for — the generated PDF, the signed copy, the consent video, and
        // the artefacts archived by each rejection.
        //
        // Deleting used to remove only the row. A leftover file is not just
        // clutter: documents_storage_select_self grants a student read on
        // everything under their own id folder, so an orphan stays readable
        // by them — and a signed copy uploaded against the wrong student
        // would stay readable by the wrong one.
        console.log("\n--- deleting an agreement ---");
        const { data: doomed } = await admin.from("agreements")
          .select("pdf_path, signed_file_path, video_recording_path").eq("id", esign.id).single();
        const { data: archiveRows } = await admin.from("agreement_submission_archive")
          .select("file_path").eq("agreement_id", esign.id);
        const shouldVanish = [...new Set([
          doomed.pdf_path, doomed.signed_file_path, doomed.video_recording_path,
          ...(archiveRows ?? []).map((r) => r.file_path),
        ].filter(Boolean))];
        ok("the agreement has files of every kind to account for",
          shouldVanish.length >= 5, `${shouldVanish.length} paths, ${(archiveRows ?? []).length} archived`);

        // Deletion is Super Admin's alone, and the database says so too — not
        // only the menu that hides the button.
        const processing = await fx.staff("agrproc", ["processing"]);
        const asProcessing = await apiAs(url, anonKey, processing.email);
        await asProcessing.from("agreements").delete().eq("id", esign.id);
        const { count: survived } = await admin.from("agreements")
          .select("id", { count: "exact", head: true }).eq("id", esign.id);
        ok("...and Processing cannot delete it, RLS not just the menu", survived === 1,
          "a processing-only account deleted an agreement through the API");

        await page.reload({ waitUntil: "domcontentloaded" });
        await expand(page, "Agreement");
        page.once("dialog", (d) => d.accept());
        await page.getByRole("button", { name: "Actions" }).first().click();
        // Exact: "🗑️ Delete student" is on the same page and matched first,
        // then sat behind the open menu's overlay waiting to be clickable.
        const del = page.getByRole("button", { name: "🗑️ Delete", exact: true }).first();
        ok("Super Admin is offered the delete", (await del.count()) > 0);

        if (await del.count()) {
          await del.click();
          let gone = false;
          for (let i = 0; i < 45; i++) {
            const { count } = await admin.from("agreements")
              .select("id", { count: "exact", head: true }).eq("id", esign.id);
            if (count === 0) { gone = true; break; }
            await page.waitForTimeout(1000);
          }
          ok("deleting removes the agreement", gone,
            (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300));

          const left = [];
          for (const path of shouldVanish) {
            const { data } = await admin.storage.from("documents").download(path);
            if (data) left.push(path);
          }
          ok("...and takes every file with it, including the archived ones",
            left.length === 0, `${left.length} still readable: ${JSON.stringify(left.slice(0, 3))}`);

          const { count: archiveLeft } = await admin.from("agreement_submission_archive")
            .select("id", { count: "exact", head: true }).eq("agreement_id", esign.id);
          ok("...and the archive rows go with it", archiveLeft === 0, `${archiveLeft} rows`);
        }
      }
    }
    await studentPage.close();
    await admin.auth.admin.deleteUser(made.user.id).catch(() => {});
  }

  await page.close();
} finally {
  for (const id of students) {
    const { data: files } = await admin.storage.from("documents").list(`${id}/agreements`);
    if (files?.length) {
      await admin.storage.from("documents").remove(files.map((f) => `${id}/agreements/${f.name}`));
    }
    await admin.from("agreements").delete().eq("student_id", id);
  }
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
