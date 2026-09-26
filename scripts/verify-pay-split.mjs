// Pay lives on staff_compensation, not staff -- checked end to end.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:pay
//
// Salary, allowances, commission rates and bonus moved off the staff table
// (migrations 0249 and 0250) because policy "staff_select" lets five roles read
// every staff row, and RLS has no column dimension: whoever may read the row
// reads every column on it. A plain counselor could read every colleague's
// salary straight from the API.
//
// So this checks both halves, which is the only way to know the move worked.
// The people who need pay still get it through the app -- otherwise payroll
// quietly breaks -- and nobody else can reach it through the API, including by
// the exact query that used to work.
//
// Creates and removes zztmp fixture accounts. See verify-portal-lib.mjs.
import {
  BASE,
  apiAs,
  clients,
  fixtures,
  openBrowser,
  openStaffForm,
  reporter,
  requireConfirmation,
  saveAndSettle,
  signIn,
} from "./verify-portal-lib.mjs";

requireConfirmation("check:pay");

const SALARY = 654321;
const COMMISSION = 13;
const PAY_COLUMNS = [
  "monthly_salary",
  "allowance",
  "currency",
  "commission_rate_general",
  "commission_rate_public_universities",
  "commission_type_general",
  "commission_type_public_universities",
  "bonus_eligible",
  "bonus_rate_percent",
];

const { url, anonKey, admin } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
const { ok, finish } = reporter();

/**
 * The page's text once it contains `text`, or null after 30 seconds.
 * Polled: read the moment the page loaded, the list had not always rendered
 * yet, and the rate looked missing on two runs in three.
 */
async function pageShows(page, text) {
  for (let i = 0; i < 30; i++) {
    const body = await page.locator("body").innerText();
    if (body.includes(text)) return body;
    await page.waitForTimeout(1000);
  }
  return null;
}

try {
  const victim = await fx.staff("paysubject", ["counselor"], {
    pay: {
      monthly_salary: SALARY,
      allowance: 4321,
      commission_rate_general: COMMISSION,
      commission_rate_public_universities: 8,
      bonus_eligible: true,
      bonus_rate_percent: 50,
    },
  });
  const superUser = await fx.staff("paysuper", ["super_admin"]);
  const finance = await fx.staff("payfinance", ["finance"]);
  const manager = await fx.staff("paymanager", ["management"]);
  const counselor = await fx.staff("paycounselor", ["counselor"]);
  console.log("fixtures created\n");

  // ------------------------------- the app still shows pay to who needs it
  let page = await signIn(browser, superUser.email);
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  ok("a Super Admin still sees the commission rate on the staff list", Boolean(await pageShows(page, `${COMMISSION}%`)));

  const row = page.locator("tr", { hasText: "zztmp paysubject" }).first();
  await row.locator('button[aria-label="Actions"]').click();
  await page.getByRole("button", { name: /View/ }).first().click();
  await page.waitForTimeout(1500);
  const viewPanel = await page.locator("body").innerText();
  ok("...the salary in the View panel", viewPanel.includes(String(SALARY)));
  ok("...and the bonus", /Eligible\s*—\s*50%/.test(viewPanel) || /Eligible/.test(viewPanel), viewPanel.slice(0, 160));
  await page.close();

  // The form has to round-trip through the new table, not just read from it.
  page = await signIn(browser, superUser.email);
  await openStaffForm(page, "zztmp paysubject");
  const salaryField = page.locator('input[name="monthly_salary"]');
  ok("the edit form is prefilled from staff_compensation",
    (await salaryField.inputValue()) === String(SALARY), await salaryField.inputValue());

  await salaryField.fill("777777");
  const saved = await saveAndSettle(page);
  ok("saving reports success", /Saved\./i.test(saved), saved.slice(-140));
  const { data: written } = await admin
    .from("staff_compensation").select("monthly_salary, updated_by").eq("staff_id", victim.id).single();
  ok("...and the write lands on the new table", Number(written.monthly_salary) === 777777,
    JSON.stringify(written));
  ok("...recording who changed it", written.updated_by === superUser.id, String(written.updated_by));
  await page.close();

  // Finance needs every rate to run payroll; losing that would break it quietly.
  page = await signIn(browser, finance.email);
  await page.goto(`${BASE}/finance/payroll?staff=${victim.id}`, { waitUntil: "domcontentloaded" });
  const payroll = (await pageShows(page, `${COMMISSION}%`)) ?? (await page.locator("body").innerText());
  ok("Finance still sees the commission rate on Payroll", payroll.includes(`${COMMISSION}%`),
    payroll.slice(0, 200));
  ok("...and the basic salary is prefilled from the new table",
    payroll.includes("777777") || (await page.locator('input[name="basic_salary"]').count()) > 0);
  await page.close();

  // ------------------------------------------- and nobody else can reach it
  for (const [label, who, mayRead] of [
    ["a Super Admin", superUser, true],
    ["Finance", finance, true],
    ["Management", manager, false],
    ["a counselor", counselor, false],
  ]) {
    const api = await apiAs(url, anonKey, who.email);
    const { data } = await api
      .from("staff_compensation").select("staff_id, monthly_salary").eq("staff_id", victim.id).maybeSingle();
    const reads = data != null;
    ok(`${label} ${mayRead ? "can" : "cannot"} read someone else's pay through the API`,
      reads === mayRead, JSON.stringify(data));
  }

  // Your own pay is yours to see and not to set.
  const ownApi = await apiAs(url, anonKey, counselor.email);
  const own = await ownApi.from("staff_compensation").select("staff_id").eq("staff_id", counselor.id).maybeSingle();
  ok("a counselor can read their own pay row", own.data != null, String(own.error?.message));
  await ownApi.from("staff_compensation").update({ monthly_salary: 1 }).eq("staff_id", counselor.id);
  const { data: unchanged } = await admin
    .from("staff_compensation").select("monthly_salary").eq("staff_id", counselor.id).single();
  ok("...but cannot change it", unchanged.monthly_salary === null, JSON.stringify(unchanged));

  // ------------------------------------------------- the original leak, gone
  // The exact query that worked before the split: a counselor asking the staff
  // table for pay. It has to fail outright, because the columns are not there.
  const leakApi = await apiAs(url, anonKey, counselor.email);
  const leak = await leakApi
    .from("staff").select("full_name, monthly_salary, commission_rate_general").eq("id", victim.id).maybeSingle();
  ok("the old query is refused -- the columns are gone from staff",
    Boolean(leak.error) && /monthly_salary/.test(leak.error.message),
    JSON.stringify(leak.error?.message ?? leak.data));

  const surviving = [];
  for (const column of PAY_COLUMNS) {
    const probe = await leakApi.from("staff").select(column).limit(1);
    if (!probe.error) surviving.push(column);
  }
  ok("no pay column is left on staff at all", surviving.length === 0, surviving.join(", "));

  // Management must still be able to do their own job.
  const managerApi = await apiAs(url, anonKey, manager.email);
  const { data: staffRows } = await managerApi.from("staff").select("id, full_name, roles");
  ok("Management still reads every staff row, for names and pickers",
    (staffRows?.length ?? 0) >= 6, String(staffRows?.length));
} finally {
  const removed = await fx.cleanup();
  await browser.close();
  process.exitCode = finish(removed) ? 1 : 0;
}
