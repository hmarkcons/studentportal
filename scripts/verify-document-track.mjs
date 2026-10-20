// A requirement for public or private universities only (0337), end to end
// against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:doctrack
//
//   * in Setup › Create Doc Checklist a Processing officer adds a requirement
//     with University: Private only, and another with Public only; each is
//     stored with its track and tagged in the list; editing one keeps its
//     track, and unticking Required now makes it optional;
//   * a student on the country's public track, with no application yet, is
//     asked for the public-only one and not the private-only one;
//   * an application to the country's private university asks for the
//     private-only one, and takes the empty public-only one away; one to its
//     public university as well asks for both;
//   * the private application withdrawn, the private-only requirement goes —
//     unless something was uploaded to it, which stays;
//   * the student sees on their Documents what is asked of them, and not the rest.
//
// It touches no real checklist: the requirements live in a zztmp country,
// removed with everything else in the finally.
import { BASE, FIXTURE_PASSWORD, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:doctrack");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const RUN = Date.now().toString(36);
const COUNTRY = "zztmp Trackland";
const PRIVATE_REQ = `zztmp Tuition deposit receipt ${RUN}`;
const PUBLIC_REQ = `zztmp Public enrolment form ${RUN}`;
const STUDENT = `zztmp Track Student ${RUN}`;
const STUDENT_EMAIL = `zztmp-track-${RUN}@hmark-test.local`;

async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

async function press(page, locator) {
  await locator.waitFor({ timeout: 60000 });
  await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await locator.elementHandle(), { timeout: 60000 });
  await locator.click();
}

let browser = null;
let destinationId = null;
let studentId = null;
let studentUserId = null;
const uploaded = [];

const template = async (name) => (await admin.from("document_templates").select("id, required, university_track, level").eq("destination_id", destinationId).eq("name", name).maybeSingle()).data;
/** The student's rows for the two requirements, by which it is. */
const asked = async (ids) => {
  const { data } = await admin.from("student_documents").select("id, template_id, status, file_path").eq("student_id", studentId).in("template_id", [ids.priv, ids.pub]);
  return { priv: (data ?? []).find((d) => d.template_id === ids.priv) ?? null, pub: (data ?? []).find((d) => d.template_id === ids.pub) ?? null };
};

try {
  const officer = await fx.staff(`trackproc${RUN}`, ["processing"]);

  // ------------------------------------------------------------ a sandbox
  // One left by a run that died before its finally holds the country code.
  for (const old of (await admin.from("destinations").select("id").like("display_name", `${COUNTRY}%`)).data ?? []) {
    await admin.from("document_templates").delete().eq("destination_id", old.id);
    await admin.from("destination_document_sections").delete().eq("destination_id", old.id);
    await admin.from("destinations").delete().eq("id", old.id);
  }
  const { data: dest, error: destError } = await admin
    .from("destinations")
    .insert({ country: COUNTRY, country_code: "ZK", track: "public", display_name: `${COUNTRY} (Public)`, currency: "EUR", status: "active" })
    .select("id")
    .single();
  if (destError) throw new Error(`sandbox destination: ${destError.message}`);
  destinationId = dest.id;
  await admin.from("destination_document_sections").insert({ destination_id: destinationId, section_key: "admission", sort_order: 10 });
  const { data: unis, error: uniError } = await admin
    .from("universities")
    .insert([
      { destination_id: destinationId, name: `zztmp Trackland State University ${RUN}`, city: "zztmp City", type: "public" },
      { destination_id: destinationId, name: `zztmp Trackland Private University ${RUN}`, city: "zztmp City", type: "private" },
    ])
    .select("id, type");
  if (uniError) throw new Error(`sandbox universities: ${uniError.message}`);
  const publicUni = unis.find((u) => u.type === "public");
  const privateUni = unis.find((u) => u.type === "private");
  const { data: programs } = await admin
    .from("programs")
    .insert([
      { university_id: publicUni.id, name: `zztmp MSc Public ${RUN}`, level: "masters" },
      { university_id: privateUni.id, name: `zztmp MSc Private ${RUN}`, level: "masters" },
    ])
    .select("id, university_id");
  const programOf = (uni) => programs.find((p) => p.university_id === uni.id).id;

  // ---------------------------------------------------- writing it in Setup
  browser = await openBrowser();
  const op = await signIn(browser, officer.email);
  const builder = `${BASE}/setup/create-doc-checklist?destination=${destinationId}`;
  for (const [name, track] of [
    [PRIVATE_REQ, "private"],
    [PUBLIC_REQ, "public"],
  ]) {
    await op.goto(builder, { waitUntil: "domcontentloaded" });
    await press(op, op.getByRole("button", { name: "+ Add requirement" }).first());
    const form = op.locator("form", { has: op.locator('input[placeholder="e.g. Police clearance certificate"]') });
    await form.locator('input[name="name"]').fill(name);
    await form.locator("[data-track-select]").selectOption(track);
    await form.getByRole("button", { name: "Add", exact: true }).click();
    const saved = await poll(() => template(name));
    ok(`a requirement added with University: ${track === "private" ? "Private" : "Public"} only is stored so`, saved?.university_track === track && saved.required === true, JSON.stringify(saved));
  }
  const ids = { priv: (await template(PRIVATE_REQ))?.id, pub: (await template(PUBLIC_REQ))?.id };

  await op.goto(builder, { waitUntil: "domcontentloaded" });
  const privRow = op.locator("div[draggable]").filter({ hasText: PRIVATE_REQ }).first();
  await privRow.waitFor({ timeout: 60000 });
  ok(
    "...and tagged in the list",
    (await privRow.locator('[data-track-badge="private"]').innerText()) === "private universities only" &&
      (await op.locator("div[draggable]").filter({ hasText: PUBLIC_REQ }).first().locator('[data-track-badge="public"]').innerText()) === "public universities only",
  );

  // Edited: the form opens on its track, keeps it, and Required can now be unticked.
  await press(op, privRow.getByRole("button", { name: "Edit", exact: true }));
  const editForm = op.locator("form").filter({ has: op.locator(`input[name="name"][value="${PRIVATE_REQ}"]`) }).first();
  ok("editing opens on its track", (await editForm.locator("[data-track-select]").inputValue()) === "private");
  await editForm.locator('input[name="required"]').uncheck();
  await editForm.getByRole("button", { name: "Save", exact: true }).click();
  const edited = await poll(async () => {
    const t = await template(PRIVATE_REQ);
    return t?.required === false ? t : null;
  });
  ok("...keeps it when saved, and unticking Required makes it optional", edited?.university_track === "private" && edited.required === false, JSON.stringify(await template(PRIVATE_REQ)));
  await admin.from("document_templates").update({ required: true }).eq("id", ids.priv);

  // ------------------------------------------------------------ a student
  studentId = await fx.lead({
    full_name: STUDENT,
    email: STUDENT_EMAIL,
    contact_number: "0300-9999994",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    processing_officer_id: officer.id,
    assigned_counselor_id: officer.id,
    intake: "Fall 2099",
    level_applying_for: "masters",
    country_of_interest: `${COUNTRY} (Public)`,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: destinationId, is_backup: false });

  const documents = `${BASE}/students/${studentId}/documents`;
  const openDocuments = async () => {
    await op.goto(documents, { waitUntil: "domcontentloaded" });
    await op.locator("[data-document-row]").first().waitFor({ timeout: 60000 }).catch(() => {});
  };

  await openDocuments();
  const none = await poll(async () => {
    const a = await asked(ids);
    return a.pub ? a : null;
  });
  ok("before any application, the public-only one is asked of a student on the country's public track", Boolean(none?.pub));
  ok("...and the private-only one is not", none && !none.priv, JSON.stringify(none));

  // ------------------------------------------- an application, each kind
  const { data: privApp, error: privAppError } = await admin
    .from("applications")
    .insert({ student_id: studentId, university_id: privateUni.id, program_id: programOf(privateUni) })
    .select("id")
    .single();
  if (privAppError) throw new Error(`private application: ${privAppError.message}`);
  const firstStage = (await admin.from("applications").select("current_stage").eq("id", privApp.id).single()).data?.current_stage;
  await openDocuments();
  const priv = await poll(async () => {
    const a = await asked(ids);
    return a.priv && !a.pub ? a : null;
  });
  ok("an application to the private university asks for the private-only one", Boolean(priv?.priv), JSON.stringify(await asked(ids)));
  ok("...and takes the empty public-only one away", priv && !priv.pub);

  const { error: pubAppError } = await admin.from("applications").insert({ student_id: studentId, university_id: publicUni.id, program_id: programOf(publicUni) });
  if (pubAppError) throw new Error(`public application: ${pubAppError.message}`);
  await openDocuments();
  const both = await poll(async () => {
    const a = await asked(ids);
    return a.priv && a.pub ? a : null;
  });
  ok("one to the public university as well asks for both", Boolean(both), JSON.stringify(await asked(ids)));

  // --------------------------------------------- what the student sees
  const { data: madeStudent, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = madeStudent.user.id;
  await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);
  const sp = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await sp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sp.fill('input[name="email"]', STUDENT_EMAIL);
  await sp.fill('input[type="password"]', FIXTURE_PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await sp.goto(`${BASE}/portal/documents?guide=${both?.priv?.id}`, { waitUntil: "domcontentloaded" });
  const studentRow = sp.locator(`[data-document-row="${both?.priv?.id}"]`);
  await studentRow.waitFor({ timeout: 60000 }).catch(() => {});
  ok("the student sees the private-only requirement on their Documents", (await studentRow.count()) === 1 && (await studentRow.innerText()).includes(PRIVATE_REQ));

  // ---------------------------- withdrawn: empty goes, uploaded stays
  // Something sent against the private-only one, as the officer would.
  const asOfficer = await apiAs(url, anonKey, officer.email);
  const path = `${studentId}/documents/${both?.priv?.id}/${RUN}/deposit.pdf`;
  const { error: upError } = await asOfficer.storage.from("documents").upload(path, Buffer.from("%PDF-1.4\n% zztmp deposit\n%%EOF\n"), { contentType: "application/pdf" });
  if (!upError) uploaded.push(path);
  const { error: addError } = await asOfficer.rpc("add_student_document_file", {
    p_document_id: both?.priv?.id,
    p_path: path,
    p_name: "deposit.pdf",
    p_sources: null,
    p_role: "staff",
    p_status: "submitted",
  });
  ok("(a file is sent against the private-only requirement)", !upError && !addError, JSON.stringify({ upError, addError }));

  await admin.from("applications").update({ current_stage: "withdrawn" }).eq("id", privApp.id);
  await openDocuments();
  const kept = await poll(async () => {
    const a = await asked(ids);
    return a.pub ? a : null;
  });
  ok("the private application withdrawn, a private-only requirement with a file is kept", kept?.priv?.id === both?.priv?.id && Boolean(kept?.priv?.file_path), JSON.stringify(kept));

  // The same again with nothing sent: it goes.
  await admin.from("student_documents").delete().eq("id", both?.priv?.id);
  await admin.from("applications").update({ current_stage: firstStage }).eq("id", privApp.id);
  await openDocuments();
  const back = await poll(async () => ((await asked(ids)).priv ? await asked(ids) : null));
  ok("(asked again once the application is live)", Boolean(back?.priv), JSON.stringify(await asked(ids)));
  await admin.from("applications").update({ current_stage: "withdrawn" }).eq("id", privApp.id);
  await openDocuments();
  const gone = await poll(async () => {
    const a = await asked(ids);
    return !a.priv && a.pub ? a : null;
  });
  ok("...and withdrawn with nothing sent, it goes, while the public-only one stays", Boolean(gone), JSON.stringify(await asked(ids)));

  await sp.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  await sp.locator("[data-doc-section]").first().waitFor({ timeout: 60000 }).catch(() => {});
  const expand = sp.getByRole("button", { name: /Expand all/i });
  if (await expand.count()) await press(sp, expand.first());
  const studentText = await sp.locator("body").innerText();
  ok("the student no longer sees it, and sees the public-only one", !studentText.includes(PRIVATE_REQ) && studentText.includes(PUBLIC_REQ), studentText.replace(/\s+/g, " ").slice(0, 400));
  await sp.close();
  await op.close();
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // A fixture's own upload: nothing to restore, so storage's own remove.
  if (uploaded.length) await admin.storage.from("documents").remove(uploaded).catch(() => {});
  if (studentId) {
    await admin.from("notifications").delete().eq("student_id", studentId);
    await admin.from("applications").delete().eq("student_id", studentId);
  }
  const removed = await fx.cleanup();
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  if (destinationId) {
    await admin.from("document_templates").delete().eq("destination_id", destinationId);
    const { data: unis } = await admin.from("universities").select("id").eq("destination_id", destinationId);
    for (const u of unis ?? []) await admin.from("programs").delete().eq("university_id", u.id);
    await admin.from("universities").delete().eq("destination_id", destinationId);
    await admin.from("destination_document_sections").delete().eq("destination_id", destinationId);
    await admin.from("destinations").delete().eq("id", destinationId);
  }
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
