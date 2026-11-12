// Email campaigns, part 1 (0354): templates, on the deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:emailtemplates
//
// Uploads a zip (index.html, a stylesheet, an image, a script file) as a
// fixture Super Admin and checks what the portal made of it:
//
//   processing   scripts, forms and click handlers taken out and listed; the
//                missing image fails its check; the unsubscribe footer added;
//                the uploaded image loads from the public bucket; the link is
//                tried; the zip's script file set aside
//   stored       no script, the CSS written onto the elements, one asset, a
//                plain-text version
//   preview      filled as the sample contact, sandboxed, dark mode, phone
//                width; refused to someone signed out
//   test send    answers; the test-link page is public and says it was a test
//   settings     the sending service shows as not connected (practice mode)
//
// The template, its stored images and the fixture staff are removed in a finally.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:emailtemplates");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const zip = new JSZip();
zip.file(
  "index.html",
  `<!DOCTYPE html><html><head><link rel="stylesheet" href="css/s.css"><script>alert(1)</script></head><body>
<div class="box" onclick="steal()"><img src="img/logo.png" alt="HMARK logo" width="120"><img src="img/missing.png">
<h1>Study in Italy, {{first_name|there}}</h1><p>Scholarships are open for September 2027. Your counsellor {{counsellor_name|our team}} can help with the whole application, the documents and the visa.</p>
<a class="btn" href="https://hmarkconsultants.com/">Visit HMARK</a>
<form action="/x"><input name="email"><button>Go</button></form></div></body></html>`
);
zip.file("css/s.css", ".btn{color:#ffffff;background:#52be96;padding:10px} h1{color:#1f2937}");
zip.file("img/logo.png", PNG);
zip.file("app.js", "alert(2)");
const zipPath = join(tmpdir(), "zztmp-template.zip");
writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }));

const { admin } = clients();
const fx = fixtures(admin);
const r = reporter();
const browser = await openBrowser();
let removed = 0;
let templateId = null;
try {
  const me = await fx.staff("emailtpl", ["super_admin"]);
  const page = await signIn(browser, me.email);
  await page.goto(`${BASE}/marketing/email/templates`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  r.ok("the Email campaigns page opens with the upload form", (await page.locator("[data-email-template-upload]").count()) === 1);

  await page.fill('[data-email-template-upload] input[name="name"]', "zztmp Email Template");
  await page.setInputFiles("[data-email-template-file]", zipPath);
  await page.getByText("— ready.").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Upload template" }).click();
  await page.waitForURL(/\/marketing\/email\/templates\/[0-9a-f-]{36}/, { timeout: 150000 });
  templateId = page.url().match(/templates\/([0-9a-f-]{36})/)[1];
  await page.waitForLoadState("networkidle").catch(() => {});
  r.ok("uploaded, and its page opens", true);

  const check = (key) => page.locator(`[data-check="${key}"]`);
  const removedText = await check("removed").innerText();
  r.ok("removed: scripts, forms and the click handler are listed", removedText.includes("Scripts") && removedText.includes("Forms and form fields") && removedText.includes("event handlers"), removedText.slice(0, 200));
  r.ok("missing image fails the check", (await check("missing_files").getAttribute("data-status")) === "fail" && (await check("missing_files").innerText()).includes("img/missing.png"));
  r.ok("the unsubscribe footer was added", (await check("unsubscribe").innerText()).includes("footer was added"));
  r.ok("the uploaded image loads from its public address", (await check("images_load").getAttribute("data-status")) === "pass", await check("images_load").innerText());
  const linkStatus = await check("links").getAttribute("data-status");
  r.ok("the link to hmarkconsultants.com is checked", linkStatus === "pass" || linkStatus === "warn", `${linkStatus}: ${await check("links").innerText()}`);
  // The list sits in a closed <details>, whose contents innerText leaves out; textContent reads them.
  r.ok("the zip's script file was set aside", ((await page.locator("details", { hasText: "Files in the zip that were not used" }).textContent()) ?? "").includes("app.js"));

  const { data: v } = await admin.from("email_template_versions").select("id, html, text_body, asset_count, footer_added, size_bytes").eq("template_id", templateId).single();
  r.ok("stored: no script, CSS inlined, image on the public bucket, one asset", !v.html.includes("<script") && v.html.includes('style="color: #ffffff; background: #52be96; padding: 10px;"') && v.html.includes("/storage/v1/object/public/email-assets/") && v.asset_count === 1 && v.footer_added);
  r.ok("stored: a plain-text version", v.text_body.includes("Study in Italy, {{first_name|there}}") && v.text_body.includes("Visit HMARK (https://hmarkconsultants.com/)"));

  const preview = await page.request.get(`${BASE}/api/marketing/email-preview/${v.id}`);
  const html = await preview.text();
  r.ok("preview: filled as the sample contact, sandboxed", html.includes("Study in Italy, Ayesha") && html.includes("Sara Ahmed") && (preview.headers()["content-security-policy"] ?? "").startsWith("sandbox"));
  const dark = await (await page.request.get(`${BASE}/api/marketing/email-preview/${v.id}?dark=1`)).text();
  r.ok("preview: dark mode", dark.includes("data-preview-dark"));
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}/api/marketing/email-preview/${v.id}`, { maxRedirects: 0 });
  r.ok("preview: not for someone signed out", anonRes.status() !== 200 || !(await anonRes.text()).includes("Study in Italy"), String(anonRes.status()));
  await anon.close();

  await page.locator("[data-preview-mobile]").click();
  const width = await page.locator("[data-email-preview-frame]").evaluate((el) => el.getBoundingClientRect().width);
  r.ok("mobile width", Math.round(width) === 375, String(width));

  await page.fill('[data-email-test-form] input[name="to"]', "zztmp-test@example.invalid");
  await page.locator("[data-email-test-form]").getByRole("button", { name: "Send test" }).click();
  await page.locator("[data-email-test-form] .text-success, [data-email-test-form] .text-danger").first().waitFor({ timeout: 30000 });
  const testMsg = await page.locator("[data-email-test-form]").innerText();
  r.ok("test send answers", testMsg.includes("Test sent to 1 address"), testMsg.slice(-200));

  const testLink = await (await page.request.get(`${BASE}/email/test-link?link=unsubscribe`)).text();
  r.ok("the test-link page is public and says so", testLink.includes("This was a test email"));

  await page.goto(`${BASE}/marketing/email/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-email-providers]").waitFor({ timeout: 30000 });
  r.ok("settings: the service shows as not connected", (await page.locator("body").innerText()).includes("Not connected"));
  await page.goto(`${BASE}/marketing/email/templates`, { waitUntil: "domcontentloaded" });
  r.ok("the template is listed", (await page.locator("[data-email-template-card]", { hasText: "zztmp Email Template" }).count()) === 1);
} catch (e) {
  r.ok("ran without error", false, e.message);
} finally {
  if (templateId) {
    const { data: objs } = await admin.storage.from("email-assets").list(templateId, { limit: 100 });
    for (const folder of objs ?? []) {
      const { data: inner } = await admin.storage.from("email-assets").list(`${templateId}/${folder.name}`, { limit: 100 });
      if (inner?.length) await admin.storage.from("email-assets").remove(inner.map((o) => `${templateId}/${folder.name}/${o.name}`));
    }
    await admin.from("email_templates").delete().eq("id", templateId);
  }
  await admin.from("email_templates").delete().like("name", "zztmp%");
  removed = await fx.cleanup();
  await browser.close();
}
process.exit(r.finish(removed) ? 1 : 0);
