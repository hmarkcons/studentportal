// Staff leave, end to end against a portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:leave
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Asserted on what the database holds and what payroll shows, never on
// wording alone:
//
//   1. A request, previewed for the approver as it would be approved, and on
//      approval its days fixed as paid — the balance goes down by them.
//   2. Payroll: approved paid leave is not an absence, unpaid leave is one and
//      is labelled, a holiday is nobody's working day.
//   3. Sick leave without a certificate is unpaid; overlapping leave is
//      refused; a pending request can be withdrawn.
//   4. Nobody decides their own leave — not in the page, not in the database.
//   5. A counsellor can neither open the Leave page nor read anyone else's
//      leave.
//
// Fixtures: zztmp staff (removed with their leave), and one office holiday on a
// date in last month that is removed in the finally. Mails go to fixture
// addresses on a domain that does not exist, so expect bounces.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:leave");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** The first n Monday–Friday dates of last month. */
function weekdaysOfLastMonth(n) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const out = [];
  for (let d = new Date(first); out.length < n; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(iso(d));
  }
  return { month: iso(first).slice(0, 7), dates: out };
}
let holidayDate = null;

try {
  const superUser = await fx.staff("lvsuper", ["super_admin"]);
  const manager = await fx.staff("lvmanager", ["management"]);
  const target = await fx.staff("lvtarget", ["counselor"]);
  const bystander = await fx.staff("lvbystander", ["counselor"]);
  // Monday–Friday 09:00–17:00 on their own record, so payroll has hours to
  // count absences against, and a long-standing joining date.
  for (const s of [target, manager]) {
    await admin
      .from("staff")
      .update({ joined_on: "2020-01-15", work_start_time: "09:00:00", work_end_time: "17:00:00", work_days: [1, 2, 3, 4, 5], email_official: s.email })
      .eq("id", s.id);
  }
  await admin.from("staff_compensation").update({ monthly_salary: 100000, currency: "PKR" }).eq("staff_id", target.id);

  const browser = await openBrowser();

  // ----------------------------------------------- 1. a request and a decision
  const future = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 2, 2)); // 2 March next year
  while (future.getUTCDay() === 0 || future.getUTCDay() === 6) future.setUTCDate(future.getUTCDate() + 1);
  const futureStart = iso(future);
  const futureEndDate = new Date(future);
  futureEndDate.setUTCDate(futureEndDate.getUTCDate() + 1);
  while (futureEndDate.getUTCDay() === 0 || futureEndDate.getUTCDay() === 6) futureEndDate.setUTCDate(futureEndDate.getUTCDate() + 1);
  const futureEnd = iso(futureEndDate);

  const targetPage = await signIn(browser, target.email);
  await targetPage.goto(`${BASE}/my-leave`, { waitUntil: "domcontentloaded" });
  await targetPage.getByRole("heading", { name: "My leave" }).waitFor({ timeout: 60_000 });
  ok("a staff member sees their allowance", /14/.test(await targetPage.locator("main").innerText()));
  await targetPage.locator('select[name="kind"]').selectOption("planned");
  await targetPage.locator('input[name="start_date"]').fill(futureStart);
  await targetPage.locator('input[name="end_date"]').fill(futureEnd);
  await targetPage.getByRole("button", { name: "Request leave" }).click();
  let request = null;
  for (let i = 0; i < 40 && !request; i++) {
    request = (await admin.from("leave_requests").select("id, status").eq("staff_id", target.id).maybeSingle()).data;
    if (!request) await targetPage.waitForTimeout(750);
  }
  ok("the request is stored, pending", request?.status === "pending", JSON.stringify(request));

  const managerPage = await signIn(browser, manager.email);
  await managerPage.goto(`${BASE}/admin/leave`, { waitUntil: "domcontentloaded" });
  const pendingRow = managerPage.locator(`[data-leave-pending="${request.id}"]`);
  await pendingRow.waitFor({ timeout: 60_000 });
  ok("the approver sees it previewed as 2 paid days", /If approved: 2 paid/.test(await pendingRow.innerText()), await pendingRow.innerText());
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  let approved = null;
  for (let i = 0; i < 40; i++) {
    approved = (await admin.from("leave_requests").select("status, paid_dates, unpaid_dates, decided_by").eq("id", request.id).single()).data;
    if (approved?.status === "approved") break;
    await managerPage.waitForTimeout(750);
  }
  ok("approving fixes its dates as paid", approved?.status === "approved" && approved.paid_dates.length === 2 && approved.unpaid_dates.length === 0, JSON.stringify(approved));
  ok("...recording who decided", approved?.decided_by === manager.id);

  await targetPage.goto(`${BASE}/my-leave`, { waitUntil: "domcontentloaded" });
  await targetPage.getByRole("heading", { name: "My leave" }).waitFor({ timeout: 60_000 });
  const mine = targetPage.locator(`[data-leave-request="${request.id}"]`);
  ok("they see it approved, 2 paid", /Approved/.test(await mine.innerText()) && /2 paid/.test(await mine.innerText()));

  // --------------------------------- 3. overlap refused; withdraw a pending one
  await targetPage.locator('select[name="kind"]').selectOption("planned");
  await targetPage.locator('input[name="start_date"]').fill(futureStart);
  await targetPage.locator('input[name="end_date"]').fill(futureStart);
  await targetPage.getByRole("button", { name: "Request leave" }).click();
  const overlapSaid = targetPage.locator('[data-action-status="error"]').first();
  await overlapSaid.waitFor({ timeout: 60_000 }).catch(() => {});
  ok("overlapping leave is refused", /overlap/i.test(await overlapSaid.innerText().catch(() => "")), await overlapSaid.innerText().catch(() => "nothing shown"));

  const later = new Date(future);
  later.setUTCDate(later.getUTCDate() + 21);
  while (later.getUTCDay() === 0 || later.getUTCDay() === 6) later.setUTCDate(later.getUTCDate() + 1);
  const { data: second, error: secondError } = await (await apiAs(url, anonKey, target.email))
    .from("leave_requests")
    .insert({ staff_id: target.id, kind: "planned", start_date: iso(later), end_date: iso(later), status: "pending", created_by: target.id })
    .select("id")
    .single();
  if (secondError) throw new Error(`could not make a second request: ${secondError.message}`);
  await targetPage.goto(`${BASE}/my-leave`, { waitUntil: "domcontentloaded" });
  targetPage.once("dialog", (d) => d.accept());
  await targetPage.locator(`[data-leave-request="${second.id}"]`).getByRole("button", { name: "Withdraw" }).click();
  let withdrawn = null;
  for (let i = 0; i < 40; i++) {
    withdrawn = (await admin.from("leave_requests").select("status").eq("id", second.id).single()).data?.status;
    if (withdrawn === "cancelled") break;
    await targetPage.waitForTimeout(750);
  }
  ok("a pending request can be withdrawn", withdrawn === "cancelled", String(withdrawn));

  // ------------------------------------------ 2. payroll, for last month
  const { month, dates } = weekdaysOfLastMonth(4);
  holidayDate = dates[3];
  const { error: holidayError } = await admin.from("office_holidays").insert({ holiday_date: holidayDate, name: "zztmp holiday" });
  if (holidayError) throw new Error(`could not add the fixture holiday: ${holidayError.message} (is ${holidayDate} already a holiday?)`);

  // Two days' planned leave, and one sick day with no certificate, recorded
  // by the approver for the target.
  async function record(kind, start, end) {
    await managerPage.goto(`${BASE}/admin/leave`, { waitUntil: "domcontentloaded" });
    const form = managerPage.locator("form", { has: managerPage.getByRole("button", { name: "Record leave" }) });
    await form.locator('select[name="staff_id"]').selectOption(target.id);
    await form.locator('select[name="kind"]').selectOption(kind);
    await form.locator('input[name="start_date"]').fill(start);
    await form.locator('input[name="end_date"]').fill(end);
    await form.getByRole("button", { name: "Record leave" }).click();
    await form.locator("[data-action-status]").first().waitFor({ timeout: 60_000 });
    return form.locator("[data-action-status]").first().innerText();
  }
  const r1 = await record("planned", dates[0], dates[1]);
  ok("recording leave for someone approves it at once", /Recorded — 2 paid, 0 unpaid/.test(r1), r1);
  const r2 = await record("sick", dates[2], dates[2]);
  ok("sick leave recorded without a certificate is unpaid", /0 paid, 1 unpaid/.test(r2), r2);

  const saPage = await signIn(browser, superUser.email);
  await saPage.goto(`${BASE}/finance/payroll?staff=${target.id}&month=${month}`, { waitUntil: "domcontentloaded" });
  const card = saPage.locator("main");
  await saPage.getByText("Absent days").first().waitFor({ timeout: 60_000 });
  const text = (await card.innerText()).replace(/\s+/g, " ");
  const figure = (label) => {
    const m = new RegExp(`${label} (\\d+)`).exec(text);
    return m ? Number(m[1]) : null;
  };
  // Every Mon–Fri of last month, less the holiday, is a scheduled working
  // day with no attendance: all absent except the two days of paid leave.
  const lastMonthWeekdays = (() => {
    const [y, m] = month.split("-").map(Number);
    let n = 0;
    for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
      const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (wd >= 1 && wd <= 5) n++;
    }
    return n;
  })();
  ok("payroll shows the paid leave", figure("Paid leave") === 2, text.slice(0, 600));
  ok("...and the unpaid leave, within the absences", figure("Unpaid leave") === 1, text.slice(0, 600));
  ok("...and the holiday", figure("Holidays") === 1, text.slice(0, 600));
  ok("...and counts as absent every working day but the paid leave and the holiday",
    figure("Absent days") === lastMonthWeekdays - 1 - 2, `absent ${figure("Absent days")} of ${lastMonthWeekdays} weekdays`);

  // ------------------------------------------ 4. nobody decides their own
  const { data: own, error: ownError } = await (await apiAs(url, anonKey, manager.email))
    .from("leave_requests")
    .insert({ staff_id: manager.id, kind: "planned", start_date: iso(later), end_date: iso(later), status: "pending", created_by: manager.id })
    .select("id")
    .single();
  if (ownError) throw new Error(`could not make the approver's own request: ${ownError.message}`);
  await managerPage.goto(`${BASE}/admin/leave`, { waitUntil: "domcontentloaded" });
  const ownRow = managerPage.locator(`[data-leave-pending="${own.id}"]`);
  await ownRow.waitFor({ timeout: 60_000 });
  ok("an approver is not offered their own request to decide",
    (await ownRow.getByRole("button", { name: "Approve" }).count()) === 0 && /someone else has to decide/i.test(await ownRow.innerText()));
  const selfApprove = await (await apiAs(url, anonKey, manager.email))
    .from("leave_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), paid_dates: [iso(later)] })
    .eq("id", own.id)
    .select("id");
  ok("...and the database refuses them approving it directly", (selfApprove.data ?? []).length === 0, JSON.stringify(selfApprove));

  // ------------------------------------------ 5. a counsellor
  const bystanderPage = await signIn(browser, bystander.email);
  await bystanderPage.goto(`${BASE}/admin/leave`, { waitUntil: "domcontentloaded" });
  await bystanderPage.getByText(/permission to approve leave/i).first().waitFor({ timeout: 60_000 }).catch(() => {});
  ok("a counsellor cannot open the Leave page", /don.t have permission to approve leave/i.test(await bystanderPage.locator("main").innerText()));
  const { data: seen } = await (await apiAs(url, anonKey, bystander.email)).from("leave_requests").select("id").eq("staff_id", target.id);
  ok("...nor read anyone else's leave", (seen ?? []).length === 0);

  await browser.close();
} finally {
  if (holidayDate) await admin.from("office_holidays").delete().eq("holiday_date", holidayDate).eq("name", "zztmp holiday");
  const removed = await fx.cleanup(); // leave_requests go with their staff
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
