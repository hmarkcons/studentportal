// The date an agreement carries (0310), end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:agreementdate
//
//   student   an agreement generated with a chosen date stores it and prints
//             it; changing it later rebuilds the PDF with the new date — and
//             still does once the agreement is signed, saying the signed copy
//             keeps its own. Someone who may not process agreements cannot
//             change it.
//   staff     a staff agreement generated with a chosen date prints it;
//             changing it later, signed or not, rebuilds the PDF with it.
//
// Everything is named zztmp and removed in a finally.
import { inflateSync } from "node:zlib";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:agreementdate");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function hydrated(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
    },
    selector,
    { timeout: 60000 }
  );
}

// The words a react-pdf PDF draws, from its inflated content streams — the
// same reading as check:agreementcompany.
function pdfText(buf) {
  const bytes = Buffer.from(buf);
  const text = bytes.toString("latin1");
  let content = "";
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const len = Number((/\/Length (\d+)/.exec(m[1]) || [])[1]);
    if (/\/Subtype \/Image|\/Length1/.test(m[1])) continue;
    const raw = bytes.subarray(m.index + m[0].length, m.index + m[0].length + len);
    try { content += (/FlateDecode/.test(m[1]) ? inflateSync(raw) : raw).toString("latin1") + "\n"; } catch { /* not text */ }
  }
  const runs = [];
  for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
    const hexes = tj[1] !== undefined ? [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]) : [tj[2]];
    runs.push(hexes.map((h) => Buffer.from(h, "hex").toString("latin1")).join(""));
  }
  // A date is drawn in pieces ("15-" then "September-2026"), so the joins are closed up.
  return runs.join(" ").replace(/\s+/g, " ").replace(/- /g, "-");
}

const pdfOf = async (path) => {
  const { data } = await admin.storage.from("documents").download(path);
  return data ? pdfText(Buffer.from(await data.arrayBuffer())) : "";
};

let browser = null;
let staffTemplateId = null;
let studentFolder = null;

try {
  const sup = await fx.staff("agrdatesa", ["super_admin"]);
  const counsellor = await fx.staff("agrdatecoun", ["counselor"]);
  const target = await fx.staff("agrdatestaff", ["counselor"]);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: italyTemplates } = await admin.from("agreement_templates").select("id, name, wording").eq("destination_id", italy.id);
  const standard = (italyTemplates ?? []).find((t) => t.name === "Standard" && !t.wording?.trim());
  if (!standard) throw new Error("Italy (Public) has no built-in Standard template to generate from");

  const studentId = await fx.lead({
    full_name: "zztmp Agreement Date Student", email: "zztmp-agrdate@example.invalid", contact_number: "0300-9999992",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy (Public)",
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", level_applying_for: "masters", assigned_counselor_id: counsellor.id,
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  studentFolder = `${studentId}/agreements`;
  await admin.from("student_profiles").upsert(
    { student_id: studentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111" },
    { onConflict: "student_id" }
  );

  browser = await openBrowser();
  const page = await signIn(browser, sup.email);

  // ---------------------------------------------------------------- student
  console.log("\n--- student agreement ---");
  await page.goto(`${BASE}/students/${studentId}?open=agreement`, { waitUntil: "domcontentloaded" });
  const dateField = page.locator('form input[name="agreement_date"]').first();
  await dateField.waitFor({ timeout: 60000 });
  await hydrated(page, 'form input[name="agreement_date"]');
  ok("the generate form offers an agreement date, today by default",
    (await dateField.inputValue()) === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()), await dateField.inputValue());
  const form = page.locator("form", { has: page.locator('input[name="agreement_date"]') }).first();
  await form.locator('select[name="template_id"]').selectOption(standard.id);
  await dateField.fill("2026-09-15");
  await form.getByRole("button", { name: "Generate agreement" }).click();
  const agreement = await poll(async () => (await admin.from("agreements").select("id, agreement_date, updated_at").eq("student_id", studentId).maybeSingle()).data);
  ok("an agreement generated with a chosen date stores it", agreement?.agreement_date === "2026-09-15", JSON.stringify(agreement));

  const card = page.locator("div.flex.flex-col.gap-1", { has: page.locator(`[data-agreement-date]`) }).last();
  await page.locator('[data-agreement-date="2026-09-15"]').waitFor({ timeout: 30000 });
  ok("...and shows it on the agreement", (await page.locator('[data-agreement-date="2026-09-15"]').innerText()).includes("Dated 15 Sep 2026"));

  const pdfButton = card.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
  await pdfButton.waitFor({ timeout: 30000 });
  await hydrated(page, "main button");
  await pdfButton.click();
  const built = await poll(async () => {
    const { data } = await admin.from("agreements").select("pdf_path, updated_at").eq("id", agreement.id).single();
    return data?.pdf_path ? data : null;
  });
  const first = built ? await pdfOf(built.pdf_path) : "";
  ok("...and prints it", first.includes("15-September-2026"), first.slice(0, 200));

  const changeDate = async (to) => {
    const edit = page.locator("[data-agreement-date-edit]").first();
    await hydrated(page, "[data-agreement-date-edit]");
    const before = (await admin.from("agreements").select("updated_at").eq("id", agreement.id).single()).data?.updated_at;
    await edit.click();
    const editor = page.locator("[data-agreement-date-form]");
    await editor.locator('input[name="agreement_date"]').fill(to);
    await editor.getByRole("button", { name: "Save date" }).click();
    await page.locator("[data-agreement-date-result]").waitFor({ timeout: 60000 });
    const message = (await page.locator("[data-agreement-date-result]").innerText()).trim();
    const after = await poll(async () => {
      const { data } = await admin.from("agreements").select("agreement_date, pdf_path, updated_at").eq("id", agreement.id).single();
      return data?.agreement_date === to && data.updated_at !== before ? data : null;
    });
    return { message, after, text: after?.pdf_path ? await pdfOf(after.pdf_path) : "" };
  };
  const changed = await changeDate("2026-10-20");
  ok("changing it later saves the new date", changed.after?.agreement_date === "2026-10-20", changed.message);
  ok("...and rebuilds the PDF with it", changed.text.includes("20-October-2026") && !changed.text.includes("15-September-2026") && /PDF rebuilt/.test(changed.message),
    changed.message);

  await admin.from("agreements").update({ status: "signed" }).eq("id", agreement.id);
  await page.goto(`${BASE}/students/${studentId}?open=agreement`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-agreement-date="2026-10-20"]').waitFor({ timeout: 60000 });
  const afterSigning = await changeDate("2026-11-01");
  ok("once signed, it can still be changed, and the PDF rebuilt",
    afterSigning.after?.agreement_date === "2026-11-01" && afterSigning.text.includes("01-November-2026"), afterSigning.message);
  ok("...saying the signed copy keeps the date it was signed with", /signed copy keeps/.test(afterSigning.message), afterSigning.message);

  const asCounsellor = await apiAs(url, anonKey, counsellor.email);
  const { data: counsellorUpdate } = await asCounsellor.from("agreements").update({ agreement_date: "2026-12-25" }).eq("id", agreement.id).select("id");
  ok("someone who may not process agreements cannot change it",
    (counsellorUpdate ?? []).length === 0 && (await admin.from("agreements").select("agreement_date").eq("id", agreement.id).single()).data?.agreement_date === "2026-11-01");

  // ------------------------------------------------------------------ staff
  console.log("\n--- staff agreement ---");
  const { data: template, error: templateError } = await admin
    .from("staff_agreement_templates")
    .insert({ name: "zztmp Dated contract", signatory_name: "zztmp Signatory", wording: "<p>zztmp This agreement is made on {{agreement_date}}.</p>" })
    .select("id")
    .single();
  if (templateError) throw new Error(`staff template: ${templateError.message}`);
  staffTemplateId = template.id;

  await page.goto(`${BASE}/setup/agreement-generator?tab=staff&staff=${target.id}`, { waitUntil: "domcontentloaded" });
  const panel = page.locator("[data-staff-agreements-panel]");
  await panel.waitFor({ timeout: 60000 });
  const staffDate = panel.locator('form input[name="agreement_date"]');
  await hydrated(page, '[data-staff-agreements-panel] form input[name="agreement_date"]');
  await panel.locator('select[name="template_id"]').selectOption(template.id);
  await staffDate.fill("2026-08-01");
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  const staffAgreement = await poll(async () => {
    const { data } = await admin.from("staff_agreements").select("id, agreement_date, pdf_path").eq("staff_id", target.id).maybeSingle();
    return data?.pdf_path ? data : null;
  });
  const staffText = staffAgreement ? await pdfOf(staffAgreement.pdf_path) : "";
  ok("a staff agreement generated with a chosen date stores and prints it",
    staffAgreement?.agreement_date === "2026-08-01" && staffText.includes("1 August 2026"), staffText.slice(0, 200));

  await admin.from("staff_agreements").update({ status: "signed" }).eq("id", staffAgreement.id);
  await page.reload({ waitUntil: "domcontentloaded" });
  const row = page.locator(`[data-staff-agreement="${staffAgreement.id}"]`);
  await row.locator('[data-agreement-date="2026-08-01"]').waitFor({ timeout: 60000 });
  await hydrated(page, `[data-staff-agreement="${staffAgreement.id}"] [data-agreement-date-edit]`);
  await row.locator("[data-agreement-date-edit]").click();
  await row.locator('[data-agreement-date-form] input[name="agreement_date"]').fill("2026-09-05");
  await row.getByRole("button", { name: "Save date" }).click();
  // The date is saved before the PDF is rebuilt, so the row's own word that
  // it is done is what is waited for, not the date in the database.
  await row.locator("[data-agreement-date-result]").waitFor({ timeout: 90000 });
  const staffMessage = (await row.locator("[data-agreement-date-result]").innerText()).trim();
  ok("...saying the PDF was rebuilt", /PDF rebuilt/.test(staffMessage), staffMessage);
  const restaffed = await poll(async () => {
    const { data } = await admin.from("staff_agreements").select("agreement_date, pdf_path").eq("id", staffAgreement.id).single();
    return data?.agreement_date === "2026-09-05" ? data : null;
  });
  const restaffedText = restaffed ? await pdfOf(restaffed.pdf_path) : "";
  ok("changing a signed staff agreement's date rebuilds its PDF with the new date",
    restaffedText.includes("5 September 2026") && !restaffedText.includes("1 August 2026"),
    (restaffedText.match(/.{0,40}(August|September) 2026.{0,20}/g) ?? []).join(" | ") || restaffedText.slice(0, 200));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  if (staffTemplateId) {
    const { data: rows } = await admin.from("staff_agreements").select("id, pdf_path, signed_file_path").eq("template_id", staffTemplateId);
    const files = (rows ?? []).flatMap((r) => [r.pdf_path, r.signed_file_path]).filter(Boolean);
    if (files.length) await admin.storage.from("documents").remove(files);
    await admin.from("staff_agreements").delete().eq("template_id", staffTemplateId);
    await admin.from("staff_agreement_templates").delete().eq("id", staffTemplateId);
  }
  if (studentFolder) {
    const { data: files } = await admin.storage.from("documents").list(studentFolder);
    if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${studentFolder}/${f.name}`));
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
