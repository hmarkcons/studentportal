// Role dashboards, and a counsellor's stages-only view of a registered student.
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:dashboards
//   PORTAL_URL=http://localhost:3000 ...      (against a local `next start`)
//
// Each check reads the thing that would be different if it were broken:
//
//   1. A counsellor opens their registered student and gets the stages-only
//      view: no processing tabs, the processing pages refuse them, and the
//      profile is read-only with the visa history left out.
//   2. The database agrees (0276): after registration a counsellor cannot
//      change the student's stages, applications or documents — while
//      processing can, and before registration the counsellor still can.
//   3. Saving the Registration card keeps the country stages it used to wipe.
//   4. Payroll is private (0277): a counsellor cannot read a colleague's.
//   5. Each role gets its own dashboard with its own figures: the counsellor's
//      stale lead is on their "due a call" list, their registered student on
//      their progress list, and processing's review queue is not in theirs;
//      the processing officer sees their student's waiting document; Super
//      Admin gets every tab; Management's overview renders.
//
// Needs migrations 0276 and 0277 applied.
import { BASE, apiAs, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:dashboards");

const { admin, url, anonKey } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

async function waitFor(fn, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 750));
  }
  return null;
}

async function open(page, path, marker) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator(marker).first().waitFor({ timeout: 90_000 }).catch(() => {});
}

try {
  // ------------------------------------------------------------ fixtures
  const counselor = await fx.staff("dash-counselor", ["counselor"]);
  const officer = await fx.staff("dash-officer", ["processing"]);
  const superUser = await fx.staff("dash-super", ["super_admin"]);
  const manager = await fx.staff("dash-manager", ["management"]);

  const { data: dests } = await admin.from("destinations").select("id, display_name, dashboard_pipeline_stages").eq("status", "active");
  const dest = (dests ?? []).find((d) => (d.dashboard_pipeline_stages ?? []).length > 1);
  if (!dest) throw new Error("no active destination has country stages set up");
  const [stage1] = dest.dashboard_pipeline_stages;
  const firstValue = stage1.options?.[0] || "Completed";

  const student = await fx.lead({
    full_name: "zztmp dash-student",
    status: "registered",
    registration_status: "registered",
    registered_at: new Date().toISOString(),
    intake: "Fall 2099",
    assigned_counselor_id: counselor.id,
    processing_officer_id: officer.id,
  });
  await admin.from("lead_destinations").insert({ lead_id: student, destination_id: dest.id, is_backup: false });
  const coded = await waitFor(async () => (await admin.from("leads").select("student_code").eq("id", student).single()).data?.student_code);
  if (!coded) throw new Error("the fixture student never got a Student ID");
  const { error: docError } = await admin
    .from("student_documents")
    .insert({ student_id: student, status: "submitted", custom_name: "zztmp passport", uploaded_at: daysAgo(3) });
  if (docError) throw new Error(`could not add the fixture document: ${docError.message}`);
  const { data: doc } = await admin.from("student_documents").select("id").eq("student_id", student).eq("custom_name", "zztmp passport").single();
  // A real application, so the checks below are refused by the rule and not
  // by a malformed row — a check that fails for the wrong reason proves nothing.
  const { data: uni } = await admin.from("universities").select("id").limit(1).single();
  const { data: app, error: appError } = await admin
    .from("applications")
    .insert({ student_id: student, university_id: uni.id, current_stage: "documents_pending" })
    .select("id")
    .single();
  if (appError) throw new Error(`could not add the fixture application: ${appError.message}`);

  // An open lead nobody has called for six days, and one not yet registered.
  await fx.lead({ full_name: "zztmp dash-stale", status: "in_discussion", assigned_counselor_id: counselor.id, created_at: daysAgo(6) });
  const unregistered = await fx.lead({ full_name: "zztmp dash-unregistered", status: "potential", assigned_counselor_id: counselor.id });
  await admin.from("lead_destinations").insert({ lead_id: unregistered, destination_id: dest.id, is_backup: false });

  const browser = await openBrowser();

  // ------------------------------------------ 1. the counsellor's view of them
  const cou = await signIn(browser, counselor.email);
  await open(cou, `/students/${student}`, "[data-stages-only], main h2");
  ok("counsellor: the registered student opens in the stages-only view", (await cou.locator("[data-stages-only]").count()) === 1);
  ok("counsellor: no Documents or Applications tab is offered", (await cou.locator(`a[href="/students/${student}/documents"], a[href="/students/${student}/applications"]`).count()) === 0);
  ok("counsellor: the country stages are shown", (await cou.locator("[data-stages-only]").innerText()).includes(dest.display_name));
  await open(cou, `/students/${student}/documents`, "[data-processing-only], main h2");
  ok("counsellor: typing the Documents address is refused", (await cou.locator("[data-processing-only]").count()) === 1);
  await open(cou, `/students/${student}/applications`, "[data-processing-only], main h2");
  ok("counsellor: ...and Applications", (await cou.locator("[data-processing-only]").count()) === 1);
  await open(cou, `/students/${student}/profile`, "fieldset[data-read-only], main h3");
  const fieldset = cou.locator("fieldset[data-read-only]");
  ok("counsellor: the profile is read-only", (await fieldset.count()) === 1 && (await fieldset.evaluate((el) => el.disabled)));
  ok("counsellor: ...and leaves out the visa history", !/Travel & visa history/.test(await cou.locator("main").innerText()));

  // ------------------------------------------------ 2. what the database says
  const asCounselor = await apiAs(url, anonKey, counselor.email);
  const stageWrite = await asCounselor
    .from("lead_destinations")
    .update({ dashboard_stage_values: { [stage1.key]: firstValue } })
    .eq("lead_id", student)
    .eq("destination_id", dest.id)
    .select("lead_id");
  const { data: stagesAfter } = await admin.from("lead_destinations").select("dashboard_stage_values").eq("lead_id", student).single();
  ok("database: a counsellor cannot tick a registered student's stage", Boolean(stageWrite.error) && !stagesAfter.dashboard_stage_values?.[stage1.key], JSON.stringify(stageWrite.error ?? stageWrite.data));

  const docWrite = await asCounselor.from("student_documents").update({ status: "verified" }).eq("id", doc.id).select("id");
  const { data: docAfter } = await admin.from("student_documents").select("status").eq("id", doc.id).single();
  ok("database: ...nor approve their document", docAfter.status === "submitted" && (docWrite.data ?? []).length === 0, JSON.stringify(docWrite.error ?? docWrite.data));

  const appInsert = await asCounselor.from("applications").insert({ student_id: student, university_id: uni.id, current_stage: "documents_pending" }).select("id");
  ok("database: ...nor add them an application", Boolean(appInsert.error) && !(appInsert.data ?? []).length, JSON.stringify(appInsert.data));
  if (appInsert.data?.length) await admin.from("applications").delete().in("id", appInsert.data.map((a) => a.id));
  const appMove = await asCounselor.from("applications").update({ current_stage: "application_submitted" }).eq("id", app.id).select("id");
  const { data: appAfter } = await admin.from("applications").select("current_stage").eq("id", app.id).single();
  ok("database: ...nor move one of theirs on", appAfter.current_stage === "documents_pending" && !(appMove.data ?? []).length, JSON.stringify(appMove.error ?? appMove.data));

  const before = await asCounselor
    .from("lead_destinations")
    .update({ dashboard_stage_values: { [stage1.key]: firstValue } })
    .eq("lead_id", unregistered)
    .eq("destination_id", dest.id)
    .select("lead_id");
  ok("database: before registration the counsellor still can", !before.error && (before.data ?? []).length === 1, JSON.stringify(before.error ?? before.data));

  const asOfficer = await apiAs(url, anonKey, officer.email);
  const byOfficer = await asOfficer
    .from("lead_destinations")
    .update({ dashboard_stage_values: { [stage1.key]: firstValue } })
    .eq("lead_id", student)
    .eq("destination_id", dest.id)
    .select("lead_id");
  ok("database: processing can", !byOfficer.error && (byOfficer.data ?? []).length === 1, JSON.stringify(byOfficer.error ?? byOfficer.data));

  // ---------------------------------- 3. the Registration card keeps the stages
  const off = await signIn(browser, officer.email);
  await open(off, `/students/${student}`, "main h2");
  // The card starts collapsed, and streams in after the page heading — wait
  // for its header, then open it if it is closed.
  const header = off.locator("button[aria-expanded]").filter({ hasText: "Registration & Portal Access" }).first();
  await header.waitFor({ timeout: 90_000 });
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  // The form itself opens from its own "Edit registration" button.
  await off.getByRole("button", { name: /Edit registration/ }).click();
  await off.locator('select[name="processing_officer_id"]').waitFor({ state: "visible", timeout: 60_000 });
  const regForm = off.locator("form", { has: off.locator('select[name="processing_officer_id"]') }).first();
  await regForm.locator('input[name="discount_reason"]').fill("zztmp saved again");
  await regForm.getByRole("button", { name: "Save" }).click();
  const saved = await waitFor(async () => (await admin.from("leads").select("discount_reason").eq("id", student).single()).data?.discount_reason === "zztmp saved again", 60);
  const { data: kept } = await admin.from("lead_destinations").select("dashboard_stage_values").eq("lead_id", student).single();
  ok("the Registration card saves", Boolean(saved));
  const { data: assigned } = await admin.from("leads").select("assigned_counselor_id, processing_officer_id").eq("id", student).single();
  ok("...without taking the student off their counsellor or officer", assigned.assigned_counselor_id === counselor.id && assigned.processing_officer_id === officer.id, JSON.stringify(assigned));
  ok("...and keeps the country stages it used to wipe", kept?.dashboard_stage_values?.[stage1.key] === firstValue, JSON.stringify(kept));
  ok("processing: the full record, with its tabs", (await off.locator("[data-stages-only]").count()) === 0 && (await off.locator(`a[href="/students/${student}/documents"]`).count()) > 0);

  // ------------------------------------------------------------- 4. payroll
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { error: payError } = await admin.from("staff_payroll").insert({ staff_id: officer.id, payroll_month: month, basic_salary: 123456 });
  if (payError) throw new Error(`could not add the fixture payroll row: ${payError.message}`);
  const { data: seen } = await asCounselor.from("staff_payroll").select("staff_id").eq("staff_id", officer.id);
  ok("payroll: a counsellor cannot read a colleague's", (seen ?? []).length === 0, JSON.stringify(seen));
  const { data: own } = await asOfficer.from("staff_payroll").select("basic_salary").eq("staff_id", officer.id);
  ok("payroll: ...the person themselves can", own?.[0]?.basic_salary == 123456, JSON.stringify(own));

  // ---------------------------------------------------------- 5. dashboards
  await open(cou, "/dashboard", "[data-dashboard-view]");
  const couView = await cou.locator("[data-dashboard-view]").first().getAttribute("data-dashboard-view");
  const couText = await cou.locator("main").innerText();
  ok("counsellor: their dashboard is My sales, with no other tabs", couView === "sales" && (await cou.locator('[role="tablist"]').count()) === 0, String(couView));
  ok("counsellor: the lead nobody has called is on their list", couText.includes("zztmp dash-stale"));
  ok("counsellor: their registered student is on their progress list", couText.includes("zztmp dash-student"));
  ok("counsellor: processing's document review is not in their queue", !/document[s]? to review/i.test(couText));
  await open(cou, "/dashboard?view=finance", "[data-dashboard-view]");
  ok("counsellor: asking for another dashboard gets their own", (await cou.locator("[data-dashboard-view]").first().getAttribute("data-dashboard-view")) === "sales");

  await open(off, "/dashboard", "[data-dashboard-view]");
  const offText = await off.locator("main").innerText();
  ok("processing: their dashboard is My processing", (await off.locator("[data-dashboard-view]").first().getAttribute("data-dashboard-view")) === "processing");
  ok("processing: their student's waiting document is listed", /Documents waiting longest[\s\S]*zztmp dash-student/.test(offText), offText.slice(0, 400));

  const sa = await signIn(browser, superUser.email);
  await open(sa, "/dashboard", "[data-dashboard-view]");
  const tabs = await sa.locator('[role="tablist"] [role="tab"]').allInnerTexts();
  ok("super admin: every dashboard is a tab, the overview first", tabs.length === 6 && tabs[0] === "Overview", tabs.join(" | "));
  await open(sa, "/dashboard?view=processing_team", '[data-dashboard-view="processing_team"]');
  ok("super admin: the processing team lists each officer", (await sa.locator('[data-dashboard-view="processing_team"]').innerText()).includes("zztmp dash-officer"));

  const mgr = await signIn(browser, manager.email);
  await open(mgr, "/dashboard", "[data-dashboard-view]");
  ok("management: the overview renders", (await mgr.locator('[data-dashboard-view="overview"]').count()) === 1);
  await open(mgr, "/dashboard?view=processing_team", '[data-dashboard-view="processing_team"]');
  ok("management: so does the processing team, with its visa figures", /visa approval rate/i.test(await mgr.locator("main").innerText()));

  // -------------------------------------- 6. deleting a registered student
  // Last, since everything above reads this student. Deleting a student
  // removes their countries by cascade once the student row is gone, and
  // 0276's guard, finding no student to check, refused even a Super Admin —
  // "Only the processing team can remove a country that has stage progress
  // recorded" (0282).
  const { data: progress } = await admin.from("lead_destinations").select("dashboard_stage_values").eq("lead_id", student).single();
  const asSuper = await apiAs(url, anonKey, superUser.email);
  const removal = await asSuper.from("leads").delete().eq("id", student).select("id");
  const { data: left } = await admin.from("leads").select("id").eq("id", student).maybeSingle();
  ok("super admin: a registered student with country stages recorded can be deleted",
    Object.keys(progress?.dashboard_stage_values ?? {}).length > 0 && !removal.error && !left,
    JSON.stringify({ progress: progress?.dashboard_stage_values, error: removal.error?.message, stillThere: Boolean(left) }));

  await browser.close();
} finally {
  const removed = await fx.cleanup(); // leads, their documents and destinations, then the staff and their payroll
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
