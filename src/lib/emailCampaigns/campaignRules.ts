// What a campaign needs before it can go, in words, and when a send is big
// enough to be confirmed by typing its size. No portal imports.

export const CONFIRM_ABOVE = 500;

export type CampaignDraft = {
  name: string | null;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  template_version_id: string | null;
};

/** What stops a campaign from being sent, each said plainly; empty when it can go. */
export function campaignProblems(c: CampaignDraft, { realSend, audienceCount }: { realSend: boolean; audienceCount: number }): string[] {
  const problems: string[] = [];
  if (!c.subject?.trim()) problems.push("Write a subject line.");
  if (!c.template_version_id) problems.push("Choose a template.");
  if (!c.from_name?.trim()) problems.push("Give the sender's name.");
  if (realSend && !c.from_email?.trim()) problems.push("Give the sender's address (on the verified sending domain).");
  if (audienceCount <= 0) problems.push("Choose who it goes to — the audience is empty.");
  return problems;
}

/** Whether a send this big needs typing its size (or SEND) to confirm, and whether what was typed does. */
export function confirmsSend(count: number, typed: string | null | undefined): boolean {
  if (count <= CONFIRM_ABOVE) return true;
  const t = String(typed ?? "").trim().replace(/,/g, "");
  return t === String(count) || t.toUpperCase() === "SEND";
}

/** A Karachi date and time from a datetime-local field ("2026-11-12T10:30"), as an instant. */
export function karachiInstant(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An instant as a datetime-local value in Karachi. */
export function karachiLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 16);
}

export type KeyedItem = { key: string; label: string };

/**
 * Settings' topic and conversion lists, one per line as "key | Label" — or a
 * bare label, whose key is made from it. The key is what is stored on an
 * address or sent by the website, so it is kept to lower-case letters, digits
 * and underscores, and renaming a label never changes it.
 */
export function parseKeyedLines(text: string, { what, max = 20 }: { what: string; max?: number }): { items: KeyedItem[] } | { error: string } {
  const items: KeyedItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.indexOf("|");
    const label = (bar >= 0 ? line.slice(bar + 1) : line).trim();
    const key = (bar >= 0 ? line.slice(0, bar) : label)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!label) return { error: `Each ${what} needs a name: “${line}”.` };
    if (label.length > 80) return { error: `Keep each ${what}'s name to 80 characters.` };
    if (!key) return { error: `“${line}” needs a key of letters or digits before the |.` };
    if (items.some((i) => i.key === key)) return { error: `Two ${what}s share the key “${key}”.` };
    items.push({ key, label });
  }
  if (items.length > max) return { error: `At most ${max} ${what}s.` };
  return { items };
}

/** The other way: the lines a Settings box shows. */
export function keyedLines(items: KeyedItem[]): string {
  return items.map((i) => `${i.key} | ${i.label}`).join("\n");
}
