// Who a campaign goes to: segments (saved filters on the portal's fields),
// lists, exclusions, and the rules every send obeys — one email per address,
// the do-not-email list always wins, a topic the person opted out of is not
// sent, and leads marked Not interested or Not eligible are left out unless
// asked for.
//
// Evaluated here, in plain TypeScript over the contacts loaded once, so the
// rules are tested without a database and read the same everywhere: the
// segment builder's live count, a campaign's audience, and the snapshot taken
// when it is sent. No portal imports, so the unit tests load it under Node.

export const CONTACT_STATUSES = ["subscribed", "unsubscribed", "bounced", "complained", "suppressed", "invalid"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Marked as spam",
  suppressed: "Do not email (staff)",
  invalid: "Invalid address",
};

/** Lead statuses a campaign leaves out unless told otherwise: they said no, or cannot go. */
export const DEFAULT_SKIPPED_LEAD_STATUSES = ["not_interested", "not_eligible"];

/** One person an email could go to: a lead (students are leads), or an imported contact. */
export type AudienceContact = {
  /** "lead:<id>" or "contact:<id>". */
  key: string;
  kind: "lead" | "contact";
  id: string;
  /** Lower-cased and checked; null when missing or not an address. */
  email: string | null;
  fullName: string;
  country: string;
  city: string;
  intake: string;
  /** The lead's status; null for an imported contact. */
  leadStatus: string | null;
  level: string;
  source: string;
  counsellorId: string | null;
  /** When they enquired (or were imported), ISO. */
  enquiredAt: string | null;
  hasApplication: boolean;
  applicationStages: string[];
  /** The lists they are on, by id. */
  lists: string[];
};

export type FieldKey =
  | "lead_status"
  | "country"
  | "city"
  | "level"
  | "source"
  | "counsellor"
  | "intake"
  | "enquired"
  | "registered"
  | "has_application"
  | "application_stage"
  | "list"
  | "contact_type";

export type Op =
  | "is_any"
  | "is_none"
  | "contains_any"
  | "contains_none"
  | "contains"
  | "is_empty"
  | "is_not_empty"
  | "within_days"
  | "older_than_days"
  | "after"
  | "before"
  | "is_true"
  | "is_false";

export type Rule = { field: FieldKey; op: Op; value?: string | string[] | number };
export type RuleSet = { match: "all" | "any"; rules: Rule[] };

/** Where a multi-choice field's options come from, filled in on the server. */
export type OptionSource = "lead_statuses" | "countries" | "cities" | "levels" | "sources" | "counsellors" | "stages" | "lists" | "contact_types";

export const OP_LABELS: Record<Op, string> = {
  is_any: "is any of",
  is_none: "is none of",
  contains_any: "includes any of",
  contains_none: "includes none of",
  contains: "contains",
  is_empty: "is blank",
  is_not_empty: "is not blank",
  within_days: "in the last … days",
  older_than_days: "more than … days ago",
  after: "on or after",
  before: "before",
  is_true: "yes",
  is_false: "no",
};

export const FIELDS: Record<FieldKey, { label: string; ops: Op[]; options?: OptionSource }> = {
  lead_status: { label: "Lead status", ops: ["is_any", "is_none"], options: "lead_statuses" },
  country: { label: "Country of interest", ops: ["contains_any", "contains_none", "is_empty", "is_not_empty"], options: "countries" },
  city: { label: "City", ops: ["is_any", "is_none", "is_empty"], options: "cities" },
  level: { label: "Level applying for", ops: ["is_any", "is_none"], options: "levels" },
  source: { label: "Lead source", ops: ["is_any", "is_none"], options: "sources" },
  counsellor: { label: "Counsellor", ops: ["is_any", "is_none", "is_empty"], options: "counsellors" },
  intake: { label: "Intake", ops: ["contains", "is_empty", "is_not_empty"] },
  enquired: { label: "Enquired", ops: ["within_days", "older_than_days", "after", "before"] },
  registered: { label: "Registered student", ops: ["is_true", "is_false"] },
  has_application: { label: "Has an application", ops: ["is_true", "is_false"] },
  application_stage: { label: "Application stage", ops: ["is_any", "is_none"], options: "stages" },
  list: { label: "On list", ops: ["is_any", "is_none"], options: "lists" },
  contact_type: { label: "Contact type", ops: ["is_any"], options: "contact_types" },
};

const MULTI_OPS: Op[] = ["is_any", "is_none", "contains_any", "contains_none"];
const NO_VALUE_OPS: Op[] = ["is_empty", "is_not_empty", "is_true", "is_false"];

const EMAIL_RE = /^[^@\s<>()[\],;:"]+@[^@\s<>()[\],;:"]+\.[A-Za-z]{2,}$/;

/** An address as it is compared and stored: trimmed, lower-cased, checked. Null when it is not one. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().replace(/^<|>$/g, "").trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e) || e.includes("..")) return null;
  return e;
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** "germany", "Italy (Public)", "Germany, Austria" → ["germany"], ["italy"], ["germany", "austria"]. */
export function countriesOf(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,/;&]|\band\b/i)
    .map((c) => c.replace(/\((public|private)\)/gi, "").trim().toLowerCase())
    .filter(Boolean);
}

const DAY = 86_400_000;

export function matchesRule(c: AudienceContact, rule: Rule, now: Date = new Date()): boolean {
  const values = (Array.isArray(rule.value) ? rule.value : rule.value == null ? [] : [String(rule.value)]).map(norm);
  const oneOf = (v: string) => values.includes(norm(v));
  switch (rule.field) {
    case "lead_status":
      return rule.op === "is_any" ? c.leadStatus !== null && oneOf(c.leadStatus) : !(c.leadStatus !== null && oneOf(c.leadStatus));
    case "country": {
      const mine = countriesOf(c.country);
      if (rule.op === "is_empty") return mine.length === 0;
      if (rule.op === "is_not_empty") return mine.length > 0;
      // Whole names, chosen from the list: "uk" must not match "ukraine".
      const hit = values.some((v) => mine.includes(v));
      return rule.op === "contains_any" ? hit : !hit;
    }
    case "city":
      if (rule.op === "is_empty") return !norm(c.city);
      return rule.op === "is_any" ? oneOf(c.city) : !oneOf(c.city);
    case "level":
      return rule.op === "is_any" ? oneOf(c.level) : !oneOf(c.level);
    case "source":
      return rule.op === "is_any" ? oneOf(c.source) : !oneOf(c.source);
    case "counsellor":
      if (rule.op === "is_empty") return !c.counsellorId;
      return rule.op === "is_any" ? Boolean(c.counsellorId) && oneOf(c.counsellorId!) : !(c.counsellorId && oneOf(c.counsellorId));
    case "intake":
      if (rule.op === "is_empty") return !norm(c.intake);
      if (rule.op === "is_not_empty") return Boolean(norm(c.intake));
      return values.length > 0 && norm(c.intake).includes(values[0]);
    case "enquired": {
      if (!c.enquiredAt) return false;
      const at = new Date(c.enquiredAt).getTime();
      if (rule.op === "within_days") return at >= now.getTime() - Number(rule.value) * DAY;
      if (rule.op === "older_than_days") return at < now.getTime() - Number(rule.value) * DAY;
      const day = String(rule.value ?? "");
      const startOfDay = new Date(`${day}T00:00:00+05:00`).getTime(); // a date means a Karachi day
      return rule.op === "after" ? at >= startOfDay : at < startOfDay;
    }
    case "registered": {
      const yes = c.leadStatus === "registered";
      return rule.op === "is_true" ? yes : !yes;
    }
    case "has_application":
      return rule.op === "is_true" ? c.hasApplication : !c.hasApplication;
    case "application_stage": {
      const hit = c.applicationStages.some((s) => oneOf(s));
      return rule.op === "is_any" ? hit : !hit;
    }
    case "list": {
      const hit = c.lists.some((l) => values.includes(norm(l)));
      return rule.op === "is_any" ? hit : !hit;
    }
    case "contact_type":
      return oneOf(c.kind);
  }
}

/** A rule set with no rules matches everyone. */
export function matchesRuleSet(c: AudienceContact, set: RuleSet, now: Date = new Date()): boolean {
  if (!set.rules.length) return true;
  return set.match === "any" ? set.rules.some((r) => matchesRule(c, r, now)) : set.rules.every((r) => matchesRule(c, r, now));
}

/** A rule set as posted from the builder, checked field by field, or why it cannot be used. */
export function validateRuleSet(raw: unknown): RuleSet | { error: string } {
  let input: unknown = raw;
  if (typeof raw === "string") {
    try {
      input = JSON.parse(raw);
    } catch {
      return { error: "The segment's rules could not be read." };
    }
  }
  const o = input as { match?: unknown; rules?: unknown };
  if (!o || typeof o !== "object") return { error: "The segment's rules could not be read." };
  const match = o.match === "any" ? "any" : o.match === "all" ? "all" : null;
  if (!match) return { error: "Choose whether a contact must match all of the rules or any of them." };
  if (!Array.isArray(o.rules)) return { error: "The segment's rules could not be read." };
  if (o.rules.length > 30) return { error: "A segment can have at most 30 rules." };
  const rules: Rule[] = [];
  for (const [i, r] of (o.rules as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    const field = r?.field as FieldKey;
    const def = FIELDS[field];
    if (!def) return { error: `Rule ${n}: choose a field.` };
    const op = r.op as Op;
    if (!def.ops.includes(op)) return { error: `Rule ${n}: choose how ${def.label.toLowerCase()} is compared.` };
    if (NO_VALUE_OPS.includes(op)) {
      rules.push({ field, op });
    } else if (MULTI_OPS.includes(op)) {
      const list = Array.isArray(r.value) ? r.value : [];
      const values = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 200);
      if (!values.length) return { error: `Rule ${n}: choose at least one ${def.label.toLowerCase()}.` };
      if (values.some((v) => v.length > 200)) return { error: `Rule ${n}: a value is too long.` };
      rules.push({ field, op, value: values });
    } else if (op === "within_days" || op === "older_than_days") {
      const days = Number(r.value);
      if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: `Rule ${n}: give a number of days from 1 to 3650.` };
      rules.push({ field, op, value: days });
    } else if (op === "after" || op === "before") {
      const day = String(r.value ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(day).getTime())) return { error: `Rule ${n}: choose a date.` };
      rules.push({ field, op, value: day });
    } else {
      const text = String(r.value ?? "").trim();
      if (!text) return { error: `Rule ${n}: type what ${def.label.toLowerCase()} contains.` };
      if (text.length > 200) return { error: `Rule ${n}: that is too long.` };
      rules.push({ field, op, value: text });
    }
  }
  return { match, rules };
}

export type AudienceSpec = {
  /** Everyone with an email address. */
  all?: boolean;
  segments: RuleSet[];
  lists: string[];
};

export type AddressState = { status: ContactStatus; topics: string[] };

export type AudienceCounts = {
  /** Contacts the include side picked. */
  matched: number;
  /** Of those, taken out by the exclude side. */
  excluded: number;
  /** No email, or not an address. */
  invalid: number;
  /** A second record with the same address. */
  duplicates: number;
  /** Leads left out for their status (Not interested, Not eligible). */
  skippedLeadStatus: number;
  /** On the do-not-email list, by why. */
  suppressed: Partial<Record<ContactStatus, number>>;
  /** Opted out of the campaign's topic on the preference page. */
  topicOptOut: number;
  /** Who it goes to. */
  final: number;
};

function inSpec(c: AudienceContact, spec: AudienceSpec, now: Date): boolean {
  if (spec.all) return true;
  if (spec.lists.length && c.lists.some((l) => spec.lists.includes(l))) return true;
  return spec.segments.some((s) => matchesRuleSet(c, s, now));
}

/**
 * The people a send reaches, and how many fell out at each step: included by
 * any segment or list (or everyone), less the excluded ones, less those with
 * no usable address; one per address (a lead wins over an imported contact);
 * less leads of a skipped status, the do-not-email list, and anyone who opted
 * out of the topic.
 */
export function resolveAudience(input: {
  contacts: AudienceContact[];
  include: AudienceSpec;
  exclude?: AudienceSpec;
  statuses: Map<string, AddressState>;
  topic?: string | null;
  skipLeadStatuses?: string[];
  now?: Date;
}): { recipients: AudienceContact[]; counts: AudienceCounts } {
  const now = input.now ?? new Date();
  const skip = input.skipLeadStatuses ?? DEFAULT_SKIPPED_LEAD_STATUSES;
  const counts: AudienceCounts = { matched: 0, excluded: 0, invalid: 0, duplicates: 0, skippedLeadStatus: 0, suppressed: {}, topicOptOut: 0, final: 0 };

  const included = input.contacts.filter((c) => inSpec(c, input.include, now));
  counts.matched = included.length;
  const exclude = input.exclude;
  const kept = exclude && (exclude.all || exclude.lists.length || exclude.segments.length) ? included.filter((c) => !inSpec(c, exclude, now)) : included;
  counts.excluded = included.length - kept.length;

  // A lead before an imported contact, so the lead's own record fills the email in.
  const ordered = [...kept].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "lead" ? -1 : 1));
  const seen = new Set<string>();
  const recipients: AudienceContact[] = [];
  for (const c of ordered) {
    if (!c.email) {
      counts.invalid += 1;
      continue;
    }
    if (seen.has(c.email)) {
      counts.duplicates += 1;
      continue;
    }
    seen.add(c.email);
    if (c.kind === "lead" && c.leadStatus && skip.includes(c.leadStatus)) {
      counts.skippedLeadStatus += 1;
      continue;
    }
    const state = input.statuses.get(c.email);
    if (state && state.status !== "subscribed") {
      counts.suppressed[state.status] = (counts.suppressed[state.status] ?? 0) + 1;
      continue;
    }
    if (input.topic && state && state.topics.length && !state.topics.includes(input.topic)) {
      counts.topicOptOut += 1;
      continue;
    }
    recipients.push(c);
  }
  counts.final = recipients.length;
  return { recipients, counts };
}

/** How many were left out as do-not-email, all reasons together. */
export function suppressedTotal(counts: AudienceCounts): number {
  return Object.values(counts.suppressed).reduce((a, b) => a + (b ?? 0), 0);
}

/** Title-cased for a choice list: "karachi" → "Karachi". */
export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
