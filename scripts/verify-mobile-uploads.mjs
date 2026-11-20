// Uploading from a phone opens the file picker, not the camera (2026-11-20) —
// on an emulated iPhone and an emulated Android phone, against a portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:mobileupload
//
//   * no file input on the student's Documents and Profile pages carries a
//     capture attribute — the one thing that makes a phone skip its picker and
//     start the camera (the Documents page's did);
//   * pressing to upload opens a file chooser, through which a document is
//     chosen and submitted, and stored;
//   * the profile photo is chosen the same way and uploaded.
//
// A browser here cannot show a phone's own picker; what it can show is that
// the page asks for a file and nothing else, and that the upload goes through.
// Everything is named zztmp and removed in a finally.
import { devices } from "playwright";
import { deflateSync } from "zlib";
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, removeStagedFiles, reporter, requireConfirmation } from "./verify-portal-lib.mjs";

requireConfirmation("check:mobileupload");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);

async function poll(fn, seconds = 45, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 120);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let browser = null;
const made = [];

try {
  const proc = await fx.staff(`mobup${RUN}`, ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id, display_name").eq("display_name", "Italy (Public)").single();
  browser = await openBrowser();

  for (const [phone, device] of [["iPhone", devices["iPhone 13"]], ["Android", devices["Pixel 7"]]]) {
    const email = `zztmp-mobup-${phone.toLowerCase()}-${RUN}@hmark-test.local`;
    const studentId = await fx.lead({
      full_name: `zztmp Mobile ${phone} ${RUN}`, email, contact_number: phone === "iPhone" ? "0300-9999950" : "0300-9999951",
      status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
      date_of_inquiry: new Date().toISOString().slice(0, 10), processing_officer_id: proc.id, assigned_counselor_id: proc.id,
      date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", intake: "Fall 2099", level_applying_for: "masters",
      country_of_interest: italy.display_name,
    });
    await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
    await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
    const { data: user, error } = await admin.auth.admin.createUser({ email, password: FIXTURE_PASSWORD, email_confirm: true });
    if (error) throw new Error(`student login: ${error.message}`);
    made.push({ studentId, userId: user.user.id });
    await admin.from("leads").update({ auth_user_id: user.user.id, portal_active: true }).eq("id", studentId);
    const { data: req } = await admin.from("student_documents").insert({ student_id: studentId, category: "other", custom_name: `zztmp Passport photo ${RUN}`, status: "missing" }).select("id").single();

    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(document.querySelector('input[name="email"]') && Object.keys(document.querySelector('input[name="email"]')).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 60000 }).catch(() => {});
    await page.fill('input[name="email"]', email);
    await page.fill('input[type="password"]', FIXTURE_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });

    // ------------------------------------------------------------ Documents
    await page.goto(`${BASE}/portal/documents?guide=${req.id}`, { waitUntil: "domcontentloaded" });
    const row = page.locator(`[data-document-row="${req.id}"]`);
    await row.waitFor({ timeout: 60000 });
    const docInputs = await page.locator('input[type="file"]').evaluateAll((els) => els.map((e) => ({ capture: e.getAttribute("capture"), accept: e.getAttribute("accept") })));
    ok(`${phone}: no upload on the Documents page asks for the camera`, docInputs.length > 0 && docInputs.every((i) => i.capture === null), JSON.stringify(docInputs.slice(0, 3)));
    await page.waitForFunction((id) => {
      const input = document.querySelector(`[data-document-row="${id}"] input[type="file"]`);
      return Boolean(input && Object.keys(input).some((k) => k.startsWith("__reactProps")));
    }, req.id, { timeout: 60000 });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 30000 }), row.locator('input[type="file"]').click()]);
    ok(`${phone}: pressing to upload a document opens a file chooser`, Boolean(chooser));
    await chooser.setFiles({ name: "passport-photo.png", mimeType: "image/png", buffer: png(200, 260) });
    const submit = row.getByRole("button", { name: "Submit document" });
    await poll(async () => (await submit.isEnabled()) || null, 60);
    await submit.click();
    const stored = await poll(async () => {
      const { data } = await admin.from("student_document_files").select("file_name").eq("document_id", req.id);
      return data?.length ? data : null;
    }, 60);
    ok(`${phone}: the document chosen is uploaded`, stored?.[0]?.file_name === "passport-photo.png", JSON.stringify(stored));

    // ------------------------------------------------------------ Profile photo
    await page.goto(`${BASE}/portal/profile`, { waitUntil: "domcontentloaded" });
    const photoForm = page.locator("form").filter({ has: page.getByRole("button", { name: /Upload photo|Replace photo/ }) }).first();
    await photoForm.waitFor({ timeout: 60000 });
    const photoInput = photoForm.locator('input[type="file"]');
    const photoAttrs = await photoInput.evaluate((e) => ({ capture: e.getAttribute("capture"), accept: e.getAttribute("accept") }));
    ok(`${phone}: the profile photo does not ask for the camera`, photoAttrs.capture === null && /image\//.test(photoAttrs.accept ?? ""), JSON.stringify(photoAttrs));
    await page.waitForFunction((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")), await photoInput.elementHandle(), { timeout: 60000 });
    const [photoChooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 30000 }), photoInput.click()]);
    await photoChooser.setFiles({ name: "me.png", mimeType: "image/png", buffer: png(160, 160) });
    const upload = photoForm.getByRole("button", { name: /Upload photo|Replace photo/ });
    await poll(async () => (await upload.isEnabled()) || null, 60);
    await upload.click();
    const photo = await poll(async () => (await admin.from("student_profiles").select("photo_path").eq("student_id", studentId).maybeSingle()).data?.photo_path ?? null, 60);
    ok(`${phone}: the profile photo chosen is uploaded`, Boolean(photo), String(photo));
    await context.close();
  }
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  for (const { studentId, userId } of made) {
    const { data: files } = await admin.from("student_document_files").select("file_path").eq("student_id", studentId);
    const { data: prof } = await admin.from("student_profiles").select("photo_path").eq("student_id", studentId).maybeSingle();
    const paths = [...(files ?? []).map((f) => f.file_path), prof?.photo_path].filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    await removeStagedFiles(admin, userId);
    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
