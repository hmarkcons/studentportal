// Multi-role staff, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:roles
//
// One employee can hold several roles (migration 0247), access is the union of
// them, and only a Super Admin gives anyone a role (0283). None of that can be
// checked from unit tests: it is the app, RLS and the set_staff_roles function
// agreeing with each other, and the interesting cases are the refusals.
//
// The rules this exists to keep honest:
//   - access is the union, so adding a role never takes access away
//   - only a Super Admin changes anyone's roles — their own included —
//     enforced in the database and not merely hidden in the form
//   - everybody keeps at least one role
//   - anyone but a Super Admin sees only their own record on Staff
//     Management, and cannot read a colleague's personal details through
//     the API either (0284, 0285)
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

requireConfirmation("check:roles");

const { url, anonKey, admin } = clients();
const browser = await openBrowser();
const fx = fixtures(admin);
const { ok, finish } = reporter();

const rolesOf = async (id) => (await admin.from("staff").select("role, roles").eq("id", id).single()).data;

try {
  const superUser = await fx.staff("rolesuper", ["super_admin"]);
  const manager = await fx.staff("rolemanager", ["management"]);
  const subject = await fx.staff("rolesubject", ["counselor"]);
  const plain = await fx.staff("roleplain", ["counselor"]);
  console.log("fixtures created\n");

  // ------------------------------------------------------------- the schema
  const before = await rolesOf(subject.id);
  ok("a new staff row carries a roles array", JSON.stringify(before.roles) === JSON.stringify(["counselor"]),
    JSON.stringify(before.roles));

  // --------------------------------------------- Super Admin: the full form
  let page = await signIn(browser, superUser.email);
  await openStaffForm(page, "zztmp rolesubject");

  ok("the form offers a checkbox per role",
    (await page.locator('input[type="checkbox"][name="roles"]').count()) === 7,
    String(await page.locator('input[type="checkbox"][name="roles"]').count()));
  ok("the role they hold is ticked", await page.locator('input[name="roles"][value="counselor"]').isChecked());
  ok("Super Admin is offered to a Super Admin",
    !(await page.locator('input[name="roles"][value="super_admin"]').isDisabled()));
  ok("a Super Admin still sees pay on the form", (await page.locator("text=Monthly salary").count()) > 0);

  await page.locator('input[name="roles"][value="finance"]').check();
  const firstSave = await saveAndSettle(page);
  ok("the save reports success", /Saved\./i.test(firstSave), firstSave.slice(-140));

  let after = await rolesOf(subject.id);
  ok("a second role is added", JSON.stringify(after.roles) === JSON.stringify(["counselor", "finance"]),
    JSON.stringify(after.roles));
  ok("...and the primary role is left alone", after.role === "counselor", after.role);

  // Everybody keeps at least one role.
  await openStaffForm(page, "zztmp rolesubject");
  await page.locator('input[name="roles"][value="counselor"]').uncheck();
  await page.locator('input[name="roles"][value="finance"]').uncheck();
  const emptied = await saveAndSettle(page);
  ok("unticking every role is refused", /Pick at least one role/i.test(emptied), emptied.slice(0, 140));
  const refusal = emptied.split("\n").find((l) => /Pick at least one role/i.test(l)) ?? "";
  // Asserted on the message itself: "Suspended" also appears in the Status
  // dropdown, so matching the whole form would pass for the wrong reason.
  ok("...and names Suspended as the way to lock somebody out", /Suspended/i.test(refusal), refusal);
  after = await rolesOf(subject.id);
  ok("...leaving the roles untouched", JSON.stringify(after.roles) === JSON.stringify(["counselor", "finance"]),
    JSON.stringify(after.roles));
  await page.close();

  // --------------------------------------------- the union grants both jobs
  // "Accounts & Finance" is an ungated nav heading, so its presence proves
  // nothing. Payroll's add-commission form is rendered only for finance, needs
  // no data to exist, and is the page whose viewer lookup used to fetch `role`
  // alone -- so it would have refused a counselor+finance user before that fix.
  const hasFinanceControls = async (p, staffId) => {
    await p.goto(`${BASE}/finance/payroll?staff=${staffId}`, { waitUntil: "domcontentloaded" });
    return (await p.locator("option", { hasText: "Student…" }).count()) > 0;
  };

  page = await signIn(browser, subject.email);
  ok("a counselor who also holds Finance gets the finance-only payroll controls",
    await hasFinanceControls(page, subject.id));
  await page.close();

  page = await signIn(browser, plain.email);
  ok("a counselor alone does not", !(await hasFinanceControls(page, plain.id)));
  await page.close();

  // ---------------------------- everyone else: their own record, read-only
  // Collapsed nav sections keep their children out of innerText, so the markup
  // is what says whether a link is there.
  for (const [who, person] of [["a counselor", plain], ["Management", manager]]) {
    page = await signIn(browser, person.email);
    ok(`${who} has the Staff Management link`, /Staff Management/.test(await page.content()));
    await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
    const own = page.locator("[data-own-staff-record]");
    await own.waitFor({ timeout: 60_000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    ok(`...where ${who} sees their own record`, (await own.count()) === 1 && (await own.innerText()).includes(person.name), body.slice(0, 200));
    ok(`...and nobody else's`, !body.includes("zztmp rolesubject") && !body.includes("zztmp rolesuper"));
    ok(`...with no way to change anything`,
      (await page.locator('main button[aria-label="Actions"], main input[name="roles"], main form').count()) === 0 &&
        (await page.locator("main").getByRole("button", { name: /Add Staff|Save/i }).count()) === 0);
    await page.close();
  }

  // ------------------------------- the refusals that must bind server-side
  // Hiding the form is not a restriction. These go straight at the RPC, the
  // way a hand-crafted request would.
  const managerApi = await apiAs(url, anonKey, manager.email);
  const plainApi = await apiAs(url, anonKey, plain.email);
  const attempts = [
    ["Management giving a colleague a role", managerApi, subject.id, ["counselor", "processing"]],
    ["Management giving themselves Finance", managerApi, manager.id, ["management", "finance"]],
    ["Management granting Super Admin", managerApi, subject.id, ["counselor", "super_admin"]],
    ["Management removing Super Admin from someone", managerApi, superUser.id, ["management"]],
    ["a counselor giving themselves Finance", plainApi, plain.id, ["counselor", "finance"]],
    ["a counselor changing a colleague's roles", plainApi, subject.id, ["counselor"]],
  ];
  for (const [label, api, target, roles] of attempts) {
    const beforeTry = await rolesOf(target);
    const res = await api.rpc("set_staff_roles", { p_staff: target, p_roles: roles });
    const afterTry = await rolesOf(target);
    ok(`${label} is refused by the database`,
      Boolean(res.error) && /Only a Super Admin can change staff roles/i.test(res.error.message) &&
        JSON.stringify(afterTry.roles) === JSON.stringify(beforeTry.roles),
      res.error ? res.error.message : `no error — roles now ${JSON.stringify(afterTry.roles)}`);
  }
  const directly = await plainApi.from("staff").update({ roles: ["finance"] }).eq("id", plain.id).select("id");
  ok("...nor may anyone write their roles straight onto their row", Boolean(directly.error) || (directly.data ?? []).length === 0,
    JSON.stringify(directly.error ?? directly.data));

  const superApi = await apiAs(url, anonKey, superUser.email);
  const emptyViaApi = await superApi.rpc("set_staff_roles", { p_staff: subject.id, p_roles: [] });
  ok("even a Super Admin cannot leave somebody with no roles",
    Boolean(emptyViaApi.error) && /Pick at least one role/i.test(emptyViaApi.error.message),
    emptyViaApi.error ? emptyViaApi.error.message : "no error at all");

  // ------------------------------------------------- personal details (0285)
  // A colleague's CNIC and the like cannot be read through the API by anyone
  // but that person and the Super Admin — whatever the pages show.
  await admin.from("staff").update({ cnic: "42101-0000000-1", address: "zztmp 1 Private Street" }).eq("id", subject.id);
  for (const [who, api] of [["a counselor", plainApi], ["Management", managerApi]]) {
    const read = await api.from("staff").select("id, cnic, address").eq("id", subject.id);
    ok(`${who} cannot read a colleague's CNIC or address`, Boolean(read.error) && !JSON.stringify(read.data ?? "").includes("42101"),
      JSON.stringify(read.error?.message ?? read.data));
    const viaFn = await api.rpc("staff_personal_details", { p_staff: subject.id });
    ok(`...nor get them from staff_personal_details`, !viaFn.error && (viaFn.data ?? []).length === 0, JSON.stringify(viaFn.error ?? viaFn.data));
    const names = await api.from("staff").select("id, full_name, designation, mobile_official, email_official").eq("id", subject.id);
    ok(`...while a colleague's name and official contact are still there for ${who === "Management" ? "them" : "the work"}`,
      !names.error && names.data?.[0]?.full_name === "zztmp rolesubject", JSON.stringify(names.error ?? names.data));
  }
  const mine = await plainApi.rpc("staff_personal_details", { p_staff: plain.id });
  ok("a counselor can read their own personal details", !mine.error && (mine.data ?? []).length === 1, JSON.stringify(mine.error ?? mine.data));
  const byAdmin = await superApi.rpc("staff_personal_details", { p_staff: subject.id });
  ok("a Super Admin can read anyone's", !byAdmin.error && byAdmin.data?.[0]?.cnic === "42101-0000000-1", JSON.stringify(byAdmin.error ?? byAdmin.data));
} finally {
  const removed = await fx.cleanup();
  await browser.close();
  process.exitCode = finish(removed) ? 1 : 0;
}
