// Multi-role staff, end to end against a deployed portal.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:roles
//
// One employee can hold several roles (migration 0247), access is the union of
// them, and Management can assign roles without being able to see or set pay.
// None of that can be checked from unit tests: it is the app, RLS and the
// set_staff_roles function (0248) agreeing with each other, and the interesting
// cases are the refusals.
//
// Three rules this exists to keep honest:
//   - access is the union, so adding a role never takes access away
//   - only a Super Admin can grant or remove Super Admin, enforced in the
//     database and not merely hidden in the form
//   - everybody keeps at least one role
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
  // Collapsed nav sections keep their children out of innerText, so the markup
  // is what says whether a link is there.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  ok("...and has no Staff Management link", !/Staff Management/.test(await page.content()));
  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  ok("...and typing /admin/staff is refused rather than showing a one-row list",
    /don.t have permission/i.test(await page.locator("body").innerText()));
  await page.close();

  // ------------------------------------------- Management: roles, never pay
  page = await signIn(browser, manager.email);
  ok("Management sees the Staff Management link", /Staff Management/.test(await page.content()));

  await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
  const listText = await page.locator("body").innerText();
  ok("Management is told what the page is for them", /Assign each staff member the roles/i.test(listText));
  ok("...with no Commission Rate column", !/Commission Rate/i.test(listText));
  ok("...and no Add-staff button", (await page.getByRole("button", { name: /Add Staff/i }).count()) === 0);
  ok("both of the subject's roles are listed",
    listText.includes("Counselor / Advisor, Finance / Accounts"), listText.slice(0, 160));

  await openStaffForm(page, "zztmp rolesubject");
  const managerForm = await page.locator("form", { hasText: "Roles (system access)" }).innerText();
  ok("Management gets the roles alone",
    /Roles \(system access\)/i.test(managerForm) && !/Monthly salary|Commission/i.test(managerForm),
    managerForm.slice(0, 160));
  ok("...with a button that says so",
    (await page.getByRole("button", { name: /Save roles/ }).count()) === 1);
  ok("...and Super Admin locked",
    await page.locator('input[name="roles"][value="super_admin"]').isDisabled());

  await page.locator('input[name="roles"][value="processing"]').check();
  const managerSave = await saveAndSettle(page, /Save roles/);
  ok("Management's save reports success", /Saved\./i.test(managerSave), managerSave.slice(-140));
  after = await rolesOf(subject.id);
  ok("Management can add a role", (after.roles ?? []).includes("processing"), JSON.stringify(after.roles));
  ok("...without disturbing the roles already held",
    (after.roles ?? []).includes("counselor") && (after.roles ?? []).includes("finance"),
    JSON.stringify(after.roles));
  await page.close();

  // ------------------------------- the refusals that must bind server-side
  // Hiding the tick box is not a restriction. These go straight at the RPC,
  // the way a hand-crafted request would.
  const managerApi = await apiAs(url, anonKey, manager.email);
  const granted = await managerApi.rpc("set_staff_roles", {
    p_staff: subject.id,
    p_roles: ["counselor", "super_admin"],
  });
  ok("a forged Management request for Super Admin is refused by the database",
    Boolean(granted.error) && /Only a Super Admin/i.test(granted.error.message),
    granted.error ? granted.error.message : "no error at all");
  after = await rolesOf(subject.id);
  ok("...and Super Admin was not granted", !(after.roles ?? []).includes("super_admin"),
    JSON.stringify(after.roles));

  const removal = await managerApi.rpc("set_staff_roles", { p_staff: superUser.id, p_roles: ["management"] });
  ok("Management cannot strip Super Admin from someone either",
    Boolean(removal.error) && /Only a Super Admin/i.test(removal.error.message),
    removal.error ? removal.error.message : "no error at all");

  const plainApi = await apiAs(url, anonKey, plain.email);
  const byCounselor = await plainApi.rpc("set_staff_roles", { p_staff: subject.id, p_roles: ["counselor"] });
  ok("a counselor calling set_staff_roles directly is refused",
    Boolean(byCounselor.error) && /permission to change staff roles/i.test(byCounselor.error.message),
    byCounselor.error ? byCounselor.error.message : "no error at all");

  const emptyViaApi = await (await apiAs(url, anonKey, superUser.email))
    .rpc("set_staff_roles", { p_staff: subject.id, p_roles: [] });
  ok("even a Super Admin cannot leave somebody with no roles",
    Boolean(emptyViaApi.error) && /Pick at least one role/i.test(emptyViaApi.error.message),
    emptyViaApi.error ? emptyViaApi.error.message : "no error at all");
} finally {
  const removed = await fx.cleanup();
  await browser.close();
  process.exitCode = finish(removed) ? 1 : 0;
}
