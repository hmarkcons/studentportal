// Pure recipient-bucketing for the upcoming-deadline emails, kept out of the
// cron route so it can be exercised against a fixture without touching live
// data (same split as buildReminderRecipients in calendarReminders.ts).

export type DeadlineKind = "program" | "task" | "document";

export type DeadlineRow = {
  kind: DeadlineKind;
  title: string;
  studentName: string;
  dueDate: string; // YYYY-MM-DD
  processingOfficerId: string | null;
};

export type ProcessingStaff = { id: string; name: string; email: string | null };

export type DeadlineBucket = { name: string; items: DeadlineRow[] };

export const DEADLINE_WINDOW_DAYS = 14;

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// A deadline is the assigned processing officer's to chase. With nobody
// assigned it goes to the whole processing team, so an unassigned student's
// deadline still reaches someone rather than silently going nowhere.
export function buildDeadlineRecipients(
  deadlines: DeadlineRow[],
  processingStaff: ProcessingStaff[],
  todayStr: string,
  windowDays: number = DEADLINE_WINDOW_DAYS
): Map<string, DeadlineBucket> {
  const cutoff = addDaysStr(todayStr, windowDays);
  const staffById = new Map(processingStaff.map((s) => [s.id, s]));
  const buckets = new Map<string, DeadlineBucket & { seen: Set<string> }>();

  function add(staff: ProcessingStaff | undefined, row: DeadlineRow) {
    const addr = staff?.email?.trim().toLowerCase();
    if (!addr) return;
    let bucket = buckets.get(addr);
    if (!bucket) {
      bucket = { name: staff!.name, items: [], seen: new Set() };
      buckets.set(addr, bucket);
    }
    const key = `${row.kind}-${row.title}-${row.studentName}-${row.dueDate}`;
    if (bucket.seen.has(key)) return;
    bucket.seen.add(key);
    bucket.items.push(row);
  }

  for (const row of deadlines) {
    // Upcoming only — today through the window. Past deadlines stop nagging.
    if (!row.dueDate || row.dueDate < todayStr || row.dueDate > cutoff) continue;
    if (row.processingOfficerId) {
      add(staffById.get(row.processingOfficerId), row);
    } else {
      for (const s of processingStaff) add(s, row);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  }

  return new Map(Array.from(buckets, ([addr, b]) => [addr, { name: b.name, items: b.items }]));
}
