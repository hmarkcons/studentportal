// Stages that move themselves, and the staff-side additions around them.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:autostages
//
// Each of these fails without an error, so each is asserted on what the
// database holds afterwards, and then on what the pages show:
//
//   the university's letter   staff file it on the application; it is a
//                             document under Acceptance Letters, approved,
//                             with its file, on the staff Documents tab and
//                             on the student's own Documents page
//   the stages follow         the application moves to its acceptance stage,
//                             the country's Admission to Issued and its
//                             university to Selection Finalized — while a
//                             rejected application with a letter of its own
//                             stays rejected (forward only, never undo), and
//                             a step staff already set keeps its value
//   the scholarship tab       the finalised university's own body is there
//                             to work on before anything is recorded: its two
//                             dropdowns save on change and the first records
//                             it — once, however fast two changes follow each
//                             other — two proof files chosen together attach
//                             at once, and the student sees the documents
//                             status (and nothing before staff act)
//   one visa agreement        a template for all destinations is visa-only by
//                             construction; a full-service student is not
//                             offered it; a visa-only student is, with a
//                             country to choose whose fee it quotes, and the
//                             agreement records that country
//
// Staff steps run as the people who do them in production: Processing files
// the letter; a Super Admin works the scholarship tab (production has taken
// scholarships.manage away from Processing) and writes the template.
// Fixtures are zztmp and removed in the finally. SHOT_DIR=<folder> saves a
// screenshot of the Scholarship tab once its scholarship is recorded.
import { BASE, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:autostages");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const PORTAL_EMAIL = "zztmp-autostages-student@hmark-test.local";
const LETTER = "zztmp Acceptance letter";
const TEMPLATE_NAME = "zztmp All-destinations visa agreement";
const PDF = (label) => ({ name: `${label}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`) });

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);

/** Everything under a storage folder, however deep. */
async function removeFolder(prefix) {
  const { data } = await admin.storage.from("documents").list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id === null) await removeFolder(`${prefix}/${o.name}`);
    else await admin.storage.from("documents").remove([`${prefix}/${o.name}`]);
  }
}

/** A Documents section by its heading, opened. */
async function openSection(page, label) {
  const section = page.locator("section[data-doc-section]").filter({ has: page.locator("button[data-collapsible-toggle]", { hasText: label }) }).first();
  await section.waitFor({ timeout: 60_000 }).catch(() => {});
  if (!(await section.count())) return null;
  const toggle = section.locator("button[data-collapsible-toggle]").first();
  for (let i = 0; i < 10 && (await toggle.getAttribute("aria-expanded")) !== "true"; i++) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
  return section;
}

let browser = null;
const studentIds = [];
const universityIds = [];
let portalUserId = null;
let templateId = null;

try {
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) if (u.email === PORTAL_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await admin.from("agreement_templates").delete().eq("name", TEMPLATE_NAME);

  const proc = await fx.staff("stagesproc", ["processing"]);
  const sup = await fx.staff("stagessuper", ["super_admin"]);
  const coun = await fx.staff("stagescoun", ["counselor"]);

  const { data: italy } = await admin.from("destinations").select("id, display_name, pipeline_stages, visa_service_fee").eq("display_name", "Italy (Public)").single();
  const { data: uk } = await admin.from("destinations").select("id, display_name, visa_service_fee").eq("display_name", "United Kingdom (Private)").single();
  const { data: italyBody } = await admin.from("scholarship_body_destinations").select("scholarship_body_id").eq("destination_id", italy.id).limit(1).single();
  const acceptance = italy.pipeline_stages.find((s) => /acceptance/.test(s));
  if (!acceptance) throw new Error(`Italy (Public)'s pipeline has no acceptance stage: ${italy.pipeline_stages.join(", ")}`);

  const registered = {
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), assigned_counselor_id: coun.id, processing_officer_id: proc.id,
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
  };

  // ------------------------------------------------ the full-service student
  const studentId = await fx.lead({
    ...registered, full_name: "zztmp Stages Student", email: "zztmp-stages@example.invalid", contact_number: "0300-9999981",
    country_of_interest: "Italy (Public)",
  });
  studentIds.push(studentId);
  // Admission under way, and a step staff set by hand that no rule may touch.
  const { error: destError } = await admin.from("lead_destinations").insert({
    lead_id: studentId, destination_id: italy.id, is_backup: false,
    dashboard_stage_values: { admission: "In process", enrollment: "Skip" },
  });
  if (destError) throw new Error(`destination: ${destError.message}`);

  // Its DSU body set as Setup › Universities sets it (0287), so the Scholarship
  // tab knows which body to offer.
  const { data: uni } = await admin.from("universities")
    .insert({ destination_id: italy.id, name: "zztmp Stages University", city: "zztmp City", type: "public", dsu_body_id: italyBody.scholarship_body_id })
    .select("id").single();
  universityIds.push(uni.id);
  const { data: progs } = await admin.from("programs").insert([
    { university_id: uni.id, level: "masters", name: "zztmp Stages Programme" },
    { university_id: uni.id, level: "masters", name: "zztmp Stages Other Programme" },
  ]).select("id, name");
  const prog = progs.find((p) => p.name === "zztmp Stages Programme");
  const other = progs.find((p) => p.name !== "zztmp Stages Programme");
  // The one being finalised, under review; and one the university turned down.
  const { data: app, error: appError } = await admin.from("applications")
    .insert({ student_id: studentId, university_id: uni.id, program_id: prog.id, current_stage: "under_review", intake: "Fall 2099", is_finalized: true })
    .select("id").single();
  if (appError) throw new Error(`application: ${appError.message}`);
  const { data: refused, error: refusedError } = await admin.from("applications")
    .insert({ student_id: studentId, university_id: uni.id, program_id: other.id, current_stage: "rejected", intake: "Fall 2099", is_finalized: false })
    .select("id").single();
  if (refusedError) throw new Error(`rejected application: ${refusedError.message}`);
  // A letter already on the rejected one: the sync reads it, and must still leave it rejected.
  const { error: oldLetterError } = await admin.from("student_documents").insert({
    student_id: studentId, application_id: refused.id, category: "acceptance_letters", custom_name: "zztmp Old letter", status: "verified",
  });
  if (oldLetterError) throw new Error(`old letter: ${oldLetterError.message}`);
  // The portal opens once a signed agreement is on file.
  const { data: italyTemplate } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();
  const signedPath = `${studentId}/agreements/zztmp-signed.pdf`;
  await admin.storage.from("documents").upload(signedPath, PDF("zztmp-signed").buffer, { contentType: "application/pdf", upsert: true });
  const { error: signedError } = await admin.from("agreements").insert({
    student_id: studentId, template_id: italyTemplate.id, signing_method: "paper", status: "signed",
    signed_file_path: signedPath, signed_file_uploaded_at: new Date().toISOString(),
  });
  if (signedError) throw new Error(`signed agreement: ${signedError.message}`);

  const opened = await poll(async () => {
    const { data } = await admin.from("leads").select("portal_active, student_code").eq("id", studentId).single();
    return data?.portal_active && data.student_code ? data : null;
  }, 20);
  ok("the fixture student has a Student ID and an open portal", Boolean(opened), JSON.stringify(opened));
  const { data: made } = await admin.auth.admin.createUser({ email: PORTAL_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  portalUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId }).eq("id", studentId);

  // ------------------------------------------------ the visa-only student
  const visaStudentId = await fx.lead({
    ...registered, full_name: "zztmp Stages Visa Student", email: "zztmp-stages-visa@example.invalid", contact_number: "0300-9999982",
    country_of_interest: "Italy (Public)", service_type: "visa_only",
  });
  studentIds.push(visaStudentId);
  const { error: visaDestError } = await admin.from("lead_destinations").insert([
    { lead_id: visaStudentId, destination_id: italy.id, is_backup: false },
    { lead_id: visaStudentId, destination_id: uk.id, is_backup: true },
  ]);
  if (visaDestError) throw new Error(`visa student's destinations: ${visaDestError.message}`);
  // The agreement PDF refuses a student without an emergency contact.
  await admin.from("student_profiles").upsert(
    { student_id: visaStudentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111" },
    { onConflict: "student_id" }
  );

  browser = await openBrowser();

  // ================================================ the university's letter
  console.log("\n--- the university's letter ---");
  const procPage = await signIn(browser, proc.email);
  await procPage.goto(`${BASE}/students/${studentId}/applications/${app.id}`, { waitUntil: "domcontentloaded" });
  const upload = procPage.locator("form[data-university-upload]");
  ok("the application offers Documents from the university", await upload.waitFor({ timeout: 60_000 }).then(() => true, () => false), await bodyTail(procPage));
  await upload.locator('input[name="name"]').fill(LETTER);
  await upload.locator('input[type="file"]').setInputFiles(PDF("zztmp-acceptance"));
  const uploadButton = upload.getByRole("button", { name: "Upload" });
  await poll(async () => (await uploadButton.isEnabled()) || null, 20);
  await uploadButton.click();

  const letter = await poll(async () => {
    const { data } = await admin.from("student_documents").select("id, category, status, application_id, file_path, verified_at").eq("student_id", studentId).eq("custom_name", LETTER).maybeSingle();
    return data?.file_path ? data : null;
  });
  ok("it is filed as a document under Acceptance Letters, approved, on this application",
    letter?.category === "acceptance_letters" && letter?.status === "verified" && letter?.application_id === app.id && Boolean(letter?.verified_at),
    JSON.stringify(letter));
  if (letter?.file_path) {
    const { data: file } = await admin.storage.from("documents").download(letter.file_path);
    const bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
    ok("...with its file really stored", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF");
  }

  // ================================================ the stages follow
  console.log("\n--- the stages follow ---");
  const moved = await poll(async () => {
    const { data } = await admin.from("applications").select("current_stage").eq("id", app.id).single();
    return data?.current_stage === acceptance ? data : null;
  }, 30);
  ok(`the application moved on to ${acceptance} by itself`, Boolean(moved),
    (await admin.from("applications").select("current_stage").eq("id", app.id).single()).data?.current_stage);
  const { data: bar } = await admin.from("lead_destinations").select("dashboard_stage_values").eq("lead_id", studentId).eq("destination_id", italy.id).single();
  const values = bar?.dashboard_stage_values ?? {};
  ok("the country's Admission went from In process to Issued", values.admission === "Issued", JSON.stringify(values));
  ok("...and its university to Selection Finalized, the application being finalised", values.university_and_program === "Selection Finalized", JSON.stringify(values));
  ok("...while a step staff set by hand kept its value", values.enrollment === "Skip", JSON.stringify(values));
  ok("...and nothing was marked done that has not happened", !values.visa_status && !values.visa_app && !values.admission_docs, JSON.stringify(values));
  const { data: stillRefused } = await admin.from("applications").select("current_stage").eq("id", refused.id).single();
  ok("a rejected application with a letter of its own stays rejected", stillRefused?.current_stage === "rejected", stillRefused?.current_stage);

  // The staff Documents tab.
  await procPage.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  const staffSection = await openSection(procPage, "Acceptance Letters");
  ok("the staff Documents tab has an Acceptance Letters section", Boolean(staffSection), await bodyTail(procPage));
  if (staffSection) {
    const text = (await staffSection.innerText()).replace(/\s+/g, " ");
    ok("...listing the letter", text.includes(LETTER), text.slice(0, 300));
  }

  // The student's own Documents page.
  const studentPage = await browser.newPage();
  await studentPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await studentPage
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60_000 })
    .catch(() => {});
  await studentPage.fill('input[name="email"]', PORTAL_EMAIL);
  await studentPage.fill('input[type="password"]', FIXTURE_PASSWORD);
  await studentPage.click('button[type="submit"]');
  await studentPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40_000 });
  await studentPage.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  const portalSection = await openSection(studentPage, "Acceptance Letters");
  ok("the student's Documents page has an Acceptance Letters section", Boolean(portalSection), await bodyTail(studentPage));
  if (portalSection) {
    const text = (await portalSection.innerText()).replace(/\s+/g, " ");
    ok("...with the letter in it, already approved", text.includes(LETTER) && /Approved/.test(text), text.slice(0, 300));
  }

  // ================================================ the scholarship tab
  console.log("\n--- the scholarship tab ---");
  const recordsNow = async () =>
    (await admin.from("student_scholarships").select("id, scholarship_body_id, status, documents_status").eq("student_id", studentId)).data ?? [];

  // Nothing recorded yet, so the student has nothing to see.
  await studentPage.goto(`${BASE}/portal/scholarship`, { waitUntil: "domcontentloaded" });
  await studentPage.locator("[data-portal-page], main").first().waitFor({ timeout: 60_000 }).catch(() => {});
  // The page has to be showing the country first, or an absent status proves nothing.
  const countryShown = await studentPage.locator("[data-scholarship-countries]").waitFor({ timeout: 60_000 }).then(() => true, () => false);
  ok("before staff record anything the student sees their country, and no scholarship status",
    countryShown && !/Documents: /.test(await studentPage.locator("body").innerText()), await bodyTail(studentPage));

  const supPage = await signIn(browser, sup.email);
  await supPage.goto(`${BASE}/students/${studentId}/scholarship`, { waitUntil: "domcontentloaded" });
  const panel = supPage.locator(`[data-scholarship-panel][data-scholarship-body="${italyBody.scholarship_body_id}"]`);
  ok("the finalised university's own body is there to work on, before anything is recorded",
    await panel.waitFor({ timeout: 60_000 }).then(() => true, () => false) && (await panel.getAttribute("data-scholarship-panel")) === "draft" && (await recordsNow()).length === 0,
    await bodyTail(supPage));
  if (await panel.count()) {
    const documentOptions = await panel.locator("select[data-scholarship-documents] option").evaluateAll((os) => os.map((o) => o.textContent.trim()));
    ok("...its documents dropdown offering all five statuses",
      ["Pending", "Submitted", "Sent via courier", "Upload not required", "To be submitted upon arrival"].every((l) => documentOptions.includes(l)),
      documentOptions.join(" | "));
    const statusOptions = await panel.locator("select[data-scholarship-status] option").evaluateAll((os) => os.map((o) => o.textContent.trim()));
    ok("...its application dropdown Pending and Submitted", statusOptions.includes("Submitted") && statusOptions.includes("Pending"), statusOptions.join(" | "));
    ok("...and a proof upload that takes several files at once", (await panel.locator("input[data-proof-input][multiple]").count()) === 1);

    // Hydrated before the first change, or the change goes nowhere.
    await supPage.waitForFunction(() => {
      const el = document.querySelector("select[data-scholarship-status]");
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 30_000 }).catch(() => {});
    // Two changes back to back, the second before the first has answered:
    // the first records the scholarship, and the second must use that record.
    await panel.locator("select[data-scholarship-status]").selectOption("submitted");
    await panel.locator("select[data-scholarship-documents]").selectOption("courier");
    const recorded = await poll(async () => {
      const rows = await recordsNow();
      return rows.length >= 1 && rows.every((r) => r.status === "submitted" && r.documents_status === "courier") ? rows : null;
    }, 45);
    const rows = await recordsNow();
    ok("choosing Submitted and then Sent via courier records the scholarship with both, no button pressed", Boolean(recorded), JSON.stringify(rows));
    ok("...exactly once, against the university's body", rows.length === 1 && rows[0].scholarship_body_id === italyBody.scholarship_body_id, JSON.stringify(rows));

    const scholarshipId = rows[0]?.id;
    await panel.locator("input[data-proof-input]").setInputFiles([PDF("zztmp-proof-portal"), PDF("zztmp-proof-email")]);
    const proofs = await poll(async () => {
      if (!scholarshipId) return null;
      const { data } = await admin.from("scholarship_proofs").select("file_name, file_path").eq("scholarship_id", scholarshipId);
      return (data ?? []).length >= 2 ? data : null;
    });
    ok("two proof files chosen together are both attached, with nothing more to press",
      JSON.stringify((proofs ?? []).map((p) => p.file_name).sort()) === JSON.stringify(["zztmp-proof-email.pdf", "zztmp-proof-portal.pdf"]),
      JSON.stringify(proofs));
    if (proofs?.[0]?.file_path) {
      const { data: file } = await admin.storage.from("documents").download(proofs[0].file_path);
      const bytes = file ? Buffer.from(await file.arrayBuffer()) : null;
      ok("...each file really stored", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF");
    }
    const listed = await poll(async () => ((await panel.locator("[data-proof-list] li").count()) === 2) || null, 30);
    ok("...and listed under Proof of submission", Boolean(listed));
    ok("the panel is now the record", (await panel.getAttribute("data-scholarship-panel")) === scholarshipId, await panel.getAttribute("data-scholarship-panel"));
    ok("...and still only one record", (await recordsNow()).length === 1);
    if (process.env.SHOT_DIR) await supPage.screenshot({ path: `${process.env.SHOT_DIR}/scholarship-tab.png`, fullPage: true });
  }

  await studentPage.goto(`${BASE}/portal/scholarship`, { waitUntil: "domcontentloaded" });
  await studentPage.locator("[data-portal-page], main").first().waitFor({ timeout: 60_000 }).catch(() => {});
  const shownToStudent = await poll(async () => /Documents: Sent via courier/.test(await studentPage.locator("body").innerText()) || null, 20);
  ok("the student sees the documents status on their Scholarship page", Boolean(shownToStudent), await bodyTail(studentPage));

  // ================================================ one visa agreement
  console.log("\n--- one visa agreement for every destination ---");
  await supPage.goto(`${BASE}/setup/agreement-templates`, { waitUntil: "domcontentloaded" });
  const addTemplate = supPage.getByRole("button", { name: "Add template" });
  await addTemplate.waitFor({ timeout: 30_000 });
  const tForm = supPage.locator("form").filter({ has: addTemplate }).first();
  await supPage.waitForFunction(() => {
    const el = document.querySelector('select[name="destination_id"]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
  }, null, { timeout: 30_000 }).catch(() => {});
  await tForm.locator('select[name="destination_id"]').selectOption("all");
  const serviceNow = await tForm.locator('select[name="service_type"]').inputValue();
  const fullDisabled = await tForm.locator('select[name="service_type"] option[value="full"]').isDisabled();
  ok("choosing All destinations makes the template a visa-service one, and full service unavailable", serviceNow === "visa_only" && fullDisabled,
    `service=${serviceNow} fullDisabled=${fullDisabled}`);
  await tForm.locator('input[name="name"]').fill(TEMPLATE_NAME);
  await tForm.locator('input[name="signatory_name"]').fill("zztmp Signatory");
  const editor = tForm.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.type("zztmp visa service agreement for {{student_name}}. Fee {{visa_service_fee}}.");
  await addTemplate.click();
  const template = await poll(async () =>
    (await admin.from("agreement_templates").select("id, destination_id, service_type").eq("name", TEMPLATE_NAME).maybeSingle()).data);
  templateId = template?.id ?? null;
  ok("it is stored for no one destination, as a visa-service template", Boolean(template) && template.destination_id === null && template.service_type === "visa_only",
    JSON.stringify(template) ?? (await bodyTail(supPage)));

  // A full-service student is not offered it.
  const expand = async (page, title) => {
    const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
    if (await header.count()) await header.click();
  };
  await supPage.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(supPage, "Agreement");
  const fullForm = supPage.locator('form[data-agreement-service="full"]').first();
  await fullForm.waitFor({ timeout: 60_000 }).catch(() => {});
  const fullOptions = await fullForm.locator('select[name="template_id"] option').evaluateAll((os) => os.map((o) => o.value));
  ok("a full-service student is not offered the visa agreement", fullOptions.length > 0 && !fullOptions.includes(templateId), JSON.stringify(fullOptions));

  // A visa-only student is, and chooses the country it is for.
  await supPage.goto(`${BASE}/students/${visaStudentId}`, { waitUntil: "domcontentloaded" });
  await expand(supPage, "Agreement");
  const aForm = supPage.locator('form[data-agreement-service="visa_only"]').first();
  ok("the visa-only student's agreement form is there", await aForm.waitFor({ timeout: 60_000 }).then(() => true, () => false), await bodyTail(supPage));
  if (await aForm.count() && templateId) {
    const options = await aForm.locator('select[name="template_id"] option').evaluateAll((os) => os.map((o) => ({ value: o.value, text: o.textContent.trim() })));
    const offered = options.find((o) => o.value === templateId);
    ok("...offering the all-destinations template, named as one", Boolean(offered) && /^All destinations — /.test(offered.text), JSON.stringify(options));
    await supPage.waitForFunction(() => {
      const el = document.querySelector('form[data-agreement-service="visa_only"] select[name="template_id"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 30_000 }).catch(() => {});
    await aForm.locator('select[name="template_id"]').selectOption(templateId);
    const country = aForm.locator('select[name="destination_id"]');
    ok("choosing it asks which country the agreement is for", await country.waitFor({ timeout: 10_000 }).then(() => true, () => false));
    const countryOptions = await country.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    ok("...offering the student's own countries, their primary first",
      JSON.stringify(countryOptions) === JSON.stringify([italy.id, uk.id]) && (await country.inputValue()) === italy.id, JSON.stringify(countryOptions));
    const fee = aForm.locator("input[data-visa-fee-input]");
    const feeFor = async () => (await fee.getAttribute("placeholder")) ?? "";
    ok("...quoting the primary's visa fee", (await feeFor()).includes(Number(italy.visa_service_fee).toLocaleString("en-US")), await feeFor());
    await country.selectOption(uk.id);
    ok("...and the other country's once that is chosen", (await feeFor()).includes(Number(uk.visa_service_fee).toLocaleString("en-US")), await feeFor());
    await aForm.locator('select[name="signing_method"]').selectOption("paper");
    await aForm.getByRole("button", { name: "Generate agreement" }).click();
  }
  const agreement = await poll(async () =>
    (await admin.from("agreements").select("id, template_id, destination_id, service_type").eq("student_id", visaStudentId).maybeSingle()).data);
  ok("the agreement is stored against the country chosen, on the one template",
    agreement?.template_id === templateId && agreement?.destination_id === uk.id && agreement?.service_type === "visa_only",
    JSON.stringify(agreement) ?? (await bodyTail(supPage)));
} finally {
  await browser?.close().catch(() => {});
  for (const id of studentIds) {
    await admin.from("invoices").delete().eq("student_id", id);
    await admin.from("agreements").delete().eq("student_id", id);
    await admin.from("student_scholarships").delete().eq("student_id", id);
    await admin.from("applications").delete().eq("student_id", id);
    await admin.from("student_documents").delete().eq("student_id", id);
    await removeFolder(id);
  }
  if (templateId) await admin.from("agreement_templates").delete().eq("id", templateId);
  await admin.from("agreement_templates").delete().eq("name", TEMPLATE_NAME);
  for (const id of universityIds) await admin.from("universities").delete().eq("id", id);
  const removed = await fx.cleanup();
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
