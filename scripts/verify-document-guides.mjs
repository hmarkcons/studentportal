// A guide for every document a student uploads (0300), end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:docguides
//
// Written in Setup › Create Doc Checklist and read wherever the student meets
// the document. Each part fails without an error, so each is asserted on the
// database and then on the page that shows it:
//
//   writing it      a Processing officer opens a requirement's guide in the
//                   builder, formats the full guide with the toolbar, sees
//                   the student's view beside it, attaches a sample and a
//                   video, and saves — all of it stored; the requirement's own
//                   Edit no longer wipes the note
//   a country note  on a country's checklist a shared requirement's guide is
//                   read-only, and that country's note is saved beneath it —
//                   for a profile document (a qualification certificate) too
//   the student     the note under the name; "How to prepare this" opens the
//                   guide under the row — steps as a numbered list, bold,
//                   a working link, the sample (really fetched), the video
//                   from youtube-nocookie — while <script> and a javascript:
//                   link stay words; the country notes under the shared and
//                   the profile documents; beside a sent-back reason, the way
//                   to the guide; from the dashboard's to-dos, straight to it
//   staff           the same guide on the student's Documents tab
//
// It writes no real requirement's guide: its own requirement lives in a zztmp
// destination, and the shared and profile ones get only that destination's
// notes, which go with it in the finally. SHOT_DIR=<folder> saves the
// builder's editor and the student's opened guide.
import { BASE, clients, fixtures, FIXTURE_PASSWORD, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:docguides");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const PORTAL_EMAIL = "zztmp-docguides-student@hmark-test.local";
const REQUIREMENT = "zztmp Police clearance certificate";
const NOTE = "Issued within the last six months, and apostilled.";
const COUNTRY_NOTE = "zztmp Guideland: it must be translated into Guidish.";
const PROFILE_NOTE = "zztmp Guideland: every page stamped by the HEC.";
const VIDEO_ID = "M7lc1UVf-VE";
const BODY = [
  "## Where to get it",
  "1. Apply at your district police office",
  "2. Have it attested by **MOFA**",
  "- It must cover the last five years",
  "- Bring the [online form](https://example.org/zztmp-form)",
  "<script>window.__zztmpInjected = true</script>",
  "[click me](javascript:window.__zztmpInjected=true)",
].join("\n");
// A real, tiny PNG, so the thumbnail can be seen to load.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const PDF = Buffer.from("%PDF-1.4\n% zztmp\n%%EOF\n");

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);
async function hydrated(page, selector) {
  await page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
    }, selector, { timeout: 60_000 })
    .catch(() => {});
}
async function removeFolder(prefix) {
  const { data } = await admin.storage.from("documents").list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id === null) await removeFolder(`${prefix}/${o.name}`);
    else await admin.storage.from("documents").remove([`${prefix}/${o.name}`]);
  }
}

let browser = null;
let destinationId = null;
let templateId = null;
let studentId = null;
let portalUserId = null;

try {
  const { data: leftovers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of leftovers?.users ?? []) if (u.email === PORTAL_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await admin.from("destinations").delete().like("display_name", "zztmp Guideland%");

  const proc = await fx.staff("guidesproc", ["processing"]);
  const coun = await fx.staff("guidescoun", ["counselor"]);

  // ------------------------------------------------------------ a sandbox
  const { data: dest, error: destError } = await admin
    .from("destinations")
    .insert({ country: "zztmp Guideland", country_code: "ZG", track: "public", display_name: "zztmp Guideland (Public)", currency: "EUR", status: "active" })
    .select("id, display_name")
    .single();
  if (destError) throw new Error(`sandbox destination: ${destError.message}`);
  destinationId = dest.id;
  await admin.from("destination_document_sections").insert({ destination_id: destinationId, section_key: "admission", sort_order: 10 });
  const { data: tpl, error: tplError } = await admin
    .from("document_templates")
    .insert({ destination_id: destinationId, category: "admission", name: REQUIREMENT, required: true, level: "all", sort_order: 999 })
    .select("id")
    .single();
  if (tplError) throw new Error(`sandbox requirement: ${tplError.message}`);
  templateId = tpl.id;
  // A shared requirement every destination asks for — only this sandbox's note is written on it.
  const { data: shared } = await admin.from("document_templates").select("id, name, description").is("destination_id", null).eq("name", "CV / Resume").maybeSingle();
  if (!shared) throw new Error("no shared \"CV / Resume\" requirement to note");

  browser = await openBrowser();

  // ============================================================ writing it
  console.log("\n--- writing the guide in the builder ---");
  const procPage = await signIn(browser, proc.email);
  await procPage.setViewportSize({ width: 1400, height: 1000 });
  await procPage.goto(`${BASE}/setup/create-doc-checklist?destination=${destinationId}`, { waitUntil: "domcontentloaded" });
  const openGuide = procPage.locator(`[data-guide-edit="${templateId}"]`);
  ok("the requirement offers Add guide", await openGuide.waitFor({ timeout: 60_000 }).then(() => true, () => false) && /Add guide/.test(await openGuide.innerText()),
    await bodyTail(procPage));
  await hydrated(procPage, `[data-guide-edit="${templateId}"]`);
  await openGuide.click();
  const editor = procPage.locator("[data-guide-editor]").first();
  ok("...which opens the guide editor under it", await editor.waitFor({ timeout: 15_000 }).then(() => true, () => false));

  // The toolbar: two plain lines become numbered steps.
  const bodyInput = editor.locator("[data-guide-body-input]");
  await bodyInput.fill("Fill in the form\nPay the fee");
  await bodyInput.evaluate((el) => el.setSelectionRange(0, el.value.length));
  await editor.locator('[data-guide-tool="steps"]').click();
  ok("the toolbar numbers the selected lines", (await bodyInput.inputValue()) === "1. Fill in the form\n2. Pay the fee", await bodyInput.inputValue());
  ok("...and the student's view beside it shows them as steps", (await editor.locator("[data-guide-preview] ol li").count()) === 2);

  await editor.locator("[data-guide-note-input]").fill(NOTE);
  await bodyInput.fill(BODY);
  await editor.locator('input[type="file"]').setInputFiles({ name: "zztmp-sample.png", mimeType: "image/png", buffer: PNG });
  const staged = await editor.locator('input[type="file"][data-staged]').waitFor({ timeout: 120_000 }).then(() => true, () => false);
  ok("the sample uploads", staged);
  await editor.locator("[data-guide-video-input]").fill(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  if (process.env.SHOT_DIR) await editor.screenshot({ path: `${process.env.SHOT_DIR}/guide-editor.png` });
  await editor.locator("[data-guide-save]").click();

  const saved = await poll(async () => {
    const { data } = await admin
      .from("document_templates")
      .select("description, guide_body, sample_file_path, sample_file_name, guide_video_provider, guide_video_id, guide_updated_by")
      .eq("id", templateId)
      .single();
    return data?.sample_file_path && data.guide_body ? data : null;
  });
  ok("saving stores the note, the full guide, the sample and the video",
    saved?.description === NOTE && saved?.guide_body === BODY && /^document-guides\//.test(saved?.sample_file_path ?? "") &&
      saved?.sample_file_name === "zztmp-sample.png" && saved?.guide_video_provider === "youtube" && saved?.guide_video_id === VIDEO_ID &&
      saved?.guide_updated_by === proc.id,
    JSON.stringify(saved));

  // The requirement's own Edit used to wipe its note.
  await procPage.goto(`${BASE}/setup/create-doc-checklist?destination=${destinationId}`, { waitUntil: "domcontentloaded" });
  const row = procPage.locator("div[draggable]").filter({ has: procPage.locator(`[data-guide-edit="${templateId}"]`) }).first();
  await row.waitFor({ timeout: 60_000 });
  ok("the builder now marks it as having a guide", /^Guide$/.test((await procPage.locator(`[data-guide-edit="${templateId}"]`).innerText()).trim()));
  await hydrated(procPage, `[data-guide-edit="${templateId}"]`);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  // The row becomes its edit form, and the Guide button goes with the rest of
  // it, so the form is found by the name it holds.
  const editForm = procPage.locator("form").filter({ has: procPage.locator(`input[name="name"][value="${REQUIREMENT}"]`) }).first();
  await editForm.locator('input[name="name"]').fill(`${REQUIREMENT} (renamed)`);
  await editForm.getByRole("button", { name: "Save" }).click();
  const renamed = await poll(async () => {
    const { data } = await admin.from("document_templates").select("name, description").eq("id", templateId).single();
    return data?.name.endsWith("(renamed)") ? data : null;
  }, 30);
  ok("editing the requirement's name keeps its note", renamed?.description === NOTE, JSON.stringify(renamed));
  await admin.from("document_templates").update({ name: REQUIREMENT }).eq("id", templateId);

  // ============================================================ country notes
  console.log("\n--- a country's note ---");
  await procPage.goto(`${BASE}/setup/create-doc-checklist?destination=${destinationId}`, { waitUntil: "domcontentloaded" });
  const sharedOpen = procPage.locator(`[data-guide-edit="${shared.id}"]`);
  await sharedOpen.waitFor({ timeout: 60_000 });
  await hydrated(procPage, `[data-guide-edit="${shared.id}"]`);
  await sharedOpen.click();
  const sharedEditor = procPage.locator("[data-guide-editor]").first();
  await sharedEditor.waitFor({ timeout: 15_000 });
  ok("on a country's checklist a shared requirement's guide is read-only",
    (await sharedEditor.locator("[data-guide-shared-notice]").count()) === 1 && (await sharedEditor.locator("[data-guide-note-input]").count()) === 0);
  await sharedEditor.locator("[data-guide-country-input]").fill(COUNTRY_NOTE);
  await sharedEditor.locator("[data-guide-country-save]").click();
  const countryNote = await poll(async () =>
    (await admin.from("document_guide_country_notes").select("note").eq("template_id", shared.id).eq("destination_id", destinationId).maybeSingle()).data);
  ok("...and this country's note beneath it is saved", countryNote?.note === COUNTRY_NOTE, JSON.stringify(countryNote));

  const profileOpen = procPage.locator('[data-profile-guides] [data-guide-edit="qualification:certificate"]');
  await profileOpen.click();
  const profileEditor = procPage.locator("[data-profile-guides] [data-guide-editor]").first();
  await profileEditor.waitFor({ timeout: 15_000 });
  await profileEditor.locator("[data-guide-country-input]").fill(PROFILE_NOTE);
  await profileEditor.locator("[data-guide-country-save]").click();
  const profileNote = await poll(async () =>
    (await admin.from("document_guide_country_notes").select("note").eq("profile_kind", "qualification:certificate").eq("destination_id", destinationId).maybeSingle()).data);
  ok("a profile document's country note is saved too", profileNote?.note === PROFILE_NOTE, JSON.stringify(profileNote));

  // ============================================================ the student
  console.log("\n--- the student ---");
  studentId = await fx.lead({
    full_name: "zztmp Guides Student", email: "zztmp-docguides@example.invalid", contact_number: "0300-9999971",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: dest.display_name, intake: "Fall 2099",
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", level_applying_for: "masters",
    assigned_counselor_id: coun.id, processing_officer_id: proc.id,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: destinationId, is_backup: false });
  await admin.from("student_qualifications").insert({ student_id: studentId, qualification_type: "bachelors_4yr", institution_name: "zztmp University" });
  const { data: anyTemplate } = await admin.from("agreement_templates").select("id").not("destination_id", "is", null).limit(1).single();
  const signedPath = `${studentId}/agreements/zztmp-signed.pdf`;
  await admin.storage.from("documents").upload(signedPath, PDF, { contentType: "application/pdf", upsert: true });
  await admin.from("agreements").insert({
    student_id: studentId, template_id: anyTemplate.id, signing_method: "paper", status: "signed",
    signed_file_path: signedPath, signed_file_uploaded_at: new Date().toISOString(),
  });
  const opened = await poll(async () => {
    const { data } = await admin.from("leads").select("portal_active, student_code").eq("id", studentId).single();
    return data?.portal_active && data.student_code ? data : null;
  }, 20);
  ok("the fixture student has a Student ID and an open portal", Boolean(opened), JSON.stringify(opened));
  const { data: made } = await admin.auth.admin.createUser({ email: PORTAL_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  portalUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: portalUserId }).eq("id", studentId);

  const student = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await student.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await hydrated(student, 'input[name="email"]');
  await student.fill('input[name="email"]', PORTAL_EMAIL);
  await student.fill('input[type="password"]', FIXTURE_PASSWORD);
  await student.click('button[type="submit"]');
  await student.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40_000 });

  // The Documents page seeds the checklist; find the rows it made.
  await student.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  const docs = await poll(async () => {
    const { data } = await admin.from("student_documents").select("id, template_id, derived_key, custom_name").eq("student_id", studentId);
    const own = (data ?? []).find((d) => d.template_id === templateId);
    const cv = (data ?? []).find((d) => d.template_id === shared.id);
    const cert = (data ?? []).find((d) => /^qualification:.*:certificate$/.test(d.derived_key ?? ""));
    return own && cv && cert ? { own, cv, cert } : null;
  }, 30);
  if (!docs) throw new Error("the student's checklist was not seeded");

  // Straight to the document, as the dashboard links: its section and its guide open.
  await student.goto(`${BASE}/portal/documents?guide=${docs.own.id}`, { waitUntil: "domcontentloaded" });
  const guide = student.locator(`#guide-${docs.own.id}`);
  ok("a link to the document opens its guide under it", await guide.waitFor({ timeout: 60_000 }).then(() => true, () => false), await bodyTail(student));
  const ownRow = student.locator(`[data-document-row="${docs.own.id}"]`);
  ok("the note is under the document's name", ((await ownRow.locator("[data-guide-note]").innerText().catch(() => "")) ?? "").trim() === NOTE);
  if (await guide.count()) {
    ok("...the steps are a numbered list", (await guide.locator("ol li").count()) === 2);
    ok("...with the bold in bold", (await guide.locator("strong").allInnerTexts()).includes("MOFA"));
    ok("...the bullets a list, the link a link",
      (await guide.locator("ul li").count()) === 2 && (await guide.locator('a[href="https://example.org/zztmp-form"]').count()) === 1);
    ok("...and the <script> and the javascript: link are only words",
      (await guide.locator("script").count()) === 0 && (await guide.locator('a[href^="javascript"]').count()) === 0 &&
        /<script>window.__zztmpInjected = true<\/script>/.test(await guide.innerText()) &&
        (await student.evaluate(() => window.__zztmpInjected === undefined)));
    const sample = guide.locator("[data-guide-sample]");
    const href = await sample.getAttribute("href").catch(() => null);
    const fetched = href ? await fetch(href).then(async (r) => ({ status: r.status, bytes: Buffer.from(await r.arrayBuffer()) })) : null;
    ok("...the sample opens, and is the file attached", fetched?.status === 200 && fetched.bytes.equals(PNG), String(fetched?.status));
    const thumb = await sample.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
    ok("...shown as a picture, since it is one", thumb);
    ok("...and the video plays from youtube-nocookie",
      (await guide.locator("iframe").getAttribute("src")) === `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`);
  }

  if (process.env.SHOT_DIR) await ownRow.screenshot({ path: `${process.env.SHOT_DIR}/guide-student.png` });
  const cvRow = student.locator(`[data-document-row="${docs.cv.id}"]`);
  await cvRow.locator("[data-guide-toggle]").click();
  const cvGuide = student.locator(`#guide-${docs.cv.id}`);
  ok("a shared document shows this country's note in its guide",
    await cvGuide.waitFor({ timeout: 10_000 }).then(() => true, () => false) &&
      (await cvGuide.locator("[data-guide-country-notes]").innerText()).includes(COUNTRY_NOTE));
  const certRow = student.locator(`[data-document-row="${docs.cert.id}"]`);
  await certRow.locator("[data-guide-toggle]").click();
  ok("...and so does a document from the profile (the degree certificate)",
    (await student.locator(`#guide-${docs.cert.id} [data-guide-country-notes]`).innerText().catch(() => "")).includes(PROFILE_NOTE));

  // Sent back: the way to the guide sits beside the reason.
  await admin.from("student_documents").update({ status: "rejected", rejected_reason: "zztmp not apostilled" }).eq("id", docs.own.id);
  await student.goto(`${BASE}/portal/documents?guide=${docs.cv.id}`, { waitUntil: "domcontentloaded" });
  const rejectedRow = student.locator(`[data-document-row="${docs.own.id}"]`);
  const fromRejection = rejectedRow.locator("[data-guide-from-rejection]");
  const offered = await fromRejection.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  ok("beside the reason a document was sent back, the way to its guide", offered && (await rejectedRow.locator("[data-rejected-reason]").innerText()).includes("zztmp not apostilled"));
  if (offered) {
    await hydrated(student, `[data-document-row="${docs.own.id}"] [data-guide-from-rejection]`);
    await fromRejection.click();
    ok("...which opens it", await student.locator(`#guide-${docs.own.id}`).waitFor({ timeout: 10_000 }).then(() => true, () => false));
  }

  // The dashboard's to-dos go straight to it.
  await student.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  const todo = student.locator(`[data-dashboard-todo-item="${docs.own.id}"]`);
  // Sent back, so first of the three — among the dozens of shared documents this student has yet to send.
  ok("the dashboard lists it first under Still to upload, marked sent back",
    await todo.waitFor({ timeout: 60_000 }).then(() => true, () => false) && /sent back/.test(await todo.innerText()) &&
      (await student.locator("[data-dashboard-todo-item]").first().getAttribute("data-dashboard-todo-item")) === docs.own.id);
  ok("...linking to the document and its guide", (await todo.getAttribute("href", { timeout: 5_000 }).catch(() => null)) === `/portal/documents?guide=${docs.own.id}`);

  // ============================================================ staff
  console.log("\n--- staff ---");
  await procPage.goto(`${BASE}/students/${studentId}/documents`, { waitUntil: "domcontentloaded" });
  const staffRow = procPage.locator(`[data-document-row="${docs.own.id}"]`);
  await staffRow.waitFor({ timeout: 60_000 }).catch(() => {});
  // Sections start shut; open the one it is in.
  if (!(await staffRow.isVisible().catch(() => false))) {
    const section = procPage.locator("section[data-doc-section]").filter({ has: staffRow }).first();
    await section.locator("button[data-collapsible-toggle]").first().click().catch(() => {});
  }
  ok("staff see the note on the student's Documents tab", ((await staffRow.locator("[data-guide-note]").innerText().catch(() => "")) ?? "").trim() === NOTE);
  await hydrated(procPage, `[data-document-row="${docs.own.id}"] [data-guide-toggle]`);
  await staffRow.locator("[data-guide-toggle]").click().catch(() => {});
  ok("...and the same guide", (await procPage.locator(`#staff-guide-${docs.own.id} ol li`).count()) === 2);
} finally {
  await browser?.close().catch(() => {});
  if (studentId) {
    await admin.from("agreements").delete().eq("student_id", studentId);
    await admin.from("student_documents").delete().eq("student_id", studentId);
    await removeFolder(studentId);
  }
  if (templateId) {
    await removeFolder(`document-guides/${templateId}`);
    await admin.from("document_templates").delete().eq("id", templateId);
  }
  // Its notes go with it (on delete cascade).
  if (destinationId) await admin.from("destinations").delete().eq("id", destinationId);
  const removed = await fx.cleanup();
  if (portalUserId) await admin.auth.admin.deleteUser(portalUserId).catch(() => {});
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
