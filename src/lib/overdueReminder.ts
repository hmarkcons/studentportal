// Whether an overdue invoice may be chased again yet.
//
// The daily cron (api/cron/overdue-invoices) walks every overdue invoice and
// asks this before sending. Pulled out of sendOverdueReminderIfDue so the rule
// can be tested without a database and without sending mail: it decides how
// often a real person is emailed about money they owe, and getting it wrong in
// the generous direction means chasing the same student several times a day.

/** Hours a student is left alone between reminders about the same invoice. */
export const REMINDER_INTERVAL_HOURS = 24;

/**
 * `lastSentAt` is invoices.last_reminder_sent_at — null until a reminder has
 * actually gone. It is written only after a successful send, so a failed
 * attempt does not spend the window and the next run tries again.
 *
 * `now` is injectable so the tests do not depend on the clock.
 */
export function shouldSendOverdueReminder(
  lastSentAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastSentAt) return true;

  const last = lastSentAt instanceof Date ? lastSentAt : new Date(lastSentAt);
  // An unparseable stamp is treated as "never sent" rather than "sent just
  // now": the cost of one extra reminder is a mild annoyance, the cost of the
  // other is an invoice that is silently never chased again.
  if (Number.isNaN(last.getTime())) return true;

  const hoursSince = (now.getTime() - last.getTime()) / 36e5;
  return hoursSince >= REMINDER_INTERVAL_HOURS;
}
