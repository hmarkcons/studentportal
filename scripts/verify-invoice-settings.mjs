// Invoice Settings: everything an invoice says, kept by the accounts team.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:invoicesettings
//
//   who may write    Finance and the Super Admin, in the database and not just
//                    on the page (0286); anyone else's update matches no rows,
//                    and a required text cannot be blanked.
//   the form         every text on the invoice is a field — company, address,
//                    contacts, titles, headings, tax name, small print — and
//                    the account currency, which only fed the conversion note,
//                    is gone.
//   the preview      prints the form as it stands, saved or not. With no bank
//                    details the invoice says nothing about a bank: no heading,
//                    no reference, no "not yet configured"; with one it has the
//                    whole block. Checked both ways, so neither half passes by
//                    printing nothing at all.
//   the real PDF     an invoice built after saving prints the saved text, read
//                    from the database — the one path the preview does not
//                    share. Custom text, because the defaults are what an
//                    unreadable setting falls back to and would pass unnoticed.
//   regenerating     rebuilds a PDF already on file from the settings now
//                    saved. Run with the real settings restored, so the other
//                    invoices it rebuilds come out as the office has them.
//
// The settings row is snapshotted first and put back in a finally.
import { inflateSync } from "node:zlib";
import { clients, fixtures, openBrowser, signIn, apiAs, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:invoicesettings");

const { admin, url, anonKey } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
let pass = 0, fail = 0;
const ok = (l, c, x = "") => { if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l}${x ? "  — " + x : ""}`); } };

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// The words on a PDF page. The invoice is set in the standard Helvetica, so
// react-pdf writes its text as hex strings of WinAnsi codes inside TJ arrays,
// split wherever it kerns. Each TJ is one run: a line, or the part of a line
// that came from one piece of JSX. "{label} ({rate}% of …)" is several runs,
// so `flat` joins them back up for a phrase that spans a JSX expression.
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
  return { isPdf: text.startsWith("%PDF"), text: runs.join("\n"), flat: runs.join("") };
}

async function blobBytes(page, src) {
  const b64 = await page.evaluate(async (u) => {
    const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, src);
  return Buffer.from(b64, "base64");
}

// Waits until React has taken over the form. The Save button is in the
// server's HTML, so finding it proves nothing: text typed before hydration
// survives in an <input> but not in a <textarea>, which React resets to its
// default — on the live portal that sent the old address and small print to
// be saved while every one-line field went through.
async function hydrated(page, selector) {
  return page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, selector, { timeout: 30000 })
    .then(() => true, () => false);
}

const bodyTail = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-300);

async function preview(page, button) {
  await page.getByRole("button", { name: button }).click();
  const frame = page.locator('iframe[title="Invoice preview"]');
  const shown = await frame.waitFor({ timeout: 90000 }).then(() => true, () => false);
  if (!shown) return { isPdf: false, text: "", flat: "", error: await bodyTail(page) };
  const bytes = await blobBytes(page, await frame.getAttribute("src"));
  await page.getByRole("dialog", { name: "Preview of the invoice PDF" }).getByRole("button", { name: "Close" }).click();
  return pdfText(bytes);
}

async function storedPdf(invoiceId) {
  const { data: row } = await admin.from("invoices").select("pdf_path").eq("id", invoiceId).single();
  if (!row?.pdf_path) return { isPdf: false, text: "", flat: "" };
  const { data: file } = await admin.storage.from("documents").download(row.pdf_path);
  return file ? pdfText(Buffer.from(await file.arrayBuffer())) : { isPdf: false, text: "", flat: "" };
}

const COMPANY = "zztmp Test Consultants";
const ADDRESS = ["zztmp Suite 9, Test Plaza", "zztmp Karachi"];
const EMAIL = "zztmp-accounts@example.invalid";
const IBAN = "PK00ZZTMP0000000000000001";
const CUSTOM = {
  company_name: COMPANY,
  company_address: ADDRESS.join("\n"),
  company_phone: "+92 21 0000 0000",
  company_mobile: "",
  company_email: EMAIL,
  company_website: "www.zztmp.example",
  invoice_title: "ZZTMP BILL",
  receipt_title: "ZZTMP PAID",
  bill_to_label: "ZZTMP BILLED TO",
  tax_label: "zztmp Levy",
  payment_heading: "ZZTMP HOW TO PAY",
  schedule_heading: "ZZTMP WHEN",
  admin_fee_note: "",
  footer_note: "zztmp footer one.\nzztmp footer two.",
  account_title: "", bank_name: "", branch: "", account_number: "", iban: "", swift_code: "", payment_note: "",
};

const { data: before, error: readError } = await admin.from("invoice_settings").select("*").eq("id", true).single();
if (readError || !before) {
  console.log(`could not read invoice_settings: ${readError?.message}`);
  process.exit(1);
}
const snapshot = { ...before };
delete snapshot.id;
const restore = () => admin.from("invoice_settings").update(snapshot).eq("id", true);

let studentId = null;

try {
  const fin = await fx.staff("invsetfin", ["finance"]);
  const coun = await fx.staff("invsetcoun", ["counselor"]);

  // ============================================================ the database
  console.log("\n--- who may write ---");
  const asCoun = await apiAs(url, anonKey, coun.email);
  const { data: refused } = await asCoun.from("invoice_settings").update({ company_name: "zztmp refused" }).eq("id", true).select("id");
  ok("a counsellor's update matches nothing", !refused?.length, JSON.stringify(refused));
  const { data: still } = await admin.from("invoice_settings").select("company_name").eq("id", true).single();
  ok("...and the company name is untouched", still.company_name === before.company_name, still.company_name);

  const asFin = await apiAs(url, anonKey, fin.email);
  const { data: allowed, error: finError } = await asFin.from("invoice_settings").update({ company_name: before.company_name }).eq("id", true).select("id");
  ok("Finance may write the settings", allowed?.length === 1, finError?.message ?? JSON.stringify(allowed));
  const { error: blankError } = await asFin.from("invoice_settings").update({ company_name: "   " }).eq("id", true).select("id");
  ok("...but not blank the company name", Boolean(blankError), "a blank name was saved");

  // ================================================================ the form
  console.log("\n--- the form, as Finance ---");
  const page = await signIn(browser, fin.email);
  await page.goto(`${BASE}/setup/invoice-settings`, { waitUntil: "domcontentloaded" });
  const save = page.getByRole("button", { name: "Save invoice settings" });
  const found = await save.waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok("Finance gets a Save button", found, await bodyTail(page));
  if (!found) throw new Error("no form to drive");
  const form = page.locator("form").filter({ has: save });
  ok("the form hydrates", await hydrated(page, 'textarea[name="company_address"]'));
  ok("...and the fields are editable", await form.locator('input[name="company_name"]').isEnabled());
  for (const name of Object.keys(CUSTOM)) {
    ok(`there is a field for ${name}`, (await form.locator(`[name="${name}"]`).count()) === 1);
  }
  ok("the account currency field is gone", (await form.locator('[name="account_currency"]').count()) === 0);

  for (const [name, value] of Object.entries(CUSTOM)) await form.locator(`[name="${name}"]`).fill(value);

  // ---------------------------------------------------------- the preview
  console.log("\n--- the preview ---");
  await form.locator('[name="iban"]').fill(IBAN);
  const withBank = await preview(page, "Preview invoice");
  ok("the preview is a PDF", withBank.isPdf, withBank.error);
  ok("...with a bank account it prints the payment heading", withBank.text.includes("ZZTMP HOW TO PAY"), withBank.text.slice(0, 400));
  ok("...and the IBAN", withBank.text.includes(IBAN));

  await form.locator('[name="iban"]').fill("");
  const noBank = await preview(page, "Preview invoice");
  const t = noBank.text;
  ok("with no bank details the payment heading is left off", noBank.isPdf && !t.includes("ZZTMP HOW TO PAY"), t.slice(0, 400));
  ok("...and so are the IBAN and the payment reference", !/IBAN|Payment Reference|Account Title/.test(t));
  ok("...and nothing says the bank is not configured", !/not yet configured|not configured/i.test(t));
  ok("the currency conversion note is gone", !/Invoiced in|payable into|exchange rate on the transfer/i.test(t));
  ok("the title is the one typed", t.split("\n").includes("ZZTMP BILL"));
  ok("the company name is the one typed", t.includes(COMPANY));
  ok("each address line is its own line", ADDRESS.every((line) => t.split("\n").includes(line)), t.slice(0, 400));
  ok("the email prints, and the cleared mobile does not", t.includes(`Email: ${EMAIL}`) && !t.includes("Mobile:"));
  ok("the Bill-to label is the one typed", t.includes("ZZTMP BILLED TO"));
  ok("the tax is called what was typed", noBank.flat.includes("zztmp Levy (15% of"), t.split("\n").filter((l) => /Levy|Tax|%/.test(l)).join(" | "));
  ok("the schedule heading is the one typed", t.includes("ZZTMP WHEN"));
  ok("a cleared admin-fee line prints nothing", !/non-refundable/.test(t));
  ok("the small print is the one typed", t.includes("zztmp footer one.") && t.includes("zztmp footer two."));
  ok("the old small print is gone", !/reserves the rights/.test(t));
  const receipt = await preview(page, "Preview receipt");
  const receiptLines = receipt.text.split("\n");
  ok("a receipt prints the receipt title", receiptLines.includes("ZZTMP PAID") && !receiptLines.includes("ZZTMP BILL"), receipt.text.slice(0, 200));

  // ------------------------------------------------------------- saving
  console.log("\n--- saving ---");
  await save.click();
  const saved = await poll(async () => {
    const { data } = await admin.from("invoice_settings").select("*").eq("id", true).single();
    return data?.company_name === COMPANY ? data : null;
  });
  ok("saving writes the settings", Boolean(saved));
  ok("...the address keeps its two lines", saved?.company_address === ADDRESS.join("\n"), JSON.stringify(saved?.company_address));
  ok("...a cleared field is stored empty, not as an empty string", saved?.company_mobile === null && saved?.iban === null && saved?.admin_fee_note === null);
  ok("...and every typed text is stored", saved && ["invoice_title", "receipt_title", "bill_to_label", "tax_label", "payment_heading", "schedule_heading", "company_email", "company_website"].every((k) => saved[k] === CUSTOM[k]));
  const said = await poll(async () => /Saved\./.test(await form.innerText()));
  ok("...and the page says Saved.", Boolean(said), await bodyTail(page));

  // ------------------------------------------------------------ a real PDF
  console.log("\n--- an invoice built from the saved settings ---");
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin.from("agreement_templates").select("id").eq("destination_id", italy.id).limit(1).single();
  studentId = await fx.lead({
    full_name: "zztmp InvSettings Student",
    email: "zztmp-invsettings@example.invalid",
    contact_number: "0300-9999998",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });
  const { data: agreement } = await admin.from("agreements").insert({
    student_id: studentId, template_id: template.id, signing_method: "paper",
    status: "signed", signed_file_path: `${studentId}/agreements/zztmp-signed.pdf`,
  }).select("id").single();
  const { data: invoiceId, error: rpcError } = await asFin.rpc("generate_invoice", {
    p_student_id: studentId, p_agreement_id: agreement.id, p_admin_charge: 300, p_consultancy_fee: 1800,
    p_currency: "EUR", p_intake: "zztmp Winter", p_terms: null, p_invoice_number: `ZZTMP-${Date.now()}`,
    p_installment_plan: null, p_installments: [{ installment_no: 1, amount: 2205, due_date: new Date().toISOString().slice(0, 10) }],
    p_tax_rate: 5, p_tax_amount: 105, p_tax_base: "total",
  });
  ok("a fixture invoice is raised", Boolean(invoiceId), rpcError?.message);

  await page.goto(`${BASE}/finance/invoice-generator`, { waitUntil: "domcontentloaded" });
  const card = page.locator("div").filter({ hasText: "zztmp InvSettings Student" }).filter({ has: page.getByRole("button", { name: /Build PDF|Rebuild PDF/ }) }).last();
  const cardFound = await card.waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok("the invoice is listed with a Build PDF button", cardFound, await bodyTail(page));
  if (cardFound) {
    await card.getByRole("button", { name: /Build PDF|Rebuild PDF/ }).click();
    const built = await poll(async () => {
      const pdf = await storedPdf(invoiceId);
      return pdf.isPdf ? pdf : null;
    }, 90);
    const r = built?.text ?? "";
    ok("the PDF is built", Boolean(built));
    ok("...with the saved company name, read from the database", r.includes(COMPANY), r.slice(0, 400));
    ok("...the saved address", ADDRESS.every((line) => r.split("\n").includes(line)));
    ok("...the saved title, tax name and small print",
      r.split("\n").includes("ZZTMP BILL") && built.flat.includes("zztmp Levy (5% of") && r.includes("zztmp footer one."),
      r.split("\n").filter((l) => /Levy|Tax|%|BILL/.test(l)).join(" | "));
    ok("...no bank block, as none is saved", !r.includes("ZZTMP HOW TO PAY") && !/IBAN|Account Title|Payment Reference/.test(r));
    ok("...and no conversion note", !/Invoiced in|payable into/i.test(r));
  }

  // ------------------------------------------------------------ regenerating
  console.log("\n--- regenerating every PDF on file ---");
  const { error: restoreError } = await restore();
  ok("the real settings are put back before regenerating", !restoreError, restoreError?.message);
  await page.goto(`${BASE}/setup/invoice-settings`, { waitUntil: "domcontentloaded" });
  const regen = page.getByRole("button", { name: "Regenerate all invoice PDFs" });
  await regen.waitFor({ timeout: 40000 });
  const { count: onFile } = await admin.from("invoices").select("id", { count: "exact", head: true }).not("pdf_path", "is", null);
  const panel = page.locator("[data-regenerate-invoices]");
  ok("the panel counts the PDFs on file", (await panel.innerText()).includes(`${onFile} invoice`), `${onFile} vs ${await panel.innerText()}`);

  // Regenerating before saving would print the old details again.
  await hydrated(page, 'input[name="company_website"]');
  await page.locator('input[name="company_website"]').fill("zztmp unsaved");
  ok("an unsaved change holds the button back", await regen.isDisabled());
  await page.reload({ waitUntil: "domcontentloaded" });
  await regen.waitFor({ timeout: 40000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Regenerate all invoice PDFs"));
    return b && !b.disabled;
  }, null, { timeout: 30000 }).catch(() => {});

  await regen.click();
  const outcome = await poll(async () => {
    const text = await panel.innerText();
    return /Rebuilt \d+ PDFs?\.|could not be rebuilt|stopped|Only the/.test(text) ? text : null;
  }, 300);
  ok("regenerating finishes", Boolean(outcome) && new RegExp(`Rebuilt ${onFile} PDF`).test(outcome), outcome ?? (await panel.innerText()));
  const rebuilt = await storedPdf(invoiceId);
  ok("...and the invoice's PDF now prints the real settings", rebuilt.text.includes(before.company_name) && !rebuilt.text.includes(COMPANY), rebuilt.text.slice(0, 300));
  ok("...still with no conversion note", !/Invoiced in|payable into/i.test(rebuilt.text));
} catch (e) {
  fail++;
  console.log(`FAIL  the check itself stopped: ${e?.stack ?? e}`);
} finally {
  const { error } = await restore();
  if (error) console.log(`!! could not restore invoice_settings: ${error.message}`);
  if (studentId) {
    const { data: files } = await admin.storage.from("documents").list(`${studentId}/invoices`);
    if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${studentId}/invoices/${f.name}`));
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
  }
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed  (${n} fixtures removed)`);
  process.exitCode = fail ? 1 : 0;
}
