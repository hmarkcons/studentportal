"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { uploadedFile } from "@/lib/stagedUpload";
import { sanitizeFilename } from "@/lib/documentUpload";
import { MAX_UPLOAD_BYTES } from "@/lib/fileSize";
import { removeStorageFiles } from "@/lib/fileTrash";
import { COMMENT_MAX, STEP_MAX, isTaskStatus, parseTaskForm, taskFileError, type TaskStatus } from "@/lib/staffTasks";
import { loadTaskDetail, loadTaskPeople, type TaskDetail } from "@/lib/staffTasksLoad";

// The task manager's writes (0331). Every write asks for its rows back: an
// UPDATE or DELETE that row-level security refuses raises nothing and matches
// nothing, which would read as "Saved." for a change that never happened.

type Result = { success?: boolean; error?: string; id?: string; taskId?: string };

const REFUSED = "Not saved — this task is not yours to change, or it no longer exists.";

async function session() {
  const { supabase, staff } = await getStaffSession();
  return { supabase, staff, manager: hasRole(staff, "management", "super_admin") };
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
};

/** Puts a file on a task: in documents/tasks/<task>/…, then its row. */
async function attach(supabase: Awaited<ReturnType<typeof getStaffSession>>["supabase"], taskId: string, file: File): Promise<string | null> {
  const problem = taskFileError(file.name, file.size, MAX_UPLOAD_BYTES);
  if (problem) return problem;
  const path = `tasks/${taskId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) return `The file could not be stored: ${uploadError.message}`;
  const { error } = await supabase.from("staff_task_files").insert({ task_id: taskId, file_path: path, file_name: file.name.slice(0, 300), size_bytes: file.size });
  if (error) {
    // Only a file just put there, and never recorded, is removed outright.
    await supabase.storage.from("documents").remove([path]);
    return `The file could not be attached: ${error.message}`;
  }
  return null;
}

/** Who may be given a task: anyone on the staff who is still here. */
async function checkPeople(supabase: Awaited<ReturnType<typeof getStaffSession>>["supabase"], ids: string[]): Promise<string | null> {
  const people = await loadTaskPeople(supabase);
  const active = new Set(people.filter((p) => p.active).map((p) => p.id));
  const unknown = ids.filter((id) => !active.has(id));
  return unknown.length ? "One of the people chosen is no longer on the staff." : null;
}

/** A new task: one copy for each person it is given to, under one task that holds its steps, comments and files. */
export async function createTask(revalidateTo: string, _prev: unknown, formData: FormData): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again to add a task." };
  const { values, error } = parseTaskForm({
    title: text(formData, "title"),
    notes: text(formData, "notes"),
    due_date: text(formData, "due_date"),
    due_time: text(formData, "due_time"),
    priority: text(formData, "priority"),
    assignees: formData.getAll("assignees").map(String),
    student_id: text(formData, "student_id"),
    steps: text(formData, "steps"),
  });
  if (!values) return { error: error ?? "Check the task and try again." };
  const peopleProblem = await checkPeople(supabase, values.assignees);
  if (peopleProblem) return { error: peopleProblem };

  const { data: task, error: taskError } = await supabase.from("staff_tasks").insert({ created_by: staff.id }).select("id").single();
  if (taskError || !task) return { error: taskError?.message ?? "The task could not be made." };

  // The same keys on every row: a batch insert sends null for any a row lacks.
  const rows = values.assignees.map((owner) => ({
    task_id: task.id,
    owner_id: owner,
    assigned_by: owner === staff.id ? null : staff.id,
    title: values.title,
    description: values.notes,
    due_date: values.due_date,
    due_time: values.due_time,
    all_day: !values.due_time,
    priority: values.priority,
    student_id: values.student_id,
  }));
  const { data: copies, error: copiesError } = await supabase.from("personal_tasks").insert(rows).select("id, owner_id");
  if (copiesError || !copies?.length) {
    await supabase.from("staff_tasks").delete().eq("id", task.id);
    return { error: copiesError?.message ?? "The task could not be given out." };
  }
  if (values.steps.length) {
    const { error: stepsError } = await supabase
      .from("staff_task_checklist")
      .insert(values.steps.map((label, i) => ({ task_id: task.id, label, sort_order: i })));
    if (stepsError) return { error: `The task was made, but its checklist was not: ${stepsError.message}`, id: copies[0].id, taskId: task.id };
  }
  const file = await uploadedFile(formData, "file");
  if (file) {
    const fileProblem = await attach(supabase, task.id, file);
    if (fileProblem) return { error: `The task was made, but not its file: ${fileProblem}`, id: copies[0].id, taskId: task.id };
  }
  revalidatePath(revalidateTo);
  const mine = copies.find((c) => c.owner_id === staff.id) ?? copies[0];
  return { success: true, id: mine.id as string, taskId: task.id as string };
}

/** The panel's reading of one task — or null once it has gone, or was never the viewer's to see. */
export async function getTaskDetail(copyId: string): Promise<TaskDetail | null> {
  const { supabase, staff, manager } = await session();
  if (!staff) return null;
  return loadTaskDetail(supabase, copyId, { id: staff.id, manager });
}

/**
 * Changes a task's title, notes, day, time, priority or student. Whoever set
 * it changes every copy; the person it was given to changes only their own —
 * moving their day, say — as they can on the calendar.
 */
export async function updateTask(copyId: string, revalidateTo: string, _prev: unknown, formData: FormData): Promise<Result> {
  const { supabase, staff, manager } = await session();
  if (!staff) return { error: "Sign in again." };
  const { values, error } = parseTaskForm(
    {
      title: text(formData, "title"),
      notes: text(formData, "notes"),
      due_date: text(formData, "due_date"),
      due_time: text(formData, "due_time"),
      priority: text(formData, "priority"),
      student_id: text(formData, "student_id"),
    },
    { requireAssignee: false }
  );
  if (!values) return { error: error ?? "Check the task and try again." };
  const { data: copy } = await supabase.from("personal_tasks").select("id, task_id").eq("id", copyId).maybeSingle();
  if (!copy) return { error: REFUSED };
  const { data: task } = await supabase.from("staff_tasks").select("created_by").eq("id", copy.task_id).maybeSingle();
  const everyone = manager || task?.created_by === staff.id;
  const patch = {
    title: values.title,
    description: values.notes,
    due_date: values.due_date,
    due_time: values.due_time,
    all_day: !values.due_time,
    priority: values.priority,
    student_id: values.student_id,
  };
  const query = supabase.from("personal_tasks").update(patch);
  const { data, error: updateError } = await (everyone ? query.eq("task_id", copy.task_id) : query.eq("id", copyId)).select("id");
  if (updateError) return { error: updateError.message };
  if (!data?.length) return { error: REFUSED };
  revalidatePath(revalidateTo);
  return { success: true, id: copyId };
}

/** To do, In progress or Done. */
export async function setTaskStatus(copyId: string, status: TaskStatus, revalidateTo: string | null = null): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  if (!isTaskStatus(status)) return { error: "That is not a stage a task can be in." };
  const { data, error } = await supabase.from("personal_tasks").update({ status }).eq("id", copyId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };
  if (revalidateTo) revalidatePath(revalidateTo);
  return { success: true, id: copyId };
}

/** The whole task, every copy and everything on it. Its files are kept for 90 days (fileTrash). */
export async function deleteTask(copyId: string, revalidateTo: string): Promise<Result> {
  const { supabase, staff, manager } = await session();
  if (!staff) return { error: "Sign in again." };
  const { data: copy } = await supabase.from("personal_tasks").select("task_id").eq("id", copyId).maybeSingle();
  if (!copy) return { error: "Not deleted — this task is not yours, or it is already gone." };
  const { data: task } = await supabase.from("staff_tasks").select("created_by").eq("id", copy.task_id).maybeSingle();
  if (!manager && task?.created_by !== staff.id) return { error: "Only whoever set this task can delete it. Mark it done instead." };
  // The files first, while the task is still there to say who may remove them.
  await removeTaskFiles(supabase, copy.task_id as string);
  const { data, error } = await supabase.from("staff_tasks").delete().eq("id", copy.task_id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only whoever set this task can delete it. Mark it done instead." };
  revalidatePath(revalidateTo);
  return { success: true };
}

/** Every file on a task, kept for 90 days (fileTrash) — so a restore of the task brings them back. */
async function removeTaskFiles(supabase: Awaited<ReturnType<typeof getStaffSession>>["supabase"], taskId: string) {
  const { data: files } = await supabase.from("staff_task_files").select("file_path").eq("task_id", taskId);
  if (files?.length) await removeStorageFiles(supabase, "documents", files.map((f) => f.file_path as string));
}

/** Takes one person off a task. The last one off takes the task with them. */
export async function removeFromTask(copyId: string, revalidateTo: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const { data: copy } = await supabase.from("personal_tasks").select("task_id").eq("id", copyId).maybeSingle();
  if (!copy) return { error: REFUSED };
  const { data, error } = await supabase.from("personal_tasks").delete().eq("id", copyId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only whoever set this task can take someone off it." };
  const { count } = await supabase.from("personal_tasks").select("id", { count: "exact", head: true }).eq("task_id", copy.task_id);
  if (!count) {
    await removeTaskFiles(supabase, copy.task_id as string);
    await supabase.from("staff_tasks").delete().eq("id", copy.task_id);
  }
  revalidatePath(revalidateTo);
  return { success: true };
}

/** Gives a task to more people: each a copy like the first, starting at To do. */
export async function addPeopleToTask(copyId: string, people: string[], revalidateTo: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const ids = [...new Set(people.map((p) => p.trim()).filter(Boolean))];
  if (!ids.length) return { error: "Choose who to give it to." };
  const peopleProblem = await checkPeople(supabase, ids);
  if (peopleProblem) return { error: peopleProblem };
  const { data: copy } = await supabase
    .from("personal_tasks")
    .select("task_id, title, description, due_date, due_time, all_day, priority, student_id")
    .eq("id", copyId)
    .maybeSingle();
  if (!copy) return { error: REFUSED };
  const { data: existing } = await supabase.from("personal_tasks").select("owner_id").eq("task_id", copy.task_id);
  const have = new Set((existing ?? []).map((e) => e.owner_id as string));
  const fresh = ids.filter((id) => !have.has(id));
  if (!fresh.length) return { error: "Everyone chosen already has this task." };
  const { data, error } = await supabase
    .from("personal_tasks")
    .insert(
      fresh.map((owner) => ({
        task_id: copy.task_id,
        owner_id: owner,
        assigned_by: owner === staff.id ? null : staff.id,
        title: copy.title,
        description: copy.description,
        due_date: copy.due_date,
        due_time: copy.due_time,
        all_day: copy.all_day,
        priority: copy.priority,
        student_id: copy.student_id,
      }))
    )
    .select("id");
  if (error) return { error: error.message.includes("task you set") ? "Only whoever set this task can give it to more people." : error.message };
  if (!data?.length) return { error: REFUSED };
  revalidatePath(revalidateTo);
  return { success: true };
}

// ------------------------------------------------------------------ the checklist

export async function addTaskStep(taskId: string, label: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const step = label.trim();
  if (!step) return { error: "Write the step first." };
  if (step.length > STEP_MAX) return { error: `Keep a step to ${STEP_MAX} characters.` };
  const { data: last } = await supabase.from("staff_task_checklist").select("sort_order").eq("task_id", taskId).order("sort_order", { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from("staff_task_checklist")
    .insert({ task_id: taskId, label: step, sort_order: ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1 })
    .select("id");
  if (error) return { error: error.message.includes("row-level security") ? "Only the people on this task can add to its checklist." : error.message };
  return { success: true, id: data?.[0]?.id as string };
}

export async function removeTaskStep(stepId: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const { data, error } = await supabase.from("staff_task_checklist").delete().eq("id", stepId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };
  return { success: true };
}

/** Ticks a step, or unticks it, on one person's copy. */
export async function tickTaskStep(stepId: string, copyId: string, done: boolean): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  if (done) {
    const { error } = await supabase.from("staff_task_checklist_done").upsert({ item_id: stepId, copy_id: copyId }, { onConflict: "item_id,copy_id", ignoreDuplicates: true });
    if (error) return { error: error.message.includes("row-level security") ? "Only the person this copy belongs to can tick its steps." : error.message };
  } else {
    const { error } = await supabase.from("staff_task_checklist_done").delete().eq("item_id", stepId).eq("copy_id", copyId);
    if (error) return { error: error.message };
  }
  return { success: true };
}

// ------------------------------------------------------------------ comments and files

export async function addTaskComment(taskId: string, body: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const words = body.trim();
  if (!words) return { error: "Write the comment first." };
  if (words.length > COMMENT_MAX) return { error: `Keep a comment to ${COMMENT_MAX} characters.` };
  const { data, error } = await supabase.from("staff_task_comments").insert({ task_id: taskId, author_id: staff.id, body: words }).select("id");
  if (error) return { error: error.message.includes("row-level security") ? "Only the people on this task can comment on it." : error.message };
  return { success: true, id: data?.[0]?.id as string };
}

export async function deleteTaskComment(commentId: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const { data, error } = await supabase.from("staff_task_comments").delete().eq("id", commentId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only whoever wrote a comment can delete it." };
  return { success: true };
}

export async function addTaskFile(taskId: string, _prev: unknown, formData: FormData): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const file = await uploadedFile(formData, "file");
  if (!file) return { error: "Choose a file to attach." };
  const problem = await attach(supabase, taskId, file);
  return problem ? { error: problem } : { success: true };
}

/** Takes a file off a task; the file itself is kept for 90 days (fileTrash) and comes back with a restore. */
export async function deleteTaskFile(fileId: string): Promise<Result> {
  const { supabase, staff } = await session();
  if (!staff) return { error: "Sign in again." };
  const { data: row } = await supabase.from("staff_task_files").select("file_path").eq("id", fileId).maybeSingle();
  if (!row) return { error: REFUSED };
  const { data, error } = await supabase.from("staff_task_files").delete().eq("id", fileId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only whoever attached a file, or set the task, can take it off." };
  await removeStorageFiles(supabase, "documents", [row.file_path as string]);
  return { success: true };
}
