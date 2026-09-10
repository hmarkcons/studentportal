// Marketing figures, dates and content-slot states.
//
// The numbers in this module were unvalidated everywhere: a negative budget, a
// negative spend and a negative referral incentive were all accepted, and an
// ad spend typed as "abc" reached the database as NaN, which PostgREST sends as
// null — so the figure silently vanished instead of being refused. The
// constraints in 0159 are what actually holds; these produce a sentence for
// the person who typed the number.

export const SOCIAL_POST_STATUSES = [
  "brief_sent",
  "in_design",
  "ready_for_review",
  "approved",
  "scheduled",
  "posted",
] as const;

export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export const SOCIAL_POST_STATUS_LABELS: Record<SocialPostStatus, string> = {
  brief_sent: "Brief sent",
  in_design: "In design",
  ready_for_review: "Ready for review",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
};

export function socialPostStatusLabel(value: string): string {
  return (SOCIAL_POST_STATUS_LABELS as Record<string, string>)[value] ?? value.replace(/_/g, " ");
}

export function isSocialPostStatus(value: string): value is SocialPostStatus {
  return (SOCIAL_POST_STATUSES as readonly string[]).includes(value);
}

/** A slot whose date has passed without being posted is a missed post. */
export function isMissedPost(postDate: string, status: string, today: string): boolean {
  return status !== "posted" && postDate < today;
}

export const REFERRAL_INCENTIVE_STATUSES = ["owed", "paid"] as const;

export function isReferralIncentiveStatus(value: string): boolean {
  return (REFERRAL_INCENTIVE_STATUSES as readonly string[]).includes(value);
}

/**
 * A money figure typed into a form.
 *
 * `Number("abc")` is NaN, and JSON.stringify turns NaN into null, so an
 * unparseable spend used to be written as "no figure recorded" without anybody
 * being told. Blank is allowed — it means "not known yet" — but a value that
 * cannot be read is not.
 */
export function amountError(
  raw: FormDataEntryValue | string | number | null | undefined,
  label = "amount"
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return `That ${label} is not a number.`;
  if (n < 0) return `A ${label} cannot be negative.`;
  // Far beyond any real campaign, and low enough to catch a mistyped keypad.
  if (n > 1_000_000_000) return `That ${label} looks like a typo — check the figure.`;
  return null;
}

/** Reads a money field, treating blank as "not recorded". */
export function readAmount(raw: FormDataEntryValue | null | undefined): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** End before start is not a date range. */
export function dateRangeError(
  start: string | null | undefined,
  end: string | null | undefined,
  what = "campaign"
): string | null {
  if (!start || !end) return null;
  if (end < start) return `That ${what} ends before it starts — check the dates.`;
  return null;
}

/**
 * How a figure is shown.
 *
 * Budgets and spends were printed as bare numbers — "Budget 50000 · Spend 0" —
 * which is unreadable at a glance and impossible to compare down a column.
 * Grouped, and with the currency named rather than assumed, since this module
 * has no currency column of its own.
 */
export function formatAmount(value: number | string | null | undefined, currency = "PKR"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Planned against actual: over, under, or nothing to say yet.
 *
 * A campaign three times over budget looked exactly like one comfortably
 * under, because both printed two numbers side by side with nothing comparing
 * them.
 */
export function spendState(
  planned: number | string | null | undefined,
  actual: number | string | null | undefined
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } | null {
  const p = planned === null || planned === undefined || planned === "" ? null : Number(planned);
  const a = actual === null || actual === undefined || actual === "" ? null : Number(actual);
  if (p === null || a === null || !Number.isFinite(p) || !Number.isFinite(a)) return null;
  if (p === 0) return a > 0 ? { label: "Unbudgeted spend", tone: "danger" } : null;
  const share = a / p;
  if (share > 1) return { label: `${Math.round((share - 1) * 100)}% over budget`, tone: "danger" };
  if (share >= 0.9) return { label: `${Math.round(share * 100)}% of budget used`, tone: "warning" };
  return { label: `${Math.round(share * 100)}% of budget used`, tone: "success" };
}
