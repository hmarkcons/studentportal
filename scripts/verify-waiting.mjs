// Waiting on you, item by item, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:waiting
//
//   the dashboard  the "documents to review" line names each document with its
//                  student, and links it to the route that opens it — not to
//                  the list of every student; "See everything" opens /waiting.
//   /waiting       every waiting item, under its student: two documents and an
//                  overdue task for one student, a document for another; a
//                  document already accepted is not there. "Mine only" keeps
//                  the viewer's own students; a kind narrows to that kind.
//   opening        a document opened from the list lands on the student's
//                  Documents tab with its section open and the row picked out,
//                  and is marked seen: under_review, with who and when. A
//                  second officer then sees "Opened by" on it. Accepted, it
//                  leaves the list; a new upload clears the mark (0305).
//   a task         opens at its own row on the application (#task-<id>).
//
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:waiting");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const DAY = 86_400_000;
const karachiToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const inDays = (n) => new Date(Date.parse(`${karachiToday()}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

async function poll(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;
let universityId = null;
const studentIds = [];

try {
  // ------------------------------------------------------------ fixtures
  const officer = await fx.staff("waitofficer", ["processing"]);
  const other = await fx.staff("waitother", ["processing"]);
  const { data: italy } = await admin.from("destinations").select("id").eq("display_name", "Italy (Public)").single();

  const student = async (name, officerId, phone) => {
    const id = await fx.lead({
      full_name: name, email: `${name.replace(/\s+/g, "-").toLowerCase()}@example.invalid`, contact_number: phone,
      status: "registered", registration_status: "registered", registered_at: new Date().toISOString(),
      date_of_inquiry: karachiToday(), country_of_interest: "Italy (Public)", intake: "Fall 2099", level_applying_for: "masters",
      processing_officer_id: officerId,
    });
    studentIds.push(id);
    return id;
  };
  const mineId = await student("zztmp Wait Mine", officer.id, "0300-9999981");
  const theirsId = await student("zztmp Wait Theirs", other.id, "0300-9999982");

  const doc = async (studentId, name, status, minutesAgo) => {
    const { data, error } = await admin
      .from("student_documents")
      .insert({ student_id: studentId, category: "personal", custom_name: name, status, uploaded_by_role: "student", uploaded_at: new Date(Date.now() - minutesAgo * 60000).toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`document: ${error.message}`);
    return data.id;
  };
  const passport = await doc(mineId, "zztmp Passport", "submitted", 180);
  const bank = await doc(mineId, "zztmp Bank statement", "submitted", 30);
  const accepted = await doc(mineId, "zztmp Degree", "verified", 600);
  const ielts = await doc(theirsId, "zztmp IELTS result", "submitted", 60);

  const { data: uni } = await admin.from("universities").insert({ destination_id: italy.id, name: "zztmp Waiting University", city: "zztmp City", type: "public" }).select("id").single();
  universityId = uni.id;
  const { data: prog } = await admin.from("programs").insert({ university_id: uni.id, level: "masters", name: "zztmp Waiting Programme" }).select("id").single();
  const { data: app, error: appError } = await admin
    .from("applications")
    .insert({ student_id: mineId, university_id: uni.id, program_id: prog.id, intake: "Fall 2099" })
    .select("id")
    .single();
  if (appError) throw new Error(`application: ${appError.message}`);
  const { data: task, error: taskError } = await admin
    .from("application_tasks")
    .insert({ application_id: app.id, description: "zztmp Send the pre-enrolment form", due_date: inDays(-3), owner_id: officer.id, status: "pending" })
    .select("id")
    .single();
  if (taskError) throw new Error(`task: ${taskError.message}`);

  browser = await openBrowser();
  let page = await signIn(browser, officer.email);

  // ------------------------------------------------------------ the dashboard
  console.log("\n--- the dashboard ---");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const docLine = page.locator('[data-waiting-line="document"]');
  await docLine.waitFor({ timeout: 60000 });
  const passportLink = docLine.locator(`a[data-waiting-item="document:${passport}"]`);
  const lineText = (await docLine.innerText()).replace(/\s+/g, " ");
  ok("the documents line names a document with its student, not just a count",
    (await passportLink.count()) === 1 || /zztmp Wait Mine — zztmp/.test(lineText), lineText.slice(0, 300));
  // Three are shown under the line; ours are among the newest few, but the
  // portal may hold others, so the link is asserted wherever it is listed.
  const anyLink = page.locator(`a[data-waiting-item="document:${passport}"], a[data-waiting-item="document:${bank}"], a[data-waiting-item="document:${ielts}"]`).first();
  if ((await anyLink.count()) > 0) {
    const href = await anyLink.getAttribute("href");
    ok("...and links it to the route that opens that document, not to the students list", /^\/waiting\/open\/document\/[0-9a-f-]{36}$/.test(href ?? ""), String(href));
  } else {
    ok("...and the line offers the rest on /waiting", /See all/.test(lineText) && (await docLine.locator('a[href="/waiting?kind=document"]').count()) > 0, lineText.slice(0, 300));
  }
  ok("the box opens everything waiting on /waiting", (await page.locator('[data-waiting-all][href="/waiting"]').count()) === 1);

  // ------------------------------------------------------------ /waiting
  console.log("\n--- the page ---");
  await page.goto(`${BASE}/waiting`, { waitUntil: "domcontentloaded" });
  const mineGroup = page.locator(`[data-waiting-student="${mineId}"]`);
  await mineGroup.waitFor({ timeout: 60000 });
  const rowsOf = async (group) => (await group.locator("[data-waiting-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-waiting-row")))).sort();
  const mineRows = await rowsOf(mineGroup);
  ok("a student's waiting documents and overdue task are listed together, under the student",
    JSON.stringify(mineRows) === JSON.stringify([`document:${bank}`, `document:${passport}`, `task:${task.id}`].sort()), JSON.stringify(mineRows));
  ok("...the task first, being overdue", (await mineGroup.locator("[data-waiting-row]").first().getAttribute("data-waiting-row")) === `task:${task.id}`);
  ok("...and not the document already accepted", (await page.locator(`[data-waiting-row="document:${accepted}"]`).count()) === 0);
  ok("another officer's student is listed too, under their own name",
    JSON.stringify(await rowsOf(page.locator(`[data-waiting-student="${theirsId}"]`))) === JSON.stringify([`document:${ielts}`]));
  const passportRow = page.locator(`[data-waiting-row="document:${passport}"]`);
  ok("an unopened document says it is new, and says how long it has waited",
    /New/.test(await passportRow.innerText()) && /submitted 3 h ago/.test(await passportRow.innerText()), (await passportRow.innerText()).replace(/\s+/g, " "));

  await page.goto(`${BASE}/waiting?mine=1`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-waiting-student="${mineId}"]`).waitFor({ timeout: 60000 });
  ok("Mine only keeps the viewer's own students and drops the others",
    (await page.locator(`[data-waiting-student="${theirsId}"]`).count()) === 0 && (await page.locator('[data-waiting-mine="on"]').count()) === 1);

  await page.goto(`${BASE}/waiting?kind=task`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-waiting-row="task:${task.id}"]`).waitFor({ timeout: 60000 });
  ok("a kind narrows the list to that kind", (await page.locator('[data-waiting-row^="document:"]').count()) === 0);

  // -------------------------------------------------------------- a task
  console.log("\n--- a task ---");
  await page.locator(`[data-waiting-row="task:${task.id}"] a`, { hasText: "Open" }).click();
  await page.waitForURL(new RegExp(`/students/${mineId}/applications/${app.id}#task-${task.id}$`), { timeout: 60000 });
  // The address changes before the page has streamed in: wait for the row itself.
  const taskRow = await page.locator(`[id="task-${task.id}"]`).waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok("a task opens at its own row on the application", taskRow, page.url());

  // -------------------------------------------------------------- opening
  console.log("\n--- opening a document ---");
  await page.goto(`${BASE}/waiting`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-waiting-row="document:${passport}"]`).waitFor({ timeout: 60000 });
  await page.locator(`[data-waiting-row="document:${passport}"] a`, { hasText: "Open" }).click();
  await page.waitForURL(new RegExp(`/students/${mineId}/documents\\?doc=${passport}`), { timeout: 60000 });
  const focused = page.locator(`[data-document-row="${passport}"][data-focused]`);
  await focused.waitFor({ timeout: 60000 }).catch(() => {});
  ok("it lands on the student's Documents tab, on that document, its section open and the row picked out",
    await focused.isVisible().catch(() => false), page.url());
  ok("...and only that document is picked out", (await page.locator("[data-document-row][data-focused]").count()) === 1);
  const seen = await poll(async () => {
    const { data } = await admin.from("student_documents").select("status, review_opened_by, review_opened_at").eq("id", passport).single();
    return data?.status === "under_review" && data?.review_opened_by === officer.id && data?.review_opened_at ? data : null;
  }, 20);
  ok("opening it marks it seen: under review, with who opened it and when", Boolean(seen));

  await page.close();
  page = await signIn(browser, other.email);
  await page.goto(`${BASE}/waiting`, { waitUntil: "domcontentloaded" });
  const openedRow = page.locator(`[data-waiting-row="document:${passport}"]`);
  await openedRow.waitFor({ timeout: 60000 });
  ok("a second officer sees that somebody has opened it, and who",
    /Opened by zztmp waitofficer/.test(await openedRow.innerText()) && (await openedRow.locator("[data-waiting-opened]").count()) === 1,
    (await openedRow.innerText()).replace(/\s+/g, " "));
  ok("...while one nobody has opened is still new", /New/.test(await page.locator(`[data-waiting-row="document:${bank}"]`).innerText()));

  // Decided: off the list. A new upload: back on, unseen.
  await admin.from("student_documents").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", passport);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(`[data-waiting-row="document:${bank}"]`).waitFor({ timeout: 60000 });
  ok("accepted, it leaves the list", (await page.locator(`[data-waiting-row="document:${passport}"]`).count()) === 0);

  await admin.from("student_documents").update({ status: "under_review", review_opened_by: other.id, review_opened_at: new Date().toISOString() }).eq("id", ielts);
  await admin.from("student_documents").update({ status: "submitted", file_path: `${theirsId}/zztmp-new.pdf` }).eq("id", ielts);
  const { data: reuploaded } = await admin.from("student_documents").select("review_opened_by, review_opened_at").eq("id", ielts).single();
  ok("a new upload clears who had opened it, so a fresh file is never shown as looked at",
    reuploaded?.review_opened_by === null && reuploaded?.review_opened_at === null, JSON.stringify(reuploaded));
} catch (e) {
  ok(`the check itself stopped: ${e?.stack ?? e}`, false);
} finally {
  await browser?.close().catch(() => {});
  for (const id of studentIds) {
    await admin.from("applications").delete().eq("student_id", id);
    await admin.from("student_documents").delete().eq("student_id", id);
  }
  if (universityId) await admin.from("universities").delete().eq("id", universityId);
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
