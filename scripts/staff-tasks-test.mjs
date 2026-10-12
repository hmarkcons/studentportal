// The task manager's rules: grouping, ordering, progress and the new-task form.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignmentProgress,
  boardColumns,
  checklistProgress,
  compareTasks,
  dueLabel,
  groupTasks,
  isOverdue,
  matchesQuery,
  parseSteps,
  parseTaskForm,
  taskBucket,
  taskCounts,
  timeLabel,
} from "../src/lib/staffTasks.ts";

const TODAY = "2026-10-12"; // a Monday
const t = (over) => ({ status: "pending", due_date: TODAY, due_time: null, priority: "medium", title: "x", ...over });

test("a task's day is said the way a person says it", () => {
  assert.equal(dueLabel("2026-10-09", null, TODAY), "Overdue by 3 days");
  assert.equal(dueLabel("2026-10-11", null, TODAY), "Overdue since yesterday");
  assert.equal(dueLabel(TODAY, "14:30:00", TODAY), "Today 14:30");
  assert.equal(dueLabel("2026-10-13", null, TODAY), "Tomorrow");
  assert.equal(dueLabel("2026-10-16", "09:00", TODAY), "Fri 16 Oct 09:00");
  assert.equal(dueLabel("2026-10-09", null, TODAY, "done"), "Fri 9 Oct");
  assert.equal(dueLabel(null, null, TODAY), "No date");
  assert.equal(timeLabel("07:05:00"), "07:05");
  assert.equal(timeLabel(null), null);
});

test("overdue is an open task whose day has passed — never a finished one", () => {
  assert.equal(isOverdue(t({ due_date: "2026-10-11" }), TODAY), true);
  assert.equal(isOverdue(t({ due_date: "2026-10-11", status: "in_progress" }), TODAY), true);
  assert.equal(isOverdue(t({ due_date: "2026-10-11", status: "done" }), TODAY), false);
  assert.equal(isOverdue(t({ due_date: TODAY }), TODAY), false);
});

test("the list groups by when, in order, and leaves out empty groups", () => {
  const tasks = [
    t({ title: "later", due_date: "2026-11-30" }),
    t({ title: "done", status: "done", completed_at: "2026-10-10T10:00:00Z" }),
    t({ title: "week", due_date: "2026-10-19" }),
    t({ title: "late", due_date: "2026-10-01" }),
    t({ title: "today", due_date: TODAY, status: "in_progress" }),
    t({ title: "tomorrow", due_date: "2026-10-13" }),
  ];
  const groups = groupTasks(tasks, TODAY);
  assert.deepEqual(groups.map((g) => g.label), ["Overdue", "Today", "Tomorrow", "Next 7 days", "Later", "Done"]);
  assert.deepEqual(groups.map((g) => g.tasks[0].title), ["late", "today", "tomorrow", "week", "later", "done"]);
  assert.deepEqual(groupTasks([t({})], TODAY).map((g) => g.bucket), ["today"]);
  // Seven days ahead is still this week's; eight is later.
  assert.equal(taskBucket(t({ due_date: "2026-10-19" }), TODAY), "week");
  assert.equal(taskBucket(t({ due_date: "2026-10-20" }), TODAY), "later");
  assert.equal(taskBucket(t({ due_date: null }), TODAY), "later");
});

test("within a day: a set time first, then the most urgent, then by name; done, the latest finished first", () => {
  const sorted = [
    t({ title: "b low", priority: "low" }),
    t({ title: "a urgent", priority: "urgent" }),
    t({ title: "at nine", due_time: "09:00:00" }),
    t({ title: "c medium" }),
  ].sort(compareTasks);
  assert.deepEqual(sorted.map((x) => x.title), ["at nine", "a urgent", "c medium", "b low"]);
  const done = [t({ status: "done", title: "old", completed_at: "2026-10-01T00:00:00Z" }), t({ status: "done", title: "new", completed_at: "2026-10-11T00:00:00Z" })].sort(compareTasks);
  assert.deepEqual(done.map((x) => x.title), ["new", "old"]);
});

test("the board has a column per status", () => {
  const cols = boardColumns([t({ title: "a" }), t({ title: "b", status: "in_progress" }), t({ title: "c", status: "done" }), t({ title: "d", status: "odd" })]);
  assert.deepEqual(Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.map((x) => x.title)])), { pending: ["a", "d"], in_progress: ["b"], done: ["c"] });
});

test("an assignment's progress across everyone on it", () => {
  assert.deepEqual(assignmentProgress([{ status: "done" }, { status: "pending" }, { status: "in_progress" }]), { total: 3, done: 1, inProgress: 1, status: "in_progress", label: "1 of 3 done" });
  assert.equal(assignmentProgress([{ status: "done" }, { status: "done" }]).status, "done");
  assert.equal(assignmentProgress([{ status: "pending" }, { status: "pending" }]).status, "pending");
  assert.equal(assignmentProgress([{ status: "in_progress" }]).label, "In progress");
  assert.deepEqual(checklistProgress(["a", "b", "c"], new Set(["a", "c", "z"])), { done: 2, total: 3, label: "2 of 3" });
  assert.equal(checklistProgress([], new Set()).label, null);
});

test("the counts the menu and the dashboard show", () => {
  const counts = taskCounts([t({ due_date: "2026-10-01" }), t({}), t({ status: "in_progress", due_date: "2026-10-20" }), t({ status: "done", due_date: "2026-10-01" })], TODAY);
  assert.deepEqual(counts, { open: 3, overdue: 1, today: 1, inProgress: 1 });
});

test("search finds a task by its title, notes, student or the people on it", () => {
  const task = { title: "Call the embassy", description: "ask about slots", studentName: "Ayesha Khan", people: ["Imran Ali"] };
  assert.ok(matchesQuery(task, "EMBASSY"));
  assert.ok(matchesQuery(task, "slots"));
  assert.ok(matchesQuery(task, "ayesha"));
  assert.ok(matchesQuery(task, "imran"));
  assert.ok(matchesQuery(task, "  "));
  assert.ok(!matchesQuery(task, "visa"));
});

test("checklist steps are one to a line; bullets, numbers, blanks and repeats go", () => {
  assert.deepEqual(parseSteps("- Scan passport\n\n2. Email the school\n* scan PASSPORT\n• Book slot  \n"), ["Scan passport", "Email the school", "Book slot"]);
  assert.deepEqual(parseSteps(null), []);
});

const ME = "11111111-1111-4111-8111-111111111111";
const ALI = "22222222-2222-4222-8222-222222222222";

test("a new task's form: what it needs, and what it says when something is wrong", () => {
  const ok = parseTaskForm({ title: "  Call the embassy ", notes: "", due_date: TODAY, due_time: "14:30", priority: "urgent", assignees: [ME, ALI, ME], student_id: "", steps: "Scan\nEmail" });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.values, { title: "Call the embassy", notes: null, due_date: TODAY, due_time: "14:30", priority: "urgent", assignees: [ME, ALI], student_id: null, steps: ["Scan", "Email"] });
  assert.equal(parseTaskForm({ title: "", due_date: TODAY, assignees: [ME] }).error, "Give the task a title.");
  assert.equal(parseTaskForm({ title: "x", due_date: "", assignees: [ME] }).error, "Choose the day it is due.");
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, assignees: [] }).error, "Choose who the task is for.");
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, assignees: [] }, { requireAssignee: false }).error, null);
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, due_time: "25:00", assignees: [ME] }).error, "That time is not one the day has.");
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, priority: "high", assignees: [ME] }).error, "Choose Urgent, Medium or Low.");
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, assignees: ["nobody"] }).error, "One of the people chosen is not a staff member.");
  assert.equal(parseTaskForm({ title: "x".repeat(201), due_date: TODAY, assignees: [ME] }).error, "Keep the title to 200 characters.");
  assert.match(parseTaskForm({ title: "x", due_date: TODAY, assignees: [ME], steps: "y".repeat(301) }).error, /Keep each step to 300 characters/);
  assert.equal(parseTaskForm({ title: "x", due_date: TODAY, assignees: [ME], due_time: "09:15:00" }).values.due_time, "09:15");
});
