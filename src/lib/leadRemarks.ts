// The remark on a lead (0306): the counsellor's own note, every version kept.
//
// Pure, so the unit tests (scripts/lead-remarks-test.mjs) read it under plain
// Node and both the list's pop-up and the lead's page use the same rules.

/** Room for a long note; the database holds the same limit. */
export const REMARK_MAX = 4000;

/** A remark as it is stored: line breaks made \n, the ends trimmed. Empty clears it. */
export function normalizeRemark(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Whether saving this would change anything: the same words again are not a new version. */
export function remarkChanged(current: string | null | undefined, next: string | null | undefined): boolean {
  return normalizeRemark(current) !== normalizeRemark(next);
}

/** Why a remark cannot be saved, or null. */
export function remarkError(raw: string | null | undefined): string | null {
  const text = normalizeRemark(raw);
  if (text.length > REMARK_MAX) {
    return `That remark is ${text.length.toLocaleString("en-US")} characters — keep it to ${REMARK_MAX.toLocaleString("en-US")}.`;
  }
  return null;
}

/** A remark read from an import's "remarks" column, by whatever the sheet calls it. */
export function remarkFromRow(row: Record<string, string>): string {
  for (const [key, value] of Object.entries(row)) {
    if (/^(remarks?|notes?|comments?)$/i.test(key.trim())) return normalizeRemark(value).slice(0, REMARK_MAX);
  }
  return "";
}

/** "2 Oct 2026, 3:15 pm" — when a version was written, in Karachi's time. */
export function remarkWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
