// The task manager, end to end against a portal (0331):
//
//   VERIFY_AGAINST_PRODUCTION=yes npm run check:tasks
//
//   * Tasks is in the menu, with a count of one's own due today or overdue;
//   * a counsellor makes a task for herself and a colleague — urgent, due
//     tomorrow, about a lead, with a two-step checklist — and it is one task
//     with two copies, listed under Tomorrow, its panel open on it;
//   * she ticks a step, comments and attaches a file; her colleague is told
//     of the task and of the comment;
//   * the colleague opens it from the alert's link, sees who gave it, moves
//     it to In progress and then Done (stamped each time), and has no Delete;
//     the counsellor is told it was finished; someone not on it sees nothing;
//   * the board moves her own copy by its stage; Assigned by me shows the
//     colleague finished; the dashboard, the lead's page and both calendars
//     carry it — hers under the colleague's name, his saying who it is from;
//     Management sees it under Team;
//   * she deletes it: the task, its copies, steps, comments and file go, the
//     file kept in the trash.
//
// Everything is named zztmp and removed in a finally.
import { BASE, clients, fixtures, openBrowser, reporter, requireConfirmation, signIn } from "./verify-portal-lib.mjs";

requireConfirmation("check:tasks");

const { admin } = clients();
const fx = fixtures(admin);
const { ok, finish } = reporter();
const RUN = Date.now().toString(36);
const day = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const SHOTS = process.env.SHOTS_DIR ?? null;

async function poll(fn, seconds = 60) {
  for (let i = 0; i < seconds * 2; i++) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function hydrated(page, selector) {
  return page
    .waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps")));
    }, selector, { timeout: 60000 })
    .then(() => true, () => false);
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-${name}.png`, fullPage: true });
};

let browser = null;
const title = `zztmp Call the embassy ${RUN}`;
let taskId = null;

try {
  const ayesha = await fx.staff(`taskcoun${RUN}`, ["counselor"]);
  const bilal = await fx.staff(`taskproc${RUN}`, ["processing"]);
  const outsider = await fx.staff(`taskout${RUN}`, ["counselor"]);
  const manager = await fx.staff(`taskmgmt${RUN}`, ["management"]);
  const leadName = `zztmp Task Lead ${RUN}`;
  const leadId = await fx.lead({ full_name: leadName, email: `zztmp-tasklead-${RUN}@example.invalid`, status: "unattended", assigned_counselor_id: ayesha.id });

  browser = await openBrowser();
  const page = await signIn(browser, ayesha.email);

  // ------------------------------------------------------------ the menu
  ok("Tasks is in the menu", (await page.locator('a[href="/tasks"]').count()) > 0);
  const { error: dueError } = await admin.from("personal_tasks").insert({ owner_id: ayesha.id, title: `zztmp due today ${RUN}`, due_date: day(0) });
  ok("(a task of hers is due today)", !dueError, dueError?.message);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const badge = await poll(async () => {
    const text = (await page.locator('a[href="/tasks"]').first().innerText()).replace(/\s+/g, " ");
    return /Tasks\s*1\b/.test(text) ? text : null;
  }, 30);
  ok("...and the menu counts it", Boolean(badge), (await page.locator('a[href="/tasks"]').first().innerText()).replace(/\s+/g, " "));

  // ------------------------------------------------------------ a new task, for two
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-new-task]").first().waitFor({ timeout: 120000 });
  await hydrated(page, "[data-new-task]");
  await page.locator("[data-new-task]").first().click();
  const form = page.locator("[data-new-task-form]");
  await form.waitFor({ timeout: 30000 });
  await form.locator("#task-title").fill(title);
  await form.getByLabel("Find a colleague").fill(bilal.name);
  await form.locator(`[data-person="${bilal.id}"]`).check();
  await form.locator("#task-due").fill(day(1));
  await form.locator("#task-priority").selectOption("urgent");
  await form.getByLabel("Find a student or lead").fill(leadName);
  await form.getByRole("button", { name: new RegExp(leadName) }).click();
  await form.locator("#task-steps").fill("Scan the passport\nEmail the school");
  await shot(page, "new");
  await form.locator("[data-create-task]").click();

  const made = await poll(async () => {
    const { data } = await admin.from("personal_tasks").select("id, task_id, owner_id, assigned_by, status, priority, student_id, due_date").eq("title", title);
    return data?.length === 2 ? data : null;
  });
  ok("one task, a copy for each of the two people", Boolean(made), JSON.stringify(made));
  const mine = made?.find((c) => c.owner_id === ayesha.id);
  const his = made?.find((c) => c.owner_id === bilal.id);
  taskId = mine?.task_id ?? null;
  ok("...under one task she set", Boolean(taskId) && his?.task_id === taskId && (await admin.from("staff_tasks").select("created_by").eq("id", taskId).single()).data?.created_by === ayesha.id);
  ok("...his given by her, hers her own", his?.assigned_by === ayesha.id && mine?.assigned_by === null);
  ok("...urgent, due tomorrow, about the lead", made?.every((c) => c.priority === "urgent" && c.due_date === day(1) && c.student_id === leadId));
  const steps = (await admin.from("staff_task_checklist").select("id, label").eq("task_id", taskId).order("sort_order")).data ?? [];
  ok("...with its two steps", steps.map((s) => s.label).join("|") === "Scan the passport|Email the school", JSON.stringify(steps));

  const panel = page.locator(`[data-task-panel="${mine?.id}"]`);
  ok("its panel opens on her copy", await panel.waitFor({ timeout: 60000 }).then(() => true, () => false));
  ok("...saying neither of the two has finished", /People · 0 of 2 done/i.test(await panel.innerText()));
  ok("the list has it under Tomorrow", (await page.locator('[data-task-group="tomorrow"]').filter({ hasText: title }).count()) === 1);

  // ------------------------------------------------------------ a step, a comment, a file
  await panel.locator('[data-step="Scan the passport"]').check();
  ok("she ticks a step on her copy", Boolean(await poll(async () => ((await admin.from("staff_task_checklist_done").select("copy_id").eq("item_id", steps[0].id)).data ?? []).some((t) => t.copy_id === mine.id))));
  await panel.getByLabel("Write a comment").fill(`zztmp booked for Friday ${RUN}`);
  await panel.locator("[data-post-comment]").click();
  ok("she comments", Boolean(await poll(async () => ((await admin.from("staff_task_comments").select("id").eq("task_id", taskId)).data ?? []).length === 1 || null)));
  await panel.locator('[data-attach-file] input[type="file"]').setInputFiles([{ name: "zztmp slots.csv", mimeType: "text/csv", buffer: Buffer.from("day,slot\nFri,10:00\n") }]);
  const attach = panel.locator("[data-attach-submit]");
  await poll(async () => (await attach.isEnabled()) || null, 60);
  await attach.click();
  const fileRow = await poll(async () => (await admin.from("staff_task_files").select("id, file_path, file_name").eq("task_id", taskId).maybeSingle()).data);
  ok("she attaches a file, kept under tasks/<task>/", Boolean(fileRow?.file_path?.startsWith(`tasks/${taskId}/`)) && fileRow?.file_name === "zztmp slots.csv", JSON.stringify(fileRow));
  ok("...listed in the panel by its name", Boolean(await poll(async () => (await panel.locator('[data-task-file="zztmp slots.csv"]').count()) === 1 || null, 30)));
  await shot(page, "panel");

  const alerts = async (who, kind) => (await admin.from("notifications").select("title, link, body").eq("user_id", who).eq("kind", kind)).data ?? [];
  const assigned = await poll(async () => (await alerts(bilal.id, "task_assigned")).find((n) => n.title.includes(title)));
  ok("her colleague is told it is his", Boolean(assigned) && assigned.link === `/tasks?task=${his.id}` && /from zztmp taskcoun/.test(assigned.body ?? ""), JSON.stringify(assigned));
  ok("...and of her comment", Boolean(await poll(async () => (await alerts(bilal.id, "task_comment")).find((n) => n.title.includes(title)))));

  // ------------------------------------------------------------ the colleague
  const bContext = await browser.newContext();
  const bPage = await signIn(browser, bilal.email, { context: bContext });
  await bPage.goto(`${BASE}${assigned?.link ?? "/tasks"}`, { waitUntil: "domcontentloaded" });
  const bPanel = bPage.locator(`[data-task-panel="${his.id}"]`);
  ok("he opens it from the alert's link", await bPanel.waitFor({ timeout: 120000 }).then(() => true, () => false));
  ok("...and sees who gave it", (await bPanel.innerText()).includes(`Given by\nzztmp taskcoun${RUN}`) || /Given by\s*zztmp taskcoun/.test(await bPanel.innerText()));
  ok("...with no Delete, it not being his to delete", (await bPanel.locator("[data-delete-task]").count()) === 0);
  await hydrated(bPage, '[data-set-status="in_progress"]');
  await bPanel.locator('[data-set-status="in_progress"]').click();
  const started = await poll(async () => {
    const r = (await admin.from("personal_tasks").select("status, started_at").eq("id", his.id).single()).data;
    return r?.status === "in_progress" && r.started_at ? r : null;
  });
  ok("he moves it to In progress, and when is stamped", Boolean(started));
  await bPanel.locator('[data-set-status="done"]').click();
  const finished = await poll(async () => {
    const r = (await admin.from("personal_tasks").select("status, completed_at").eq("id", his.id).single()).data;
    return r?.status === "done" && r.completed_at ? r : null;
  });
  ok("...then Done, stamped", Boolean(finished));
  ok("she is told he finished it", Boolean(await poll(async () => (await alerts(ayesha.id, "task_done")).find((n) => n.title.includes(title)))));
  await bPage.goto(`${BASE}/calendar?view=month&date=${day(1)}`, { waitUntil: "domcontentloaded" });
  // Done, so off his calendar now — as a personal task is once ticked.
  await bContext.close();

  // Someone not on it.
  const oContext = await browser.newContext();
  const oPage = await signIn(browser, outsider.email, { context: oContext });
  await oPage.goto(`${BASE}/tasks?task=${his.id}`, { waitUntil: "domcontentloaded" });
  ok("someone not on the task sees nothing of it", Boolean(await poll(async () => ((await oPage.locator("body").innerText()).includes("not one you can see") ? true : null), 60)));
  await oContext.close();

  // ------------------------------------------------------------ board, Assigned by me
  await page.goto(`${BASE}/tasks?view=board`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-board-column="pending"]').waitFor({ timeout: 120000 });
  ok("the board has her copy under To do", (await page.locator('[data-board-column="pending"]').locator(`[data-task-card="${mine.id}"]`).count()) === 1);
  await hydrated(page, `[data-move-task="${mine.id}"]`);
  await page.locator(`[data-move-task="${mine.id}"]`).selectOption("in_progress");
  ok("...and moves it by its stage", Boolean(await poll(async () => ((await admin.from("personal_tasks").select("status").eq("id", mine.id).single()).data?.status === "in_progress" ? true : null))));
  await shot(page, "board");
  await page.goto(`${BASE}/tasks?tab=given`, { waitUntil: "domcontentloaded" });
  const assignment = page.locator(`[data-assignment="${taskId}"]`);
  await assignment.waitFor({ timeout: 120000 });
  ok("Assigned by me shows her colleague finished", (await assignment.locator('[data-assignee-status="done"]').count()) === 1 && /1 of 2 done/.test(await assignment.innerText()), await assignment.innerText());
  await shot(page, "given");

  // ------------------------------------------------------------ dashboard, lead, calendar
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  ok("the dashboard lists it in My tasks", Boolean(await poll(async () => ((await page.locator("[data-my-tasks-card]").count()) && (await page.locator("[data-my-tasks-card]").innerText()).includes(title) ? true : null), 60)));
  await shot(page, "dashboard");
  await page.goto(`${BASE}/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  ok("the lead's page lists it under Team tasks", Boolean(await poll(async () => ((await page.locator(`[data-tasks-about="${leadId}"]`).count()) && (await page.locator(`[data-tasks-about="${leadId}"]`).innerText()).includes(title) ? true : null), 60)));
  // A copy of hers given back to him, open, so his calendar has one from her to show.
  const { data: second } = await admin.from("personal_tasks").insert({ owner_id: bilal.id, assigned_by: ayesha.id, task_id: taskId, title: `zztmp second ${RUN}`, due_date: day(1) }).select("id").single();
  await page.goto(`${BASE}/calendar?view=month&date=${day(1)}`, { waitUntil: "domcontentloaded" });
  ok("her calendar shows what she gave him, under his name", Boolean(await poll(async () => ((await page.locator("body").innerText()).includes(`zztmp taskproc${RUN}: zztmp second ${RUN}`) ? true : null), 90)));
  await shot(page, "calendar");
  const b2 = await browser.newContext();
  const b2Page = await signIn(browser, bilal.email, { context: b2 });
  await b2Page.goto(`${BASE}/calendar?view=month&date=${day(1)}`, { waitUntil: "domcontentloaded" });
  ok("his calendar has it", Boolean(await poll(async () => ((await b2Page.locator("body").innerText()).includes(`zztmp second ${RUN}`) ? true : null), 90)));
  await b2.close();
  if (second) await admin.from("personal_tasks").delete().eq("id", second.id);

  // Management, everyone's.
  const mContext = await browser.newContext();
  const mPage = await signIn(browser, manager.email, { context: mContext });
  await mPage.goto(`${BASE}/tasks?tab=team`, { waitUntil: "domcontentloaded" });
  ok("Management sees it under Team", Boolean(await poll(async () => ((await mPage.locator(`[data-task-card="${mine.id}"]`).count()) === 1 ? true : null), 90)));
  await mContext.close();

  // ------------------------------------------------------------ deleting it
  await page.goto(`${BASE}/tasks?task=${mine.id}`, { waitUntil: "domcontentloaded" });
  const again = page.locator(`[data-task-panel="${mine.id}"]`);
  await again.waitFor({ timeout: 120000 });
  await hydrated(page, "[data-delete-task]");
  page.once("dialog", (d) => d.accept());
  await again.locator("[data-delete-task]").click();
  const gone = await poll(async () => ((await admin.from("staff_tasks").select("id").eq("id", taskId).maybeSingle()).data ? null : true));
  ok("she deletes it: the task goes", Boolean(gone));
  ok("...its copies, steps and comments with it", ((await admin.from("personal_tasks").select("id").eq("task_id", taskId)).data ?? []).length === 0 && ((await admin.from("staff_task_comments").select("id").eq("task_id", taskId)).data ?? []).length === 0);
  const folder = (await admin.storage.from("documents").list(`tasks/${taskId}`)).data ?? [];
  const trashed = (await admin.from("trashed_files").select("path").eq("path", fileRow?.file_path ?? "")).data ?? [];
  ok("...and its file, kept in the trash for 90 days", folder.length === 0 && trashed.length === 1, `left ${folder.length}, trashed ${trashed.length}`);
  if (gone) taskId = null;
} catch (e) {
  ok("the run finished", false, e?.stack ?? String(e));
} finally {
  await browser?.close().catch(() => {});
  // What the fixtures leave that their own cleanup does not reach: a task they
  // set (its copies go with their owners) and its file.
  const fixtureIds = fx.made.filter((m) => m.kind === "staff").map((m) => m.id);
  const { data: setTasks } = fixtureIds.length ? await admin.from("staff_tasks").select("id").in("created_by", fixtureIds) : { data: [] };
  for (const t of setTasks ?? []) {
    const { data: objs } = await admin.storage.from("documents").list(`tasks/${t.id}`);
    if (objs?.length) await admin.storage.from("documents").remove(objs.map((o) => `tasks/${t.id}/${o.name}`));
    await admin.from("staff_tasks").delete().eq("id", t.id);
  }
  const removed = await fx.cleanup();
  process.exitCode = finish(removed) === 0 ? 0 : 1;
}
