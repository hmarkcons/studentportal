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
//
// Both are driven through the deployed UI rather than by writing rows, because
// three of the four things it found were only reachable that way: an
// e-signature student could not get to the page they are told to use
// (migration 0253), a paper agreement never booked its commission, and the
// button that renders the PDF answered to the same name as the button that
// creates the agreement.
import { clients, fixtures, openBrowser, signIn, requireConfirmation, BASE, FIXTURE_PASSWORD } from "./verify-portal-lib.mjs";

requireConfirmation("check:agreement");

const { admin } = clients();
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
      .select("id, status, signing_method, template_id, pdf_path, signed_file_path, document_status, video_status, email_verified")
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
