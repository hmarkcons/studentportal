// Signing an agreement in the portal, and correcting a signed one, end to end
// against a deployed portal:
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:esign
//
//   * a student whose e-signature agreement is ready signs it in the portal:
//     a signature drawn on the pad, or a photo of one — its paper taken out
//     (the corners of the cleaned picture are clear, the ink is not);
//   * the agreement is built with it and shown before anything is submitted;
//     the preview and the submitted copy carry the signature (one more image
//     than the unsigned agreement) and "Signed electronically by …";
//   * submitted with the consent video, it is filed as their signed
//     agreement, their portal opens, and staff see it marked as e-signed;
//   * a Super Admin removes the signed copy with a reason: archived, the
//     agreement waiting for a signature again, the student told why and held
//     to the agreement once more;
//   * a Super Admin deletes an agreement an invoice was raised on: told the
//     invoice stays, and it does, no longer linked.
//
// Fixtures are named zztmp and removed in a finally, with their files.
import fs from "node:fs";
import { inflateSync } from "node:zlib";
import { BASE, FIXTURE_PASSWORD, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:esign");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const STUDENT = "zztmp Esign Student";
const STUDENT_EMAIL = "zztmp-esign-student@hmark-test.local";

/** Polls until `fn` returns something truthy, or gives up after `seconds`. */
async function poll(fn, seconds = 30, every = 500) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

const hydrated = (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
  }, selector, { timeout: 60000 });

// The words a react-pdf PDF draws, from its inflated content streams — the
// same reading as check:agreementcompany and check:agreementdate.
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
  return runs.join(" ").replace(/\s+/g, " ");
}

/** How many pictures a PDF holds: the logo and HMARK's signature, and the student's once signed. */
const imageCount = (buf) => (Buffer.from(buf).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;

const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png`, fullPage: true });
};

const download = async (path) => {
  const { data } = await admin.storage.from("documents").download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
};

let browser = null;
let studentUserId = null;
let studentId = null;
const invoiceIds = [];

try {
  {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email === STUDENT_EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  const sup = await fx.staff("esignsuper", ["super_admin"]);

  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();
  const { data: templates } = await admin.from("agreement_templates").select("id, name, wording").eq("destination_id", italy.id);
  const standard = (templates ?? []).find((t) => t.name === "Standard" && !t.wording?.trim()) ?? templates?.[0];
  if (!standard) throw new Error("Italy (Public) has no agreement template to sign");

  studentId = await fx.lead({
    full_name: STUDENT, email: STUDENT_EMAIL, contact_number: "0300-9999951",
    status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
    date_of_inquiry: new Date().toISOString().slice(0, 10), country_of_interest: "Italy (Public)", intake: "Fall 2099",
    date_of_birth: "2002-04-17", address: "12 Test Street, Karachi", level_applying_for: "masters",
  });
  await admin.from("lead_destinations").insert({ lead_id: studentId, destination_id: italy.id, is_backup: false });
  await admin.from("student_profiles").upsert(
    { student_id: studentId, emergency_contact_name: "zztmp Next of Kin", emergency_contact_relation: "Father", emergency_contact_number: "0300-1111111" },
    { onConflict: "student_id" }
  );
  const coded = await poll(async () => (await admin.from("leads").select("student_code").eq("id", studentId).single()).data?.student_code, 20);
  ok("the fixture student has a Student ID", Boolean(coded));
  const { data: made, error: authError } = await admin.auth.admin.createUser({ email: STUDENT_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
  if (authError) throw new Error(`student login: ${authError.message}`);
  studentUserId = made.user.id;
  await admin.from("leads").update({ auth_user_id: studentUserId, portal_active: true }).eq("id", studentId);

  const { data: agreement, error: agreementError } = await admin
    .from("agreements")
    .insert({ student_id: studentId, template_id: standard.id, destination_id: italy.id, signing_method: "e_signature", status: "pending_signature" })
    .select("id")
    .single();
  if (agreementError) throw new Error(`agreement: ${agreementError.message}`);

  browser = await openBrowser();
  const staff = await signIn(browser, sup.email);
  await staff.setViewportSize({ width: 1500, height: 1100 });
  staff.on("dialog", (d) => d.accept());

  // ------------------------------------------------- staff make it final
  console.log("\n--- the agreement made ready ---");
  await staff.goto(`${BASE}/students/${studentId}?open=agreement`, { waitUntil: "domcontentloaded" });
  const pdfButton = staff.getByRole("button", { name: /^(Re)?generate PDF$/i }).first();
  await pdfButton.waitFor({ timeout: 60000 });
  await hydrated(staff, "main button");
  await pdfButton.click();
  const generated = await poll(async () => (await admin.from("agreements").select("pdf_path").eq("id", agreement.id).single()).data?.pdf_path, 60);
  ok("staff generate the agreement's PDF", Boolean(generated));
  const unsigned = generated ? await download(generated) : null;
  const unsignedImages = unsigned ? imageCount(unsigned) : 0;

  // ------------------------------------------------------- the student signs
  console.log("\n--- the student signs in the portal ---");
  const student = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await student.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await student
    .waitForFunction(() => {
      const el = document.querySelector('input[name="email"]');
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactFiber")));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await student.fill('input[name="email"]', STUDENT_EMAIL);
  await student.fill('input[type="password"]', FIXTURE_PASSWORD);
  await student.click('button[type="submit"]');
  await student.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  await student.goto(`${BASE}/portal/agreement`, { waitUntil: "domcontentloaded" });

  const pad = student.locator("[data-signature-pad]");
  await pad.waitFor({ timeout: 60000 });
  await hydrated(student, "[data-signature-pad]");
  ok("signing here is the first choice", (await student.locator('[data-sign-method="esign"]').getAttribute("aria-checked")) === "true");

  // A signature drawn with the mouse: a loop and a long tail.
  const box = await pad.boundingBox();
  const at = (fx_, fy) => [box.x + box.width * fx_, box.y + box.height * fy];
  await student.mouse.move(...at(0.15, 0.6));
  await student.mouse.down();
  for (const [x, y] of [[0.2, 0.3], [0.28, 0.65], [0.36, 0.35], [0.45, 0.62], [0.55, 0.4], [0.68, 0.58], [0.85, 0.45]]) {
    await student.mouse.move(...at(x, y), { steps: 8 });
  }
  await student.mouse.up();
  await shot(student, "e1-drawn");
  await student.locator("[data-signature-use]").click();
  const opened = student.locator("[data-esign-open]");
  const previewed = await opened.waitFor({ timeout: 120000 }).then(() => true, () => false);
  ok("the drawn signature is put into the agreement, to look at", previewed,
    (await student.locator("[data-sign-step]").innerText().catch(() => "")).replace(/\s+/g, " "));
  ok("...shown in place", (await student.locator("[data-esign-frame]").count()) === 1);
  await shot(student, "e2-preview");
  ok("submitting waits for the consent video", await student.locator("[data-submit-agreement]").isDisabled());

  if (previewed) {
    const res = await student.request.get(await opened.getAttribute("href"));
    const preview = Buffer.from(await res.body());
    const words = pdfText(preview);
    ok("the preview says who signed it, and how", words.includes(`Signed electronically by ${STUDENT}`), words.slice(-400));
    ok("...and carries the signature", imageCount(preview) > unsignedImages, `${imageCount(preview)} images against ${unsignedImages}`);
  }

  // A photo of a signature on paper instead: a page in shadow, a dark scrawl.
  await student.getByRole("button", { name: "Change signature" }).click();
  await student.locator('[data-signature-mode="upload"]').click();
  const photo = await student.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 360;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 900, 0);
    g.addColorStop(0, "#f6f6f2");
    g.addColorStop(1, "#9c9c96");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 360);
    ctx.strokeStyle = "#20222a";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(120, 240);
    ctx.bezierCurveTo(180, 60, 260, 300, 340, 150);
    ctx.bezierCurveTo(420, 40, 520, 290, 640, 170);
    ctx.lineTo(800, 210);
    ctx.stroke();
    return c.toDataURL("image/jpeg", 0.9);
  });
  await student.locator("[data-signature-photo-input]").setInputFiles({
    name: "my-signature.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(photo.split(",")[1], "base64"),
  });
  const cleaned = student.locator("[data-signature-cleaned]");
  await cleaned.waitFor({ timeout: 30000 });
  await shot(student, "e3-photo-cleaned");
  const pixels = await cleaned.evaluate(async (img) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let inked = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 128) inked++;
    return { corner: d[3], farCorner: d[d.length - 1], inked, total: d.length / 4 };
  });
  ok("a photo's paper is taken out — shadow and all", pixels.corner === 0 && pixels.farCorner === 0, JSON.stringify(pixels));
  ok("...and its ink kept", pixels.inked > 500 && pixels.inked < pixels.total * 0.4, JSON.stringify(pixels));
  await student.locator("[data-signature-use]").click();
  ok("the photographed signature goes into the agreement too", await opened.waitFor({ timeout: 120000 }).then(() => true, () => false));

  // ------------------------------------------------------------- submitted
  await student.locator('input[type="file"][accept*="video"]').first().setInputFiles({
    name: "consent.webm", mimeType: "video/webm", buffer: Buffer.from("zztmp consent recording"),
  });
  const submit = student.locator("[data-submit-agreement]");
  await poll(async () => ((await submit.isEnabled()) ? true : null), 60);
  ok("with the video, it can be submitted", await submit.isEnabled());
  ok("...as the e-signed agreement", /Submit e-signed agreement/.test(await submit.innerText()));
  await submit.click();
  const filed = await poll(async () => {
    const { data } = await admin.from("agreements").select("status, signed_file_path, video_recording_path, document_status").eq("id", agreement.id).single();
    return data?.signed_file_path && data.video_recording_path ? data : null;
  }, 90);
  ok("it is filed as their signed agreement, with the video", /-e-signed\.pdf$/.test(filed?.signed_file_path ?? ""), JSON.stringify(filed));
  ok("...waiting for staff to check it", filed?.status === "pending_signature" && filed?.document_status === "pending", JSON.stringify(filed));
  if (filed) {
    const copy = await download(filed.signed_file_path);
    if (copy && process.env.SHOTS_DIR) fs.writeFileSync(`${process.env.SHOTS_DIR}/esigned.pdf`, copy);
    const words = copy ? pdfText(copy) : "";
    ok("the filed copy carries the signature and when it was given",
      Boolean(copy) && imageCount(copy) > unsignedImages && /Signed electronically by zztmp Esign Student on \d{1,2} \w+ \d{4} at \d{1,2}:\d{2} [ap]m \(Pakistan time\)/.test(words),
      words.slice(-300));
    const { data: kept } = await admin.storage.from("documents").list(`${studentId}/agreements`);
    ok("...the signature image is kept beside it, and the preview is gone",
      (kept ?? []).some((f) => /-signature-\d+\.png$/.test(f.name)) && !(kept ?? []).some((f) => /esign-preview/.test(f.name)),
      (kept ?? []).map((f) => f.name).join(", "));
  }
  await student.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  ok("their portal opens once it is submitted", new URL(student.url()).pathname === "/portal/documents", student.url());

  // ------------------------------------------------------------ staff see it
  console.log("\n--- staff ---");
  await staff.goto(`${BASE}/students/${studentId}?open=agreement`, { waitUntil: "domcontentloaded" });
  ok("staff see it was e-signed in the portal", await staff.locator("[data-portal-esigned]").first().waitFor({ timeout: 60000 }).then(() => true, () => false));

  // -------------------------------------------------- the signed copy removed
  console.log("\n--- a Super Admin removes the signed copy ---");
  const REASON = "zztmp The consultancy fee was corrected; please sign the updated agreement";
  await hydrated(staff, '#card-agreement button[aria-label="Actions"]');
  await staff.locator('#card-agreement button[aria-label="Actions"]').first().click();
  await staff.locator("[data-remove-signed]").click();
  const dialog = staff.locator("[data-remove-signed-dialog]");
  await dialog.waitFor({ timeout: 15000 });
  await dialog.locator("[data-remove-reason]").fill(REASON);
  await shot(staff, "e4-remove-dialog");
  await dialog.locator("[data-remove-confirm]").click();
  const removed = await poll(async () => {
    const { data } = await admin.from("agreements").select("status, signed_file_path, video_recording_path, document_status, document_review_note").eq("id", agreement.id).single();
    return data && !data.signed_file_path ? data : null;
  }, 30);
  ok("the signed copy comes off, and the video with it", removed && !removed.video_recording_path, JSON.stringify(removed));
  ok("...the agreement waiting for a signature again, the reason recorded",
    removed?.status === "pending_signature" && removed?.document_status === "rejected" && removed?.document_review_note === REASON, JSON.stringify(removed));
  const { count: archived } = await admin.from("agreement_submission_archive").select("id", { count: "exact", head: true }).eq("agreement_id", agreement.id).eq("reason", REASON);
  ok("...both kept in its history", archived === 2, String(archived));

  await student.goto(`${BASE}/portal/documents`, { waitUntil: "domcontentloaded" });
  ok("the student is held to the agreement again", new URL(student.url()).pathname === "/portal/agreement", student.url());
  const told = await poll(async () => ((await student.locator("body").innerText()).includes(REASON) ? true : null), 30);
  ok("...and told why", told === true);
  ok("...and can sign again here", (await student.locator("[data-signature-pad]").count()) === 1);

  // ------------------------------------------- an invoiced agreement deleted
  console.log("\n--- a Super Admin deletes an invoiced agreement ---");
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .insert({ student_id: studentId, agreement_id: agreement.id, currency: "EUR", consultancy_fee: 100, admin_charge: 0 })
    .select("id")
    .single();
  if (invoiceError) throw new Error(`invoice: ${invoiceError.message}`);
  invoiceIds.push(invoice.id);
  await staff.reload({ waitUntil: "domcontentloaded" });
  await hydrated(staff, '#card-agreement button[aria-label="Actions"]');
  let asked = "";
  staff.removeAllListeners("dialog");
  staff.once("dialog", (d) => {
    asked = d.message();
    d.accept();
  });
  await staff.locator('#card-agreement button[aria-label="Actions"]').first().click();
  await staff.getByRole("button", { name: /^Delete$/ }).click();
  const gone = await poll(async () => ((await admin.from("agreements").select("id").eq("id", agreement.id).maybeSingle()).data ? null : true), 30);
  ok("staff are told the invoice stays", /invoice stays/.test(asked), asked);
  ok("the agreement is deleted, invoice or no invoice", gone === true);
  const { data: kept } = await admin.from("invoices").select("id, agreement_id").eq("id", invoice.id).maybeSingle();
  ok("...and the invoice stands, no longer linked to it", Boolean(kept) && kept.agreement_id === null, JSON.stringify(kept));
} finally {
  await browser?.close().catch(() => {});
  for (const id of invoiceIds) await admin.from("invoices").delete().eq("id", id);
  if (studentId) {
    await admin.from("agreements").delete().eq("student_id", studentId);
    const { data: files } = await admin.storage.from("documents").list(`${studentId}/agreements`);
    if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${studentId}/agreements/${f.name}`));
  }
  if (studentUserId) await admin.auth.admin.deleteUser(studentUserId).catch(() => {});
  const removedFixtures = await fx.cleanup();
  process.exitCode = finish(removedFixtures) === 0 ? 0 : 1;
}
