import type { ReminderEmailItem } from "@/lib/calendarReminderEmail";

export type PendingTaskRow = {
  id: string;
  description: string;
  notes: string | null;
  due_date: string;
  due_time: string | null;
  /** From migration 0295; absent before it. */
  end_time?: string | null;
  all_day: boolean;
  priority: string;
  color: string | null;
  guest_emails: string[] | null;
  application: unknown;
};

type StudentInfo = { id?: string; full_name?: string; email?: string | null; assigned_counselor_id?: string | null };

export type PendingPersonalTaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  /** From migration 0295; absent before it. */
  end_time?: string | null;
  all_day: boolean;
  priority: string;
  color: string | null;
  guest_emails: string[] | null;
  owner_id: string;
};

export type RecipientBucket = { name: string; items: ReminderEmailItem[] };

/** "18:00", or "18:00–19:30" once an item has an end time. */
export function reminderTime(allDay: boolean, dueTime: string | null | undefined, endTime?: string | null): string | null {
  if (allDay || !dueTime) return null;
  const start = dueTime.slice(0, 5);
  const end = endTime ? endTime.slice(0, 5) : null;
  return end && end > start ? `${start}–${end}` : start;
}

function one<T>(v: T | T[] | null | undefined) {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function addToBucket(
  map: Map<string, RecipientBucket & { seen: Set<string> }>,
  email: string | null | undefined,
  name: string,
  item: ReminderEmailItem
) {
  const addr = email?.trim().toLowerCase();
  if (!addr) return;
  const key = `${item.kind}-${item.title}-${item.dueDate}`;
  let bucket = map.get(addr);
  if (!bucket) {
    bucket = { name, items: [], seen: new Set() };
    map.set(addr, bucket);
  }
  if (bucket.seen.has(key)) return;
  bucket.seen.add(key);
  bucket.items.push(item);
}

export function buildReminderRecipients(
  tasks: PendingTaskRow[],
  personalTasks: PendingPersonalTaskRow[],
  staffNameById: Map<string, string>,
  staffEmailById: Map<string, string>,
  todayStr: string
): Map<string, RecipientBucket> {
  const recipients = new Map<string, RecipientBucket & { seen: Set<string> }>();

  tasks.forEach((t) => {
    const app = one(t.application as never) as { student?: unknown } | null;
    const student = app ? (one(app.student as never) as StudentInfo | null) : null;

    const item: ReminderEmailItem = {
      title: t.description,
      kind: "task",
      dueDate: t.due_date,
      isOverdue: t.due_date < todayStr,
      allDay: t.all_day,
      time: reminderTime(t.all_day, t.due_time, t.end_time),
      priority: t.priority,
      notes: t.notes,
      color: t.color,
      studentName: student?.full_name ?? null,
    };

    if (student?.assigned_counselor_id) {
      const staffEmail = staffEmailById.get(student.assigned_counselor_id);
      const staffName = staffNameById.get(student.assigned_counselor_id) ?? "there";
      addToBucket(recipients, staffEmail, staffName, item);
    }
    if (student?.email) {
      addToBucket(recipients, student.email, student.full_name ?? "there", item);
    }
    (t.guest_emails ?? []).forEach((g) => addToBucket(recipients, g, "there", item));
  });

  personalTasks.forEach((p) => {
    const item: ReminderEmailItem = {
      title: p.title,
      kind: "personal",
      dueDate: p.due_date,
      isOverdue: p.due_date < todayStr,
      allDay: p.all_day,
      time: reminderTime(p.all_day, p.due_time, p.end_time),
      priority: p.priority,
      notes: p.description,
      color: p.color,
    };

    const ownerEmail = staffEmailById.get(p.owner_id);
    const ownerName = staffNameById.get(p.owner_id) ?? "there";
    addToBucket(recipients, ownerEmail, ownerName, item);
    (p.guest_emails ?? []).forEach((g) => addToBucket(recipients, g, "there", item));
  });

  return recipients;
}
