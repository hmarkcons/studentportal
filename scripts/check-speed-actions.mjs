// How long the portal takes to DO something, as opposed to show something.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:speed:actions
//
// check:speed measures navigations. This measures the buttons: generating an
// agreement, uploading the signed copy, raising an invoice, adding an item,
// recording a payment. Those are server actions, and a server action does two
// things the page load does not — the write itself, and then whatever
// revalidatePath forces to re-render before the response can return. A button
// on a heavy page can therefore be slow for a reason that has nothing to do
// with the write.
//
// What is timed is the server action's own POST: from the click to the last
// byte of its response. That is exactly the wait between pressing a button and
// the screen changing.
//
// It creates a throwaway student named "zztmp *" and removes everything in a
// finally, the same as the other check:* scripts.
import { clients, fixtures, openBrowser, signIn, requireConfirmation, BASE } from "./verify-portal-lib.mjs";

requireConfirmation("check:speed:actions");

const { admin } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);

const results = [];

/**
 * Clicks something and waits for the server action it fires.
 *
 * Any POST back to the portal counts. Matching on Next's own `next-action`
 * request header would be tighter, but it is an internal detail that has
 * changed between versions — and when it does not match, this waits the full
 * timeout and reports nothing, which is worse than being slightly broad. A
 * page load is a GET, so a POST here is the button.
 */
async function timeAction(page, label, click) {
  const waiting = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().startsWith(BASE),
    { timeout: 45000 }
  );
  const t0 = Date.now();
  await click();
  try {
    const response = await waiting;
    await response.finished();
    const ms = Date.now() - t0;
    results.push([label, ms]);
    console.log(`  ${String(ms + " ms").padStart(9)}   ${label}`);
    return ms;
  } catch {
    results.push([label, null]);
    console.log(`  ${"no action".padStart(9)}   ${label}  (button not found, or it fired nothing)`);
    return null;
  }
}

const expand = async (page, title) => {
  const header = page.locator('button[aria-expanded="false"]').filter({ hasText: title }).first();
  if (await header.count()) await header.click();
};

/**
 * Playwright waits for an element to become actionable and then throws, which
 * would abandon the whole run over one button that moved. Every step here is
 * optional: a step that cannot run says so and the rest still report.
 */
async function step(label, fn) {
  try {
    await fn();
  } catch (e) {
    results.push([label, null]);
    console.log(`  ${"skipped".padStart(9)}   ${label}  (${String(e.message ?? e).split("\n")[0].slice(0, 70)})`);
  }
}

let studentId = null;

try {
  const sup = await fx.staff("speedsuper", ["super_admin"]);
  const page = await signIn(browser, sup.email);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: template } = await admin
    .from("agreement_templates")
    .select("id")
    .eq("destination_id", italy.id)
    .limit(1)
    .single();

  studentId = await fx.lead({
    full_name: "zztmp Speed Student",
    email: "zztmp-speed@example.invalid",
    contact_number: "0300-1111111",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10),
    country_of_interest: "Italy (Public)",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id });

  console.log(`\n${BASE}\n`);
  console.log("     time    action");
  console.log("----------------------------------------------------------");

  await page.goto(`${BASE}/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expand(page, "Agreement");

  // --- generating an agreement, and uploading the signed copy ---
  await step("generate an agreement", async () => {
    await page.locator('select[name="template_id"]').first().selectOption(template.id, { timeout: 15000 });
    await page.locator('select[name="signing_method"]').first().selectOption("paper");
    await timeAction(page, "generate an agreement", () =>
      page.getByRole("button", { name: /^Generate agreement$/i }).first().click()
    );
  });

  await step("upload a signed agreement (256 KB)", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Agreement");
    // A quarter of a megabyte, which is a small scan. The upload crosses from
    // the browser to the function region, so this is the leg a document upload
    // actually pays.
    await page.locator('input[type="file"]').first().setInputFiles(
      {
        name: "zztmp-signed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(256 * 1024, 0x20)]),
      },
      { timeout: 15000 }
    );
    await timeAction(page, "upload a signed agreement (256 KB)", () =>
      page.getByRole("button", { name: /Upload signed agreement|Replace signed agreement/i }).first().click()
    );
  });

  // --- the invoice actions ---
  await step("generate an invoice", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Invoice");
    const generate = page.getByRole("button", { name: "Generate invoice" }).first();
    const form = page.locator("form").filter({ has: generate }).first();
    await form.locator('input[name^="admin_charge"]').first().fill("300", { timeout: 15000 });
    await form.locator('input[name="consultancy_fee"]').fill("1800");
    await form.locator('select[name="installment_count"]').selectOption("3");
    await form.locator('input[name="first_due_date"]').fill("2026-10-05");
    await timeAction(page, "generate an invoice", () => generate.click());
  });

  await step("add an item to an invoice", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Invoice");
    const addItem = page.getByRole("button", { name: "+ Add item" }).first();
    const form = page.locator("form").filter({ has: addItem }).first();
    await form.locator('input[name="name"]').fill("zztmp Speed Item", { timeout: 15000 });
    await form.locator('input[name="amount"]').fill("100");
    await timeAction(page, "add an item to an invoice", () => addItem.click());
  });

  await step("record a payment", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Invoice");
    await page.getByRole("button", { name: /^Mark paid$/ }).first().waitFor({ timeout: 15000 });
    await timeAction(page, "record a payment", () =>
      page.getByRole("button", { name: /^Mark paid$/ }).first().click()
    );
  });

  await step("rebuild the invoice PDF by hand", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expand(page, "Invoice");
    await page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first().waitFor({ timeout: 15000 });
    await timeAction(page, "rebuild the invoice PDF by hand", () =>
      page.getByRole("button", { name: /^(Re)?generate PDF$/i }).first().click()
    );
  });

  const timed = results.filter(([, ms]) => ms !== null);
  const worst = [...timed].sort((a, b) => b[1] - a[1])[0];
  console.log("----------------------------------------------------------");
  console.log(`slowest: ${worst?.[0]} at ${worst?.[1]} ms`);
  console.log(`all of them together: ${(timed.reduce((s, [, ms]) => s + ms, 0) / 1000).toFixed(1)} s`);

  await page.close();
} finally {
  if (studentId) {
    const { data: files } = await admin.storage.from("documents").list(`${studentId}/invoices`);
    if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${studentId}/invoices/${f.name}`));
    const { data: agFiles } = await admin.storage.from("documents").list(`${studentId}/agreements`);
    if (agFiles?.length) await admin.storage.from("documents").remove(agFiles.map((f) => `${studentId}/agreements/${f.name}`));
    await admin.from("invoices").delete().eq("student_id", studentId);
    await admin.from("agreements").delete().eq("student_id", studentId);
  }
  const n = await fx.cleanup();
  await browser.close();
  console.log(`\n(${n} fixtures removed)`);
}
