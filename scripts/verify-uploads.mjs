// Uploads up to 5 MB, sent straight to storage rather than through Vercel.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:uploads
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Drives a real form (a sick-leave certificate on My leave) and checks the
// things that would be different if the feature were broken — never a phrase
// that could appear anyway:
//
//   1. A 4.8 MB file arrives whole, in the right place, at its full size —
//      which a Vercel Function could never have received (4.5 MB limit) —
//      and no request the page sent to the server carried the file.
//   2. Pressing Submit while the file is still uploading is not a click lost:
//      the request is sent as soon as the upload lands.
//   3. A 5.3 MB PDF is refused with its size and advice, and nothing is
//      uploaded.
//   4. An oversized photo is not shrunk unasked: it is refused with a
//      "Shrink to fit" button, nothing is uploaded until it is pressed, and
//      then a smaller copy is.
//   5. Storage itself holds the line (0275): it refuses an over-limit file, a
//      file put in someone else's folder, and reading someone else's file.
//
// Needs migration 0275 applied.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:uploads");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const MB = 1024 * 1024;
const STAGING = "upload-staging";

/** A real PDF header and trailer around padding, so it is a PDF of any size. */
function pdfOfSize(bytes, label) {
  const head = Buffer.from(`%PDF-1.4\n% zztmp ${label}\n`);
  const tail = Buffer.from("\n%%EOF\n");
  const pad = Buffer.alloc(bytes - head.length - tail.length, 0x20);
  return Buffer.concat([head, pad, tail]);
}

async function stagedFor(userId) {
  const { data } = await admin.storage.from(STAGING).list(userId, { limit: 100 });
  return (data ?? []).map((o) => ({ name: o.name, size: o.metadata?.size ?? 0 }));
}

async function objectSize(bucket, path) {
  const dir = path.split("/").slice(0, -1).join("/");
  const base = path.split("/").pop();
  const { data } = await admin.storage.from(bucket).list(dir, { limit: 100, search: base });
  return data?.find((o) => o.name === base)?.metadata?.size ?? null;
}

async function waitFor(fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 750));
  }
  return null;
}

const nextYear = new Date().getUTCFullYear() + 1;
const weekday = (month, day) => {
  const d = new Date(Date.UTC(nextYear, month - 1, day));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

let me = null;
let other = null;
try {
  me = await fx.staff("up-staff", ["counselor"]);
  other = await fx.staff("up-other", ["counselor"]);
  await admin.from("staff").update({ joined_on: "2020-01-15", email_official: me.email }).eq("id", me.id);

  const browser = await openBrowser();
  const page = await signIn(browser, me.email);

  // Every server action request the page sends, with how much it carried.
  const actionBodies = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) actionBodies.push(r.postDataBuffer()?.length ?? 0);
  });

  async function openForm() {
    await page.goto(`${BASE}/my-leave`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "My leave" }).waitFor({ timeout: 60_000 });
    await page.locator('select[name="kind"]').selectOption("sick");
    const form = page.locator("form", { has: page.getByRole("button", { name: "Request leave" }) });
    await form.locator('input[type="file"]').waitFor({ timeout: 30_000 });
    return form;
  }

  // ------------------------------------------------ 1. 4.8 MB, all the way
  let form = await openForm();
  const day1 = weekday(5, 4);
  await form.locator('input[name="start_date"]').fill(day1);
  await form.locator('input[name="end_date"]').fill(day1);
  await form.locator('input[type="file"]').setInputFiles({ name: "certificate-4-8mb.pdf", mimeType: "application/pdf", buffer: pdfOfSize(Math.round(4.8 * MB), "4.8") });
  await form.locator('input[type="file"][data-staged]').waitFor({ timeout: 120_000 });
  const staged1 = await stagedFor(me.id);
  ok("the file is in the staging bucket, in their own folder, at full size", staged1.some((o) => o.size === Math.round(4.8 * MB)), JSON.stringify(staged1));

  await form.getByRole("button", { name: "Request leave" }).click();
  const req1 = await waitFor(async () => (await admin.from("leave_requests").select("id, certificate_path").eq("staff_id", me.id).eq("start_date", day1).maybeSingle()).data);
  ok("the request is saved with its certificate", Boolean(req1?.certificate_path), JSON.stringify(req1));
  const size1 = req1?.certificate_path ? await objectSize("documents", req1.certificate_path) : null;
  ok("...stored where it belongs, all 4.8 MB of it (Vercel would have refused it)", size1 === Math.round(4.8 * MB), String(size1));
  const biggest = Math.max(0, ...actionBodies);
  ok("no request to the server carried the file", actionBodies.length > 0 && biggest < 64 * 1024, `${actionBodies.length} action requests, largest ${biggest} bytes`);

  // ------------------------------------- 2. Submit pressed mid-upload is kept
  form = await openForm();
  const day2 = weekday(6, 8);
  await form.locator('input[name="start_date"]').fill(day2);
  await form.locator('input[name="end_date"]').fill(day2);
  await form.locator('input[type="file"]').setInputFiles({ name: "certificate-early.pdf", mimeType: "application/pdf", buffer: pdfOfSize(Math.round(4.5 * MB), "early") });
  await form.getByRole("button", { name: "Request leave" }).click();
  const req2 = await waitFor(async () => (await admin.from("leave_requests").select("id, certificate_path").eq("staff_id", me.id).eq("start_date", day2).maybeSingle()).data, 120);
  ok("Submit pressed while uploading still sends the request, with the file", Boolean(req2?.certificate_path), JSON.stringify(req2));

  // ------------------------------------------------- 3. over the limit: a PDF
  form = await openForm();
  const before3 = (await stagedFor(me.id)).length;
  await form.locator('input[type="file"]').setInputFiles({ name: "too-big.pdf", mimeType: "application/pdf", buffer: pdfOfSize(Math.round(5.3 * MB), "5.3") });
  const alert3 = form.locator('[role="alert"]').first();
  await alert3.waitFor({ timeout: 30_000 });
  const said3 = await alert3.innerText();
  ok("a 5.3 MB PDF is refused with its own size and the limit", /This file is 5\.3 MB\. The limit is 5 MB/.test(said3), said3);
  ok("...with advice for a PDF, and no Shrink button (a PDF cannot be shrunk here)", /compress-PDF/.test(said3) && (await form.getByRole("button", { name: "Shrink to fit" }).count()) === 0, said3);
  await page.waitForTimeout(2000);
  ok("...and nothing was uploaded", (await stagedFor(me.id)).length === before3);

  // --------------------------------------- 4. over the limit: a photo, asked
  form = await openForm();
  const before4 = (await stagedFor(me.id)).length;
  // Random noise compresses badly, so a 4000x3000 JPEG of it is well over 5 MB.
  const photoSize = await form.locator('input[type="file"]').evaluate(async (input) => {
    const c = document.createElement("canvas");
    c.width = 4000;
    c.height = 3000;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i + 1) % 4 === 0 ? 255 : Math.floor(Math.random() * 256);
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "phone-photo.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  const shrinkButton = form.getByRole("button", { name: "Shrink to fit" });
  await shrinkButton.waitFor({ timeout: 30_000 }).catch(() => {});
  ok("an oversized photo is offered Shrink to fit", (await shrinkButton.count()) === 1, `photo ${(photoSize / MB).toFixed(1)} MB`);
  await page.waitForTimeout(2000);
  ok("...and is not shrunk or uploaded until they choose to", (await stagedFor(me.id)).length === before4);
  if (await shrinkButton.count()) {
    await shrinkButton.click();
    await form.locator('input[type="file"][data-staged]').waitFor({ timeout: 120_000 }).catch(() => {});
    const note = await form.innerText();
    ok("pressing it shrinks the photo to fit, and says so", /Reduced from [\d.]+ MB to [\d.]+ (MB|KB) to fit the 5 MB limit/.test(note), note.slice(-300));
    const after4 = await stagedFor(me.id);
    const added = after4.filter((o) => o.name.endsWith(".jpg"));
    ok("...and the smaller copy is what was uploaded", added.length === 1 && added[0].size < 5 * MB && added[0].size > 0, JSON.stringify(added));
  }

  // ------------------------------------------------ 5. Storage holds the line
  const asMe = await apiAs(url, anonKey, me.email);
  const stamp = Date.now();
  const tooBig = await asMe.storage.from(STAGING).upload(`${me.id}/${stamp}-aaaaaaaaaaaaaaaa-over.pdf`, pdfOfSize(Math.round(5.5 * MB), "over"), { contentType: "application/pdf" });
  ok("Storage refuses a 5.5 MB file even sent around the portal", Boolean(tooBig.error), JSON.stringify(tooBig.data));
  const intoTheirs = await asMe.storage.from(STAGING).upload(`${other.id}/${stamp}-bbbbbbbbbbbbbbbb-x.pdf`, pdfOfSize(1024, "theirs"), { contentType: "application/pdf" });
  ok("...refuses a file put in someone else's folder", Boolean(intoTheirs.error), JSON.stringify(intoTheirs.data));
  const theirPath = `${other.id}/${stamp}-cccccccccccccccc-private.pdf`;
  await admin.storage.from(STAGING).upload(theirPath, pdfOfSize(1024, "private"), { contentType: "application/pdf" });
  const readTheirs = await asMe.storage.from(STAGING).download(theirPath);
  ok("...and will not hand over someone else's staged file", Boolean(readTheirs.error) || !readTheirs.data, String(readTheirs.error?.message));
  const video = await asMe.storage.from("upload-staging-video").upload(`${me.id}/${stamp}-dddddddddddddddd-consent.webm`, Buffer.alloc(6 * MB, 1), { contentType: "video/webm" });
  ok("the video bucket takes a 6 MB consent video", !video.error, String(video.error?.message));

  await browser.close();
} finally {
  // Staged copies and stored certificates, then the fixtures (their leave goes with them).
  for (const s of [me, other].filter(Boolean)) {
    for (const bucket of [STAGING, "upload-staging-video"]) {
      const { data } = await admin.storage.from(bucket).list(s.id, { limit: 100 });
      if (data?.length) await admin.storage.from(bucket).remove(data.map((o) => `${s.id}/${o.name}`));
    }
    const { data: certs } = await admin.storage.from("documents").list(`leave-certificates/${s.id}`, { limit: 100 });
    if (certs?.length) await admin.storage.from("documents").remove(certs.map((o) => `leave-certificates/${s.id}/${o.name}`));
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
