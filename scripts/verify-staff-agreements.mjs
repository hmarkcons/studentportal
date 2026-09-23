// Staff agreements, end to end against a portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:staffagreements
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Asserted on outcomes — a status the database holds, a file that downloads,
// a row the database refuses to hand over — never on wording alone:
//
//   1. A Super Admin writes a staff template in the Staff tab, and one with a
//      student placeholder in it is refused.
//   2. An agreement generated from it is a real PDF, and generating for
//      someone whose record lacks a field the wording uses is refused.
//   3. The signing loop: send → the staff member returns a signed copy → sent
//      back with a note they can see → returned again → verified.
//   4. An agreement signed outside the portal is uploaded straight to signed.
//   5. A staff member never sees a draft, nor anyone else's agreement.
//   6. Management is not offered either Staff tab and the database refuses
//      them the tables, the files and the submit function — until the
//      permission is granted to them, when the tab appears.
//
// The permission is granted to the fixture Management user alone (a
// staff-level override, removed with them), never to a role: that would
// change what every real Management user can do.
//
// Note: sending, returning and sending back each mail the fixture's official
// address, on a domain that does not exist, so the sending mailbox may
// receive a bounce per run.
import {
  BASE,
  apiAs,
  clients,
  fixtures,
  openBrowser,
  reporter,
  requireConfirmation,
  signIn,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:staffagreements");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const templateIds = [];

// A minimal valid PDF, as a signed copy would be.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
);
const signedFile = (name) => ({ name, mimeType: "application/pdf", buffer: PDF });

const statusOf = async (id) => (await admin.from("staff_agreements").select("status").eq("id", id).single()).data?.status;
async function waitForStatus(id, want) {
  for (let i = 0; i < 40; i++) {
    if ((await statusOf(id)) === want) return true;
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

async function openPanel(page, staffId) {
  await page.goto(`${BASE}/setup/agreement-generator?tab=staff&staff=${staffId}`, { waitUntil: "domcontentloaded" });
  const panel = page.locator("[data-staff-agreements-panel]").first();
  await panel.waitFor({ timeout: 60_000 });
  return panel;
}

try {
  const superUser = await fx.staff("agrsuper", ["super_admin"]);
  const target = await fx.staff("agrtarget", ["counselor"]);
  const bare = await fx.staff("agrbare", ["counselor"]);
  const manager = await fx.staff("agrmanager", ["management"]);
  await admin
    .from("staff")
    .update({ email_official: target.email, designation: "zztmp Senior Counselor", cnic: "35202-0000000-1" })
    .eq("id", target.id);
  await admin.from("staff_compensation").update({ monthly_salary: 120000, currency: "PKR" }).eq("staff_id", target.id);
  // `bare` has no salary on file.

  const browser = await openBrowser();
  const sa = await signIn(browser, superUser.email);

  // ------------------------------------------------- 1. the Staff templates tab
  await sa.goto(`${BASE}/setup/agreement-templates?tab=staff`, { waitUntil: "domcontentloaded" });
  ok("a Super Admin has a Staff tab on Agreement templates",
    (await sa.getByRole("tab", { name: "Staff" }).getAttribute("aria-selected")) === "true");

  async function addTemplate(name, wording) {
    await sa.goto(`${BASE}/setup/agreement-templates?tab=staff`, { waitUntil: "domcontentloaded" });
    await sa.locator('input[name="name"]').first().fill(name);
    await sa.locator('input[name="signatory_name"]').first().fill("zztmp Signatory");
    const editor = sa.locator(".ProseMirror").first();
    await editor.click();
    await sa.keyboard.type(wording);
    await sa.getByRole("button", { name: "Add template" }).click();
    const said = sa.locator('[data-action-status]').first();
    await said.waitFor({ timeout: 60_000 });
    return { kind: await said.getAttribute("data-action-status"), text: await said.innerText() };
  }

  const refused = await addTemplate("zztmp Wrong placeholders", "Dear {{student_name}}, welcome.");
  ok("a template with a student placeholder is refused, and says which", refused.kind === "error" && /student_name/.test(refused.text), refused.text);

  const added = await addTemplate("zztmp Employment", "{{staff_name}} joins as {{designation}} at {{monthly_salary}} a month.");
  ok("a staff template is added", added.kind === "done", added.text);
  const { data: tmpl } = await admin.from("staff_agreement_templates").select("id").eq("name", "zztmp Employment").maybeSingle();
  if (tmpl) templateIds.push(tmpl.id);
  ok("...and is stored", Boolean(tmpl));

  // --------------------------------------------------- 2. generating
  let panel = await openPanel(sa, target.id);
  await panel.locator('select[name="template_id"]').selectOption(tmpl.id);
  await panel.getByRole("button", { name: "Generate" }).click();
  let agreementId = null;
  for (let i = 0; i < 40 && !agreementId; i++) {
    const { data } = await admin.from("staff_agreements").select("id, pdf_path").eq("staff_id", target.id).not("pdf_path", "is", null).maybeSingle();
    agreementId = data?.id ?? null;
    if (!agreementId) await sa.waitForTimeout(750);
  }
  ok("generating makes a draft agreement with a PDF", Boolean(agreementId));
  ok("...as a draft", (await statusOf(agreementId)) === "draft");
  const { data: row } = await admin.from("staff_agreements").select("pdf_path").eq("id", agreementId).single();
  const { data: pdf } = await admin.storage.from("documents").download(row.pdf_path);
  const head = pdf ? Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() : "";
  ok("...and the PDF is a real PDF", head === "%PDF-", head);

  panel = await openPanel(sa, bare.id);
  await panel.locator('select[name="template_id"]').selectOption(tmpl.id);
  await panel.getByRole("button", { name: "Generate" }).click();
  const genError = panel.locator('[data-action-status="error"]').first();
  await genError.waitFor({ timeout: 60_000 }).catch(() => {});
  ok("generating for someone with no salary on file is refused, by name",
    /Monthly salary/i.test(await genError.innerText().catch(() => "")), await genError.innerText().catch(() => "nothing shown"));
  const { count: bareCount } = await admin.from("staff_agreements").select("id", { count: "exact", head: true }).eq("staff_id", bare.id);
  ok("...and leaves nothing half-made behind", bareCount === 0, String(bareCount));

  // --------------------------------------- 5a. a draft stays out of their sight
  const asTarget = await apiAs(url, anonKey, target.email);
  const { data: seenDraft } = await asTarget.from("staff_agreements").select("id").eq("id", agreementId);
  ok("a staff member cannot see their own draft", (seenDraft ?? []).length === 0);

  // ------------------------------------------------------ 3. the signing loop
  panel = await openPanel(sa, target.id);
  await panel.getByRole("button", { name: "Send for signing" }).click();
  ok("sending moves it to waiting for their signature", await waitForStatus(agreementId, "awaiting_signature"));

  const staffPage = await signIn(browser, target.email);
  await staffPage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  // In the page's navigation whether or not its sidebar group is open — a
  // collapsed group hides its links from getByRole.
  ok("they get a My agreement link", (await staffPage.locator('nav a[href="/my-agreement"], aside a[href="/my-agreement"]').count()) > 0);
  await staffPage.goto(`${BASE}/my-agreement`, { waitUntil: "domcontentloaded" });
  const mine = staffPage.locator(`[data-my-agreement="${agreementId}"]`);
  ok("...where it waits for them", (await mine.count()) === 1 && /Waiting for your signature/.test(await mine.innerText()));
  await mine.locator('input[type="file"]').setInputFiles(signedFile("signed.pdf"));
  await mine.getByRole("button", { name: "Upload signed copy" }).click();
  ok("returning a signed copy moves it to returned", await waitForStatus(agreementId, "submitted"));

  panel = await openPanel(sa, target.id);
  await panel.getByRole("button", { name: "Send back" }).click();
  await panel.getByPlaceholder(/What needs fixing/).fill("zztmp page 2 is unsigned");
  await panel.getByRole("button", { name: "Send back to them" }).click();
  ok("sending it back puts it back with them", await waitForStatus(agreementId, "awaiting_signature"));
  const { data: afterBack } = await admin.from("staff_agreements").select("rejection_note, signed_file_path").eq("id", agreementId).single();
  ok("...with the note, and without the rejected copy", afterBack.rejection_note === "zztmp page 2 is unsigned" && afterBack.signed_file_path === null, JSON.stringify(afterBack));

  await staffPage.goto(`${BASE}/my-agreement`, { waitUntil: "domcontentloaded" });
  ok("they see why it came back", (await staffPage.getByText("zztmp page 2 is unsigned").count()) > 0);
  await mine.locator('input[type="file"]').setInputFiles(signedFile("signed-again.pdf"));
  await mine.getByRole("button", { name: "Upload signed copy" }).click();
  ok("...and return it again", await waitForStatus(agreementId, "submitted"));

  panel = await openPanel(sa, target.id);
  await panel.getByRole("button", { name: "Verify signed copy" }).click();
  ok("verifying signs it", await waitForStatus(agreementId, "signed"));
  await staffPage.goto(`${BASE}/my-agreement`, { waitUntil: "domcontentloaded" });
  ok("...and they can download both documents",
    (await staffPage.getByRole("link", { name: "Download the agreement" }).count()) === 1 &&
      (await staffPage.getByRole("link", { name: "Download the signed copy" }).count()) === 1);

  // -------------------------------- 4. signed outside, uploaded from Staff Management
  await sa.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const bareRow = sa.locator("tr", { hasText: bare.name }).first();
  await bareRow.locator('button[aria-label="Actions"]').click();
  await sa.getByRole("button", { name: "📄 Agreements" }).click();
  const slide = sa.getByRole("dialog").last();
  await slide.locator("[data-staff-agreements-panel]").waitFor({ timeout: 60_000 });
  await slide.getByRole("button", { name: "Upload a signed agreement" }).click();
  await slide.locator('input[name="title"]').fill("zztmp Signed on paper");
  await slide.locator('input[type="file"]').last().setInputFiles(signedFile("paper.pdf"));
  await slide.getByRole("button", { name: /^Upload$/ }).click();
  let paper = null;
  for (let i = 0; i < 40 && !paper; i++) {
    paper = (await admin.from("staff_agreements").select("status, source").eq("staff_id", bare.id).maybeSingle()).data;
    if (!paper) await sa.waitForTimeout(750);
  }
  ok("an agreement signed outside the portal is filed from Staff Management, signed",
    paper?.status === "signed" && paper?.source === "uploaded", JSON.stringify(paper));

  // ------------------------------------------ 5b/6. nobody else, at any layer
  const managerPage = await signIn(browser, manager.email);
  // Waits for the page's own heading before looking for what should be
  // missing: the staff layout streams its content in after a loading
  // skeleton, and "no Staff tab" on a page that has not rendered yet proves
  // nothing. The first version of this check read the page too early.
  const settle = (page, heading) => page.getByRole("heading", { name: heading }).first().waitFor({ timeout: 60_000 });
  await managerPage.goto(`${BASE}/setup/agreement-templates?tab=staff`, { waitUntil: "domcontentloaded" });
  await settle(managerPage, "Agreement Templates");
  ok("Management has no Staff tab on templates", (await managerPage.getByRole("tab", { name: "Staff" }).count()) === 0);
  await managerPage.goto(`${BASE}/setup/agreement-generator?tab=staff`, { waitUntil: "domcontentloaded" });
  await settle(managerPage, "Agreement Generator");
  ok("...nor on the generator", (await managerPage.locator("[data-staff-agreements-panel]").count()) === 0 &&
    (await managerPage.getByRole("tab", { name: "Staff" }).count()) === 0);

  const asManager = await apiAs(url, anonKey, manager.email);
  const { data: mRows } = await asManager.from("staff_agreements").select("id");
  const { data: mTemplates } = await asManager.from("staff_agreement_templates").select("id");
  ok("the database hands Management no staff agreements", (mRows ?? []).length === 0);
  ok("...and no staff templates", (mTemplates ?? []).length === 0);
  const { data: fileAsManager } = await asManager.storage.from("documents").download(row.pdf_path);
  ok("...nor the agreement's PDF", !fileAsManager);
  const submitAsManager = await asManager.rpc("submit_staff_agreement", { p_agreement_id: agreementId, p_signed_path: `staff-agreements/${manager.id}/returned/x.pdf` });
  ok("...nor may they submit someone else's agreement", Boolean(submitAsManager.error));

  const { data: seenByOther } = await (await apiAs(url, anonKey, bare.email)).from("staff_agreements").select("id").eq("staff_id", target.id);
  ok("a staff member cannot see anyone else's agreement", (seenByOther ?? []).length === 0);

  // Granted to this one person, then the tab is theirs.
  const { error: grantError } = await admin
    .from("staff_permission_overrides")
    .insert({ staff_id: manager.id, permission_key: "staff_agreements.manage", allowed: true });
  if (grantError) throw new Error(`could not grant the fixture manager the permission: ${grantError.message}`);
  await managerPage.goto(`${BASE}/setup/agreement-generator?tab=staff`, { waitUntil: "domcontentloaded" });
  await settle(managerPage, "Agreement Generator");
  await managerPage.getByRole("tab", { name: "Staff" }).waitFor({ timeout: 30_000 }).catch(() => {});
  const tabNames = await managerPage.getByRole("tab").allInnerTexts();
  ok("granting the permission gives them the generator's Staff tab", tabNames.includes("Staff"), JSON.stringify(tabNames));
  const { data: grantedRows } = await asManager.from("staff_agreements").select("id").eq("staff_id", target.id);
  ok("...and the database lets them read agreements too", (grantedRows ?? []).length > 0, String((grantedRows ?? []).length));

  await browser.close();
} finally {
  for (const id of templateIds) await admin.from("staff_agreement_templates").delete().eq("id", id);
  // Agreements, their files, and the manager's override go with the fixture staff.
  const { data: files } = await admin.storage.from("documents").list("staff-agreements", { limit: 1000 });
  const removed = await fx.cleanup();
  for (const folder of files ?? []) {
    const { data: inside } = await admin.storage.from("documents").list(`staff-agreements/${folder.name}`, { limit: 1000 });
    const { data: stillStaff } = await admin.from("staff").select("id").eq("id", folder.name).maybeSingle();
    if (stillStaff) continue;
    const paths = [];
    for (const f of inside ?? []) {
      if (f.id) paths.push(`staff-agreements/${folder.name}/${f.name}`);
      else {
        const { data: deeper } = await admin.storage.from("documents").list(`staff-agreements/${folder.name}/${f.name}`, { limit: 1000 });
        for (const d of deeper ?? []) paths.push(`staff-agreements/${folder.name}/${f.name}/${d.name}`);
      }
    }
    if (paths.length) await admin.storage.from("documents").remove(paths);
  }
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
