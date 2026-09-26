// Company details on agreements (0288), end to end against the portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:agreementcompany
//
//   who may change it   the Super Admin; a processing officer sees the tab but
//                       cannot type, and the database refuses them too.
//   the tab             starts on exactly what agreements have printed; typing
//                       changes the "how it prints" panel before anything is
//                       saved; Preview on an agreement prints the unsaved
//                       details on a real Standard agreement.
//   a real agreement    generated after saving, it prints the saved name,
//                       address and contacts in the office line, the page
//                       header and the signature caption — read from the
//                       database, the one path the preview does not share.
//   placeholders        a template quoting {{company_email}} refuses to
//                       generate while the email is blank, and prints it once
//                       it is set.
//   Italy               its Standard agreement printed the landline as 778;
//                       with the saved details restored it prints 777.
//
// The saved details are snapshotted first and put back straight after the one
// real agreement that needs them, and again in the finally, so real
// agreements generated meanwhile are exposed to the test values for seconds.
import { inflateSync } from "node:zlib";
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:agreementcompany");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const PRINTED_BEFORE =
  "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777";

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function hydrated(page, selector) {
  return page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, selector, { timeout: 30000 })
    .then(() => true, () => false);
}

// The words on a Classic agreement: standard fonts, so hex WinAnsi strings in
// TJ arrays. `flat` runs them together, because a sentence wraps across lines
// and "Landline #:" may start a new one.
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
  // Classic hyphenates a long word at a line end ("Univer- sity"); rejoined.
  // And an opening bracket is drawn as a run of its own, so "(Signature)"
  // would read "( Signature)" once runs are joined with spaces.
  const flat = runs.join(" ").replace(/\s+/g, " ").replace(/(\w)- (\w)/g, "$1$2").replace(/\( /g, "(");
  return { isPdf: text.startsWith("%PDF"), flat };
}

const around = (text, word) => {
  const at = text.indexOf(word);
  return at === -1 ? `no "${word}" in: ${text.slice(0, 200)}` : text.slice(Math.max(0, at - 120), at + 120);
};

const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);

const { data: before, error: readError } = await admin.from("agreement_settings").select("*").eq("id", true).single();
if (readError || !before) {
  console.log(`could not read agreement_settings: ${readError?.message}`);
  process.exit(1);
}
const snapshot = { ...before };
delete snapshot.id;
delete snapshot.updated_at;
const restore = () => admin.from("agreement_settings").update(snapshot).eq("id", true);

const NEW = {
  company_name: "zztmp Consultants",
  office_address: "zztmp Suite 9\nzztmp Karachi",
  landline: "021 000 0000",
  mobile: "",
  email: "zztmp@example.invalid",
  website: "",
};
const NEW_LINE = "zztmp Consultants - Office Address: zztmp Suite 9, zztmp Karachi. Landline #: 021 000 0000 | Email: zztmp@example.invalid";

let browser = null;
let studentId = null;
let placeholderTemplateId = null;

try {
  const sup = await fx.staff("agrcosuper", ["super_admin"]);
  const proc = await fx.staff("agrcoproc", ["processing"]);

  // ------------------------------------------------------------ who may write
  console.log("\n--- who may change it ---");
  const asProc = await apiAs(url, anonKey, proc.email);
  const { data: refused } = await asProc.from("agreement_settings").update({ company_name: "zztmp refused" }).eq("id", true).select("id");
  ok("a processing officer's update matches nothing", !refused?.length);
  const { data: still } = await admin.from("agreement_settings").select("company_name").eq("id", true).single();
  ok("...and the name is untouched", still.company_name === before.company_name, still.company_name);

  browser = await openBrowser();
  const procPage = await signIn(browser, proc.email);
  await procPage.goto(`${BASE}/setup/agreement-templates?tab=company`, { waitUntil: "domcontentloaded" });
  const procName = procPage.locator('input[name="company_name"]');
  const procSees = await procName.waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok("processing can open the Company details tab", procSees, await bodyTail(procPage));
  ok("...but cannot type in it", procSees && (await procName.isDisabled()));
  ok("...and is told who can", (await procPage.locator("body").innerText()).includes("Only a Super Admin can change the company details"));
  await procPage.close();

  // ------------------------------------------------------------------- fixtures
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  // The built-in Standard template: no wording of its own (null or empty), so
  // it prints the per-country content, and the office line above it.
  const { data: italyTemplates } = await admin.from("agreement_templates").select("id, name, wording").eq("destination_id", italy.id);
  const standard = (italyTemplates ?? []).find((t) => t.name === "Standard" && !t.wording?.trim());
  if (!standard) throw new Error("Italy (Public) has no built-in Standard template to generate from");
  const { data: placeholderTemplate, error: templateError } = await admin
    .from("agreement_templates")
    .insert({
      destination_id: italy.id,
      name: "zztmp Company placeholders",
      signatory_name: "zztmp Signatory",
      wording: "<p>Write to {{company_email}} at {{company_address}}.</p><p>{{fee_table}}</p>",
    })
    .select("id")
    .single();
  if (templateError) throw new Error(`placeholder template: ${templateError.message}`);
  placeholderTemplateId = placeholderTemplate.id;

  studentId = await fx.lead({
    full_name: "zztmp Company Student", email: "zztmp-agrco@example.invalid", contact_number: "0300-9999996",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy (Public)",
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  await admin.from("student_profiles").upsert(
    { student_id: studentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111" },
    { onConflict: "student_id" }
  );
  const agreementOn = async (templateId, extra = {}) => {
    const { data, error } = await admin.from("agreements")
      .insert({ student_id: studentId, template_id: templateId, status: "draft", signing_method: "paper", installment_count: 2, ...extra })
      .select("id, version").single();
    if (error) throw new Error(`agreement: ${error.message}`);
    return data;
  };
  const onStandard = await agreementOn(standard.id);
  // Both are Italy's and both v1, so the card tells them apart by the
  // discount it prints ("· discount 1"); the Standard one has none.
  const onPlaceholders = { ...(await agreementOn(placeholderTemplateId, { discount_amount: 1 })), discounted: true };

  const page = await signIn(browser, sup.email);

  /**
   * Presses Generate/Regenerate PDF on one agreement's card; the PDF, or what
   * the page said. A card names the country and version, not the template, and
   * both fixtures are Italy's, so the version tells them apart.
   */
  async function generate({ id: agreementId, discounted = false }) {
    await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
    const header = page.locator('button[aria-expanded="false"]').filter({ hasText: "Agreement" }).first();
    if (await header.count()) await header.click();
    const withButton = page.locator("div").filter({ has: page.getByRole("button", { name: /^(Re)?generate PDF$/i }) });
    const card = (discounted ? withButton.filter({ hasText: "discount 1" }) : withButton.filter({ hasNotText: "discount" })).last();
    const button = card.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
    await button.waitFor({ timeout: 40000 });
    await hydrated(page, "main button");
    const was = (await admin.from("agreements").select("pdf_path, updated_at").eq("id", agreementId).single()).data;
    await button.click();
    const after = await poll(async () => {
      const { data } = await admin.from("agreements").select("pdf_path, updated_at").eq("id", agreementId).single();
      return data?.pdf_path && data.updated_at !== was?.updated_at ? data : null;
    }, 30);
    if (!after) return { error: (await card.innerText()).replace(/\s+/g, " ") };
    const { data: file } = await admin.storage.from("documents").download(after.pdf_path);
    return pdfText(Buffer.from(await file.arrayBuffer()));
  }

  // ---------------------------------------------------------------- the tab
  console.log("\n--- the Company details tab ---");
  await page.goto(`${BASE}/setup/agreement-templates?tab=company`, { waitUntil: "domcontentloaded" });
  const nameInput = page.locator('input[name="company_name"]');
  await nameInput.waitFor({ timeout: 40000 });
  ok("the tab hydrates", await hydrated(page, 'input[name="company_name"]'));
  const officePreview = page.locator("[data-preview-office-line]");
  ok("it starts on exactly what agreements have printed", (await officePreview.innerText()).trim() === PRINTED_BEFORE, await officePreview.innerText());

  // A placeholder with nothing to print stops the agreement before it goes out.
  const refusedPdf = await generate(onPlaceholders);
  ok("a template quoting {{company_email}} will not generate while the email is blank",
    Boolean(refusedPdf.error) && /company's email, which is blank/.test(refusedPdf.error), refusedPdf.error ?? "a PDF was generated");

  await page.goto(`${BASE}/setup/agreement-templates?tab=company`, { waitUntil: "domcontentloaded" });
  await nameInput.waitFor({ timeout: 40000 });
  await hydrated(page, 'input[name="company_name"]');
  for (const [name, value] of Object.entries(NEW)) await page.locator(`[name="${name}"]`).fill(value);
  ok("typing changes the office line before anything is saved", (await officePreview.innerText()).trim() === NEW_LINE, await officePreview.innerText());
  ok("...and the header and the signature caption",
    (await page.locator("[data-preview-header]").innerText()).includes("zztmp Consultants") &&
      (await page.locator("[data-preview-signature]").innerText()).includes("(Signature) zztmp Consultants"));
  ok("...and says it is not saved yet", /not saved yet/i.test(await page.locator("[data-company-preview]").innerText()));

  await page.getByRole("button", { name: "Preview on an agreement" }).click();
  const frame = page.locator('iframe[title="Agreement preview"]');
  const shown = await frame.waitFor({ timeout: 90000 }).then(() => true, () => false);
  let previewed = { isPdf: false, flat: "" };
  if (shown) {
    const b64 = await page.evaluate(async (u) => {
      const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, await frame.getAttribute("src"));
    previewed = pdfText(Buffer.from(b64, "base64"));
    await page.getByRole("dialog", { name: "Preview of an agreement" }).getByRole("button", { name: "Close" }).click();
  }
  ok("Preview on an agreement prints the unsaved office line", previewed.isPdf && previewed.flat.includes(NEW_LINE), previewed.flat.slice(0, 600) || (await bodyTail(page)));
  ok("...the name in the header and under the signature", previewed.flat.includes("(Signature) zztmp Consultants") && (previewed.flat.match(/zztmp Consultants/g) ?? []).length >= 3,
    around(previewed.flat, "(Signature)"));
  ok("...and not the old address", !previewed.flat.includes("Dashtiyar"));
  const { data: afterPreview } = await admin.from("agreement_settings").select("company_name").eq("id", true).single();
  ok("previewing saved nothing", afterPreview.company_name === before.company_name, afterPreview.company_name);

  // ------------------------------------------- saving, and real agreements
  console.log("\n--- saving, and a real agreement ---");
  await page.getByRole("button", { name: "Save company details" }).click();
  const saved = await poll(async () => {
    const { data } = await admin.from("agreement_settings").select("*").eq("id", true).single();
    return data?.company_name === "zztmp Consultants" ? data : null;
  }, 30);
  ok("saving writes the details", Boolean(saved));
  ok("...the address as one line", saved?.office_address === "zztmp Suite 9, zztmp Karachi", saved?.office_address);
  ok("...a cleared contact as empty, not as an empty string", saved?.mobile === null && saved?.website === null);

  const real = saved ? await generate(onStandard) : { error: "not saved" };
  const withPlaceholders = saved ? await generate(onPlaceholders) : { error: "not saved" };
  // Back straight away: every real agreement generated until now prints these.
  const { error: restoreError } = await restore();
  ok("the real details are put back at once", !restoreError, restoreError?.message);

  ok("a real agreement prints the saved office line, read from the database", real.flat?.includes(NEW_LINE), real.error ?? real.flat?.slice(0, 600));
  ok("...the name in its header and under the signature", real.flat?.includes("(Signature) zztmp Consultants") && (real.flat?.match(/zztmp Consultants/g) ?? []).length >= 3,
    around(real.flat ?? "", "(Signature)"));
  ok("...and no trace of the old address", real.flat !== undefined && !real.flat.includes("Dashtiyar"));
  ok("a template's {{company_…}} placeholders print the saved details",
    withPlaceholders.flat?.includes("Write to zztmp@example.invalid at zztmp Suite 9, zztmp Karachi."), withPlaceholders.error ?? withPlaceholders.flat?.slice(0, 400));

  // ------------------------------------------------------------------- Italy
  console.log("\n--- Italy's Standard agreement ---");
  const italyAgain = await generate(onStandard);
  ok("with the real details back, Italy's Standard agreement prints them", italyAgain.flat?.includes(PRINTED_BEFORE), italyAgain.error ?? italyAgain.flat?.slice(0, 600));
  ok("...and the landline is 777, not the 778 it used to print", italyAgain.flat !== undefined && !italyAgain.flat.includes("999 778"));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  const { error } = await restore();
  if (error) console.log(`!! could not restore agreement_settings: ${error.message}`);
  await browser?.close().catch(() => {});
  if (studentId) {
    const { data: files } = await admin.from("agreements").select("pdf_path").eq("student_id", studentId);
    const paths = (files ?? []).map((f) => f.pdf_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    await admin.from("agreements").delete().eq("student_id", studentId);
  }
  if (placeholderTemplateId) await admin.from("agreement_templates").delete().eq("id", placeholderTemplateId);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
