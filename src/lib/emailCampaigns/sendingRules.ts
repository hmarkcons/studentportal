// The rules a send keeps: how many emails a minute's run may send, how long a
// failed one waits before it is tried again, when a campaign stops itself
// because too many are bouncing or being marked as spam, and what a bounce
// means in words.
//
// No portal imports, so the unit tests load it under plain Node.

/** A date as Karachi's calendar has it, YYYY-MM-DD. */
export function karachiDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The most a warming-up sender may send today: the starting cap, grown by the
 * percentage each day since warm-up began. Null when warm-up is off.
 */
export function warmupCap(
  w: { enabled: boolean; startCap: number; growthPct: number; startedOn: string | null },
  today: string
): number | null {
  if (!w.enabled || !w.startedOn) return null;
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(w.startedOn)) / 86_400_000));
  return Math.floor(w.startCap * (1 + w.growthPct / 100) ** days);
}

/** How many emails one run (a minute, less a margin) may send. */
export function runBudget({
  perSecond,
  perHour,
  sentLastHour,
  dailyCap,
  sentToday,
  windowSeconds = 50,
}: {
  perSecond: number;
  perHour: number;
  sentLastHour: number;
  dailyCap: number | null;
  sentToday: number;
  windowSeconds?: number;
}): number {
  const bySpeed = Math.floor(perSecond * windowSeconds);
  const byHour = perHour - sentLastHour;
  const byDay = dailyCap === null ? Number.POSITIVE_INFINITY : dailyCap - sentToday;
  return Math.max(0, Math.min(bySpeed, byHour, byDay));
}

/** How long a failed send waits before it is tried again: 2, 4, 8, 16 … minutes, at most an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(1, attempts), 60) * 60_000;
}

export const MAX_ATTEMPTS = 5;
export const BOUNCE_PAUSE_RATE = 0.05;
export const COMPLAINT_PAUSE_RATE = 0.001;
/** Rates are not judged on fewer sent than this — three bounces in the first twenty is noise. */
export const PAUSE_MIN_SENT = 100;

/** Whether a sending campaign should stop itself, and why. */
export function autoPause({ sent, bounced, complained }: { sent: number; bounced: number; complained: number }): string | null {
  if (sent < PAUSE_MIN_SENT) return null;
  if (bounced / sent > BOUNCE_PAUSE_RATE) {
    return `Paused by itself: ${((bounced / sent) * 100).toFixed(1)}% of emails bounced (over 5%). Check the audience's addresses before resuming.`;
  }
  if (complained / sent > COMPLAINT_PAUSE_RATE) {
    return `Paused by itself: ${((complained / sent) * 100).toFixed(2)}% of recipients marked it as spam (over 0.1%). Check who it is going to before resuming.`;
  }
  return null;
}

/** What a bounce means, in words, from the sending service's type and sub-type. */
export function bounceReason(type: string | null | undefined, subType: string | null | undefined, diagnostic?: string | null): string {
  const t = String(type ?? "").toLowerCase();
  const s = String(subType ?? "").toLowerCase();
  const d = String(diagnostic ?? "");
  if (/mailbox\s*full|quota|over\s*quota|5\.2\.2/i.test(d) || s === "mailboxfull") return "Mailbox full";
  if (s === "noemail" || /user unknown|no such user|does not exist|5\.1\.1|recipient.*not found/i.test(d)) return "Mailbox does not exist";
  if (s === "suppressed" || s === "onaccountsuppressionlist") return "On the sending service's do-not-send list";
  if (s === "messagetoolarge" || /too large|5\.3\.4/i.test(d)) return "Email too large";
  if (s === "contentrejected" || /content|spam|blocked|5\.7\.1/i.test(d)) return "Rejected for its content";
  if (s === "attachmentrejected") return "Rejected for an attachment";
  if (/domain.*not.*found|no mx|5\.1\.2|host unknown/i.test(d)) return "The domain takes no email";
  if (t === "permanent") return "Address refuses mail";
  if (t === "transient") return "Temporary delivery problem";
  return "Not delivered";
}

/** A permanent bounce (the address is no good) rather than a passing one. */
export function isHardBounce(type: string | null | undefined): boolean {
  return String(type ?? "").toLowerCase() === "permanent";
}

/** After this many soft bounces across campaigns, an address is treated as bounced. */
export const SOFT_BOUNCE_LIMIT = 3;

/**
 * How many more of a campaign spread over `hours` may go by now: its share of
 * the time gone (counting the minute under way), less what has already gone.
 * A slow minute is made up in the next; nothing goes faster than Settings
 * allows, which the run's own budget still enforces. No spread: no limit.
 */
export function spreadAllowance({ total, done, startedAt, now, hours }: { total: number; done: number; startedAt: string | null; now: Date; hours: number | null }): number {
  if (!hours || hours <= 0 || !startedAt) return Number.POSITIVE_INFINITY;
  const elapsedMinutes = Math.max(0, (now.getTime() - Date.parse(startedAt)) / 60_000) + 1;
  const share = Math.min(1, elapsedMinutes / (hours * 60));
  return Math.max(0, Math.ceil(total * share) - done);
}
