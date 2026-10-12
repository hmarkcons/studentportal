// The staff task manager: what a task's status and dates mean, how a list of
// them is grouped and ordered, and what a new task's form may hold.
//
// A task is a personal_tasks row — each person's own copy, which is what
// their list, their calendar and their reminders read — under a staff_tasks
// row that ties the copies of one assignment together and holds what they
// share: the checklist's steps, the comments and the files (0331). Assigning
// one task to three people makes three copies; each moves through To do, In
// progress and Done on their own, and the assigner sees who has finished.
//
// Pure, so it is unit-tested (scripts/staff-tasks-test.mjs).

export const TASK_STATUSES = ["pending", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

/** Still to be done: To do or In progress. */
export function isOpen(status: string | null | undefined): boolean {
  return status !== "done";
}

export const TASK_PRIORITIES = ["urgent", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = { urgent: "Urgent", medium: "Medium", low: "Low" };
const PRIORITY_RANK: Record<string, number> = { urgent: 0, medium: 1, low: 2 };

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ dates

const weekday = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
};

/** "14:30" from a stored "14:30:00". */
export function timeLabel(time: string | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Whole days from today to the date, negative once past. */
export function daysUntil(due: string, today: string): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = due.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * When a task is due, said the way a person would: "Overdue by 3 days",
 * "Today 14:30", "Tomorrow", "Fri 16 Oct". A finished task just has its date.
 */
export function dueLabel(due: string | null | undefined, time: string | null | undefined, today: string, status?: string | null): string {
  if (!due) return "No date";
  const at = timeLabel(time);
  const withTime = (words: string) => (at ? `${words} ${at}` : words);
  if (status === "done") return withTime(weekday(due));
  const days = daysUntil(due, today);
  if (days < 0) return days === -1 ? "Overdue since yesterday" : `Overdue by ${-days} days`;
  if (days === 0) return withTime("Today");
  if (days === 1) return withTime("Tomorrow");
  return withTime(weekday(due));
}

/** An open task whose day has passed. */
export function isOverdue(task: { status: string | null; due_date: string | null }, today: string): boolean {
  return isOpen(task.status) && Boolean(task.due_date) && (task.due_date as string) < today;
}

// ------------------------------------------------------------------ grouping

export type TaskBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "done";

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
  done: "Done",
};

const BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "tomorrow", "week", "later", "done"];

export function taskBucket(task: { status: string | null; due_date: string | null }, today: string): TaskBucket {
  if (!isOpen(task.status)) return "done";
  if (!task.due_date) return "later";
  const days = daysUntil(task.due_date, today);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

type Sortable = { status: string | null; due_date: string | null; due_time?: string | null; priority?: string | null; title?: string | null; completed_at?: string | null };

/** Soonest first, then a set time before none, then the most urgent, then by name. Done: the latest finished first. */
export function compareTasks(a: Sortable, b: Sortable): number {
  if (!isOpen(a.status) && !isOpen(b.status)) {
    return (b.completed_at ?? b.due_date ?? "").localeCompare(a.completed_at ?? a.due_date ?? "");
  }
  return (
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") ||
    (PRIORITY_RANK[a.priority ?? "medium"] ?? 1) - (PRIORITY_RANK[b.priority ?? "medium"] ?? 1) ||
    (a.title ?? "").localeCompare(b.title ?? "")
  );
}

/** The list view: Overdue, Today, Tomorrow, Next 7 days, Later and Done, each in order, empty groups left out. */
export function groupTasks<T extends Sortable>(tasks: readonly T[], today: string): { bucket: TaskBucket; label: string; tasks: T[] }[] {
  const by = new Map<TaskBucket, T[]>();
  for (const t of tasks) {
    const b = taskBucket(t, today);
    by.set(b, [...(by.get(b) ?? []), t]);
  }
  return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ bucket: b, label: BUCKET_LABELS[b], tasks: [...by.get(b)!].sort(compareTasks) }));
}

/** The board view: one column per status, each in order. */
export function boardColumns<T extends Sortable>(tasks: readonly T[]): Record<TaskStatus, T[]> {
  const cols: Record<TaskStatus, T[]> = { pending: [], in_progress: [], done: [] };
  for (const t of tasks) cols[isTaskStatus(t.status) ? t.status : "pending"].push(t);
  for (const s of TASK_STATUSES) cols[s].sort(compareTasks);
  return cols;
}

// ------------------------------------------------------------------ progress

/** Where an assignment stands across everyone on it. */
export function assignmentProgress(copies: readonly { status: string | null }[]): {
  total: number;
  done: number;
  inProgress: number;
  status: TaskStatus;
  label: string;
} {
  const total = copies.length;
  const done = copies.filter((c) => c.status === "done").length;
  const inProgress = copies.filter((c) => c.status === "in_progress").length;
  const status: TaskStatus = total > 0 && done === total ? "done" : done > 0 || inProgress > 0 ? "in_progress" : "pending";
  const label = total <= 1 ? TASK_STATUS_LABELS[status] : `${done} of ${total} done`;
  return { total, done, inProgress, status, label };
}

/** A checklist's steps ticked by one person: "3 of 5". */
export function checklistProgress(itemIds: readonly string[], ticked: ReadonlySet<string>): { done: number; total: number; label: string | null } {
  const total = itemIds.length;
  const done = itemIds.filter((id) => ticked.has(id)).length;
  return { done, total, label: total ? `${done} of ${total}` : null };
}

/** The counts the dashboard card and the menu show. */
export function taskCounts(tasks: readonly { status: string | null; due_date: string | null }[], today: string) {
  const open = tasks.filter((t) => isOpen(t.status));
  return {
    open: open.length,
    overdue: open.filter((t) => t.due_date && t.due_date < today).length,
    today: open.filter((t) => t.due_date === today).length,
    inProgress: open.filter((t) => t.status === "in_progress").length,
  };
}

// ------------------------------------------------------------------ search

/** Whether a task matches what was typed: its title, notes, student, or the people on it. */
export function matchesQuery(
  task: { title?: string | null; description?: string | null; studentName?: string | null; people?: readonly (string | null | undefined)[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [task.title, task.description, task.studentName, ...(task.people ?? [])].some((v) => (v ?? "").toLowerCase().includes(q));
}

// ------------------------------------------------------------------ files

/** What a task may carry: documents, pictures, and the sheets work is done in. */
export const TASK_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "doc", "docx", "xls", "xlsx", "csv", "txt"] as const;
export const TASK_FILE_ACCEPT = TASK_FILE_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Why a file cannot go on a task, or null when it can. */
export function taskFileError(name: string, size: number, maxBytes: number): string | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  if (!(TASK_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Attach a PDF, a picture, a Word or Excel file, a CSV or a text file.";
  }
  if (size <= 0) return "That file is empty.";
  if (size > maxBytes) return `That file is ${(size / 1024 / 1024).toFixed(1)} MB; the most a task can take is ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

// ------------------------------------------------------------------ the form

export const TITLE_MAX = 200;
export const NOTES_MAX = 4000;
export const STEP_MAX = 300;
export const STEPS_MAX = 50;
export const ASSIGNEES_MAX = 25;
export const COMMENT_MAX = 2000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TaskFormInput = {
  title?: string | null;
  notes?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  priority?: string | null;
  assignees?: readonly string[];
  student_id?: string | null;
  steps?: string | null;
};

export type TaskFormValues = {
  title: string;
  notes: string | null;
  due_date: string;
  due_time: string | null;
  priority: TaskPriority;
  assignees: string[];
  student_id: string | null;
  steps: string[];
};

/** The steps of a checklist typed one to a line, blank lines and repeats dropped. */
export function parseSteps(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const step = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!step || seen.has(step.toLowerCase())) continue;
    seen.add(step.toLowerCase());
    out.push(step);
  }
  return out;
}

/** A new or edited task, checked; the error is a sentence to show beside the form. */
export function parseTaskForm(input: TaskFormInput, { requireAssignee = true }: { requireAssignee?: boolean } = {}): { values: TaskFormValues | null; error: string | null } {
  const title = (input.title ?? "").trim();
  if (!title) return { values: null, error: "Give the task a title." };
  if (title.length > TITLE_MAX) return { values: null, error: `Keep the title to ${TITLE_MAX} characters.` };
  const notes = (input.notes ?? "").trim();
  if (notes.length > NOTES_MAX) return { values: null, error: `Keep the notes to ${NOTES_MAX} characters.` };
  const due = (input.due_date ?? "").trim();
  if (!DATE.test(due)) return { values: null, error: "Choose the day it is due." };
  const time = (input.due_time ?? "").trim().slice(0, 5);
  if (time && !TIME.test(time)) return { values: null, error: "That time is not one the day has." };
  const priority = (input.priority ?? "medium").trim() || "medium";
  if (!isTaskPriority(priority)) return { values: null, error: "Choose Urgent, Medium or Low." };
  const assignees = [...new Set((input.assignees ?? []).map((a) => a.trim()).filter(Boolean))];
  if (assignees.some((a) => !UUID.test(a))) return { values: null, error: "One of the people chosen is not a staff member." };
  if (requireAssignee && assignees.length === 0) return { values: null, error: "Choose who the task is for." };
  if (assignees.length > ASSIGNEES_MAX) return { values: null, error: `A task can go to at most ${ASSIGNEES_MAX} people at once.` };
  const student = (input.student_id ?? "").trim();
  if (student && !UUID.test(student)) return { values: null, error: "That student or lead could not be found." };
  const steps = parseSteps(input.steps);
  if (steps.length > STEPS_MAX) return { values: null, error: `A checklist can have at most ${STEPS_MAX} steps.` };
  const tooLong = steps.find((s) => s.length > STEP_MAX);
  if (tooLong) return { values: null, error: `Keep each step to ${STEP_MAX} characters: "${tooLong.slice(0, 40)}…" is longer.` };
  return {
    values: { title, notes: notes || null, due_date: due, due_time: time || null, priority, assignees, student_id: student || null, steps },
    error: null,
  };
}
