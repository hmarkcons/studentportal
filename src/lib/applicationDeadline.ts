// Which date is an application's deadline.
//
// This is the whole of why the deadline notifications and the deadline entries
// on the processing officer's calendar never appeared. Both read
// programs.application_deadline — the shared catalogue date for a programme —
// while the date staff actually type sits on the application itself, in
// applications.deadline, under "Deadline" on the Application Details form.
//
// Production bore that out exactly: 10 applications carried a deadline somebody
// had entered, every one of their programmes had a null catalogue date, and only
// 2 of 1,957 programmes had one at all. A dry run of the reminder cron reported
// "deadlinesChecked: 7, recipients: []" — it was looking in a column nobody
// fills in.
//
// So: the application's own date is the deadline, and the catalogue date is the
// fallback for an application nobody has dated yet. That keeps the imported
// programme dates useful without letting them override what staff typed for
// this student.

export function applicationDeadline(
  applicationDeadline: string | null | undefined,
  programDeadline: string | null | undefined
): string | null {
  const own = (applicationDeadline ?? "").trim();
  if (own) return own.slice(0, 10);
  const catalogue = (programDeadline ?? "").trim();
  return catalogue ? catalogue.slice(0, 10) : null;
}

/** Where the date came from, so a reader knows whether it is theirs or the catalogue's. */
export function deadlineSource(
  applicationDeadline: string | null | undefined,
  programDeadline: string | null | undefined
): "application" | "programme" | null {
  if ((applicationDeadline ?? "").trim()) return "application";
  if ((programDeadline ?? "").trim()) return "programme";
  return null;
}

/** Days until a deadline, negative once it has passed. */
export function daysUntil(deadline: string, todayStr: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(deadline) - toUtc(todayStr)) / 86_400_000);
}

/**
 * How a deadline reads on a dashboard: "today", "tomorrow", "in 5 days".
 *
 * Days rather than a date, because the question a processing officer is asking
 * is how long they have, not what the calendar says.
 */
export function deadlineUrgency(deadline: string, todayStr: string): string {
  const days = daysUntil(deadline, todayStr);
  if (days < 0) return days === -1 ? "1 day overdue" : `${Math.abs(days)} days overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/** Within the window, and not already gone. */
export function isUpcoming(deadline: string, todayStr: string, windowDays: number): boolean {
  const days = daysUntil(deadline, todayStr);
  return days >= 0 && days <= windowDays;
}
