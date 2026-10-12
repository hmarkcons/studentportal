import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { documentUrls } from "@/lib/storageUrls";
import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from "@/lib/staffTasks";

// What the task manager reads (0331): the people one can assign to, one's own
// tasks, the ones one gave others, everyone's for Management, and one task in
// full for its panel. Read through the viewer's own session, so row-level
// security decides whose tasks are in it.

export type TaskPerson = { id: string; full_name: string; designation: string | null; active: boolean };

/** Every member of staff by name — through task_people(), which any of them may call (0331). */
export async function loadTaskPeople(supabase: SupabaseClient): Promise<TaskPerson[]> {
  const { data } = await supabase.rpc("task_people");
  return ((data ?? []) as TaskPerson[]).map((p) => ({ ...p, full_name: p.full_name ?? "Someone" }));
}

/** One copy of a task, as a card shows it. */
export type TaskCard = {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  ownerId: string;
  /** Who gave it to its owner; null for their own. */
  assignedBy: string | null;
  studentId: string | null;
  studentName: string | null;
  studentHref: string | null;
  source: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  steps: { done: number; total: number };
  comments: number;
  files: number;
};

type Raw = {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  priority: string | null;
  status: string;
  owner_id: string;
  assigned_by: string | null;
  student_id: string | null;
  source: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  student: unknown;
};

const COLUMNS =
  "id, task_id, title, description, due_date, due_time, priority, status, owner_id, assigned_by, student_id, source, started_at, completed_at, created_at, student:leads!personal_tasks_student_id_fkey(full_name, registered_at)";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Where a linked student or lead opens: their student page once registered, their lead page before. */
export function personHref(id: string | null, registeredAt: string | null | undefined): string | null {
  if (!id) return null;
  return registeredAt ? `/students/${id}` : `/leads/${id}`;
}

function toCard(r: Raw): Omit<TaskCard, "steps" | "comments" | "files"> {
  const student = one(r.student as never) as { full_name?: string; registered_at?: string | null } | null;
  return {
    id: r.id,
    taskId: r.task_id,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    due_time: r.due_time,
    priority: isTaskPriority(r.priority) ? r.priority : "medium",
    status: isTaskStatus(r.status) ? r.status : "pending",
    ownerId: r.owner_id,
    assignedBy: r.assigned_by && r.assigned_by !== r.owner_id ? r.assigned_by : null,
    studentId: r.student_id,
    studentName: r.student_id ? (student?.full_name ?? "A student") : null,
    studentHref: personHref(r.student_id, student?.registered_at),
    source: r.source,
    started_at: r.started_at,
    completed_at: r.completed_at,
    created_at: r.created_at,
  };
}

/** How many steps each copy has ticked, and how many comments and files each task has. */
async function withExtras(supabase: SupabaseClient, rows: Raw[]): Promise<TaskCard[]> {
  const cards = rows.map(toCard);
  const taskIds = [...new Set(cards.map((c) => c.taskId))];
  const copyIds = cards.map((c) => c.id);
  if (cards.length === 0) return [];
  const [steps, ticks, comments, files] = await Promise.all([
    readAllIn<{ id: string; task_id: string }>(taskIds, (chunk, from, to) =>
      supabase.from("staff_task_checklist").select("id, task_id").in("task_id", chunk).order("id").range(from, to) as never
    ),
    readAllIn<{ item_id: string; copy_id: string }>(copyIds, (chunk, from, to) =>
      supabase.from("staff_task_checklist_done").select("item_id, copy_id").in("copy_id", chunk).order("item_id").range(from, to) as never
    ),
    readAllIn<{ task_id: string }>(taskIds, (chunk, from, to) =>
      supabase.from("staff_task_comments").select("task_id").in("task_id", chunk).order("id").range(from, to) as never
    ),
    readAllIn<{ task_id: string }>(taskIds, (chunk, from, to) =>
      supabase.from("staff_task_files").select("task_id").in("task_id", chunk).order("id").range(from, to) as never
    ),
  ]);
  const count = (list: { task_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.task_id, (m.get(r.task_id) ?? 0) + 1);
    return m;
  };
  const stepsByTask = count(steps);
  const stepIds = new Set(steps.map((s) => s.id));
  const ticksByCopy = new Map<string, number>();
  for (const t of ticks) if (stepIds.has(t.item_id)) ticksByCopy.set(t.copy_id, (ticksByCopy.get(t.copy_id) ?? 0) + 1);
  const commentsByTask = count(comments);
  const filesByTask = count(files);
  return cards.map((c) => ({
    ...c,
    steps: { done: ticksByCopy.get(c.id) ?? 0, total: stepsByTask.get(c.taskId) ?? 0 },
    comments: commentsByTask.get(c.taskId) ?? 0,
    files: filesByTask.get(c.taskId) ?? 0,
  }));
}

/** Open, or finished within the last month: a done list that grows for ever helps nobody. */
const recentDone = (today: string) => {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 30)).toISOString();
};

/** The viewer's own tasks: theirs, and those given to them. */
export async function loadMyTasks(supabase: SupabaseClient, me: string, today: string): Promise<TaskCard[]> {
  const rows = await readAll<Raw>((from, to) =>
    supabase
      .from("personal_tasks")
      .select(COLUMNS)
      .eq("owner_id", me)
      .or(`status.neq.done,completed_at.gte.${recentDone(today)}`)
      .order("id")
      .range(from, to) as never
  );
  return withExtras(supabase, rows);
}

/** The copies of tasks the viewer gave colleagues. */
export async function loadGivenTasks(supabase: SupabaseClient, me: string, today: string): Promise<TaskCard[]> {
  const rows = await readAll<Raw>((from, to) =>
    supabase
      .from("personal_tasks")
      .select(COLUMNS)
      .eq("assigned_by", me)
      .neq("owner_id", me)
      .or(`status.neq.done,completed_at.gte.${recentDone(today)}`)
      .order("id")
      .range(from, to) as never
  );
  return withExtras(supabase, rows);
}

/** Everyone's — for Management and Super Admin, whom row-level security lets read them all. */
export async function loadTeamTasks(supabase: SupabaseClient, today: string): Promise<TaskCard[]> {
  const rows = await readAll<Raw>((from, to) =>
    supabase
      .from("personal_tasks")
      .select(COLUMNS)
      .or(`status.neq.done,completed_at.gte.${recentDone(today)}`)
      .order("id")
      .range(from, to) as never
  );
  return withExtras(supabase, rows);
}

/** The open tasks about one student or lead that the viewer may see, for their page. */
export async function loadTasksAbout(supabase: SupabaseClient, studentId: string, today: string): Promise<TaskCard[]> {
  const rows = await readAll<Raw>((from, to) =>
    supabase
      .from("personal_tasks")
      .select(COLUMNS)
      .eq("student_id", studentId)
      .or(`status.neq.done,completed_at.gte.${recentDone(today)}`)
      .order("id")
      .range(from, to) as never
  );
  return withExtras(supabase, rows);
}

// ------------------------------------------------------------------ one task, in full

export type TaskDetail = {
  copy: TaskCard;
  /** Every copy of the task the viewer may see — their own among them — each with how far its owner has got. */
  copies: (TaskCard & { ticked: string[] })[];
  createdBy: string | null;
  steps: { id: string; label: string; created_by: string | null }[];
  comments: { id: string; author_id: string | null; body: string; created_at: string }[];
  files: { id: string; file_name: string; size_bytes: number | null; uploaded_by: string | null; created_at: string; url: string | null }[];
  can: {
    /** Change the title, notes, date and priority: of every copy when one set it, of one's own otherwise. */
    edit: boolean;
    /** Delete the whole task. */
    delete: boolean;
    /** Add people to it, or take one off. */
    assign: boolean;
    /** Move the copy along, and tick its steps. */
    progress: boolean;
  };
};

export async function loadTaskDetail(
  supabase: SupabaseClient,
  copyId: string,
  viewer: { id: string; manager: boolean }
): Promise<TaskDetail | null> {
  const { data: copyRow } = await supabase.from("personal_tasks").select(COLUMNS).eq("id", copyId).maybeSingle();
  if (!copyRow) return null;
  const taskId = (copyRow as Raw).task_id;
  const [{ data: task }, { data: siblingRows }, { data: steps }, { data: comments }, { data: files }] = await Promise.all([
    supabase.from("staff_tasks").select("id, created_by").eq("id", taskId).maybeSingle(),
    supabase.from("personal_tasks").select(COLUMNS).eq("task_id", taskId).order("created_at").order("id"),
    supabase.from("staff_task_checklist").select("id, label, created_by").eq("task_id", taskId).order("sort_order").order("created_at"),
    supabase.from("staff_task_comments").select("id, author_id, body, created_at").eq("task_id", taskId).order("created_at"),
    supabase.from("staff_task_files").select("id, file_name, file_path, size_bytes, uploaded_by, created_at").eq("task_id", taskId).order("created_at"),
  ]);
  const siblings = await withExtras(supabase, (siblingRows ?? []) as Raw[]);
  const copyIds = siblings.map((s) => s.id);
  const { data: ticks } = copyIds.length
    ? await supabase.from("staff_task_checklist_done").select("item_id, copy_id").in("copy_id", copyIds)
    : { data: [] as { item_id: string; copy_id: string }[] };
  const urls = await documentUrls(
    supabase,
    (files ?? []).map((f) => f.file_path as string)
  );
  const copy = siblings.find((s) => s.id === copyId) ?? (await withExtras(supabase, [copyRow as Raw]))[0];
  const createdBy = (task?.created_by as string | null) ?? null;
  const setIt = createdBy === viewer.id;
  const ownsOwn = copy.ownerId === viewer.id && !copy.assignedBy;
  return {
    copy,
    copies: siblings.map((s) => ({ ...s, ticked: (ticks ?? []).filter((t) => t.copy_id === s.id).map((t) => t.item_id as string) })),
    createdBy,
    steps: (steps ?? []) as TaskDetail["steps"],
    comments: (comments ?? []) as TaskDetail["comments"],
    files: (files ?? []).map((f) => ({
      id: f.id as string,
      file_name: f.file_name as string,
      size_bytes: (f.size_bytes as number | null) ?? null,
      uploaded_by: (f.uploaded_by as string | null) ?? null,
      created_at: f.created_at as string,
      url: urls.get(f.file_path as string) ?? null,
    })),
    can: {
      edit: setIt || ownsOwn || viewer.manager || copy.ownerId === viewer.id,
      delete: setIt || ownsOwn || viewer.manager,
      assign: setIt || ownsOwn || viewer.manager,
      progress: copy.ownerId === viewer.id || setIt || copy.assignedBy === viewer.id || viewer.manager,
    },
  };
}
