// Reading the calendar's own tables, for the staff calendar page and for the
// calendar search: the columns, the embeds, and the step from a PostgREST row
// (whose embeds arrive as an object or a one-element array) to the flat input
// src/lib/calendarItems.ts maps into an item.
//
// Two things that fail without saying so are handled here once:
//
// **0295's columns may not exist yet.** end_time, location and notify_minutes
// arrive with migration 0295, applied by hand. Naming a missing column fails
// the whole read — the calendar would go blank — so a read that names them is
// retried without them, and the items simply have no end time, place or
// notification until the migration lands.
//
// **PostgREST stops at 1000 rows** and says nothing. Pending tasks with no
// lower date bound (a repeating one that began long ago still has occurrences
// now) can pass that, so they are read a page at a time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, withoutNewColumns, MIGRATION_0295_MISSING, type EventFormValues } from "@/lib/calendarEventFields";
import { readAll } from "@/lib/catalogueReads";
import type { PersonalRowInput, TaskRowInput } from "@/lib/calendarItems";

export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** The columns migration 0295 adds, as a select fragment. */
const COLUMNS_0295 = ", end_time, location, notify_minutes";

const TASK_COLUMNS =
  "id, description, notes, due_date, due_time, end_date, all_day, priority, status, color, guest_emails, recurrence, recurrence_end_date";
const TASK_EMBED = ", application:applications(id, student:leads(id, full_name, assigned_counselor_id, processing_officer_id))";

const PERSONAL_COLUMNS =
  "id, title, description, due_date, due_time, end_date, all_day, priority, status, color, guest_emails, recurrence, recurrence_end_date, student_id";
const PERSONAL_EMBED = ", student:leads!personal_tasks_student_id_fkey(full_name)";

export function taskSelect(with0295: boolean): string {
  return TASK_COLUMNS + (with0295 ? COLUMNS_0295 : "") + TASK_EMBED;
}

export function personalSelect(with0295: boolean): string {
  return PERSONAL_COLUMNS + (with0295 ? COLUMNS_0295 : "") + PERSONAL_EMBED;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;

/**
 * Every row, with 0295's columns when the database has them. `run` is given
 * whether to name them and the page bounds.
 */
export async function readAllWith0295<T>(run: (with0295: boolean, from: number, to: number) => PageResult<T>): Promise<T[]> {
  try {
    return await readAll<T>((from, to) => run(true, from, to));
  } catch (error) {
    if (!isMissingColumnError({ message: (error as Error).message })) throw error;
    return await readAll<T>((from, to) => run(false, from, to));
  }
}

/** One read (not paged), retried without 0295's columns if they are missing. */
export async function readWith0295<T>(run: (with0295: boolean) => PageResult<T>): Promise<{ data: T[]; error: string | null }> {
  let result = await run(true);
  if (result.error && isMissingColumnError(result.error)) result = await run(false);
  return { data: result.data ?? [], error: result.error?.message ?? null };
}

export type StudentRef = {
  id?: string;
  full_name?: string;
  assigned_counselor_id?: string | null;
  processing_officer_id?: string | null;
};

export type RawTaskRow = Omit<TaskRowInput, "applicationId" | "studentId" | "studentName"> & { application: unknown };
export type RawPersonalRow = Omit<PersonalRowInput, "studentName"> & { student: unknown };

/** A task row as calendarItems takes it, and the student it is about (for scoping). */
export function taskInput(raw: RawTaskRow): { input: TaskRowInput; student: StudentRef | null } {
  const app = one(raw.application as never) as { id?: string; student?: unknown } | null;
  const student = app ? (one(app.student as never) as StudentRef | null) : null;
  const { application: _application, ...rest } = raw;
  return {
    input: {
      ...rest,
      applicationId: app?.id ?? null,
      studentId: student?.id ?? null,
      studentName: student?.full_name ?? null,
    },
    student,
  };
}

export function personalInput(raw: RawPersonalRow): PersonalRowInput {
  const { student, ...rest } = raw;
  return { ...rest, studentName: (one(student as never) as { full_name?: string } | null)?.full_name ?? null };
}

/**
 * Pending tasks that can have an occurrence on or before `rangeEnd` — no
 * lower bound, because a repeating task that began long ago still has
 * occurrences in the range.
 */
export function loadPendingTasks(supabase: SupabaseClient, rangeEnd: string): Promise<RawTaskRow[]> {
  return readAllWith0295<RawTaskRow>(
    (with0295, from, to) =>
      supabase
        .from("application_tasks")
        .select(taskSelect(with0295))
        .eq("status", "pending")
        .not("due_date", "is", null)
        .lte("due_date", rangeEnd)
        .order("id")
        .range(from, to) as unknown as PageResult<RawTaskRow>
  );
}

/** Someone's pending personal tasks that can have an occurrence on or before `rangeEnd`. */
export function loadPendingPersonalTasks(supabase: SupabaseClient, ownerId: string, rangeEnd: string): Promise<RawPersonalRow[]> {
  return readAllWith0295<RawPersonalRow>(
    (with0295, from, to) =>
      supabase
        .from("personal_tasks")
        .select(personalSelect(with0295))
        .eq("owner_id", ownerId)
        .eq("status", "pending")
        .lte("due_date", rangeEnd)
        .order("id")
        .range(from, to) as unknown as PageResult<RawPersonalRow>
  );
}

/** For ilike: % and _ are wildcards, so a search for "50%" means those characters. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type WriteResult = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

/**
 * A write that asks for its rows back, retried without 0295's columns when
 * the database does not have them yet and nothing typed would be lost.
 *
 * The rows back are the point. An UPDATE that row-level security refuses
 * raises nothing — it matches no rows and reads as a clean success — so a
 * move or an edit of a task for a student this person does not process would
 * have said "Saved." and changed nothing. Callers treat no rows as refused.
 */
export async function writeRows(
  run: (payload: Record<string, unknown>) => PromiseLike<WriteResult>,
  payload: Record<string, unknown>
): Promise<{ rows: { id: string }[]; error: string | null }> {
  let result = await run(payload);
  if (result.error && isMissingColumnError(result.error)) {
    const legacy = withoutNewColumns(payload);
    if (!legacy) return { rows: [], error: MIGRATION_0295_MISSING };
    result = await run(legacy);
  }
  if (result.error) return { rows: [], error: result.error.message };
  return { rows: result.data ?? [], error: null };
}

/** The shared columns of an editable item, from the editor's form. `notes` is the task's; a personal item calls it description. */
export function eventColumns(v: EventFormValues) {
  return {
    notes: v.notes,
    due_date: v.due_date,
    end_date: v.end_date,
    all_day: v.all_day,
    due_time: v.due_time,
    end_time: v.end_time,
    priority: v.priority,
    color: v.color,
    guest_emails: v.guest_emails,
    recurrence: v.recurrence,
    recurrence_end_date: v.recurrence_end_date,
    location: v.location,
    notify_minutes: v.notify_minutes,
  };
}

/** An insert leaves out what is empty, so each column's default applies — and 0295's absence costs nothing. */
export function withoutEmpty(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== undefined));
}
