// The leads spreadsheet: one set of columns for the import template, the
// export and the import, matching the leads list column for column, so a
// sheet exported from the list can be edited and imported straight back.
//
// Importing a lead already on file (the same email or phone number) adds to
// it and never overwrites it: an empty field is filled in; a different
// country, qualification, course or source is added beside the one there; a
// different remark is appended to the one there as a new version; a new
// follow-up is added; and what can hold only one value — the name, the
// status, the counsellor, the level, the inquiry date — keeps the value on
// file, the sheet's being reported rather than written.
//
// Pure, relative imports only, so scripts/lead-sheet-test.mjs reads it under
// plain Node.

import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "./constants.ts";
import { parseDay } from "./catalogueRows.ts";
import { normalizeLevel } from "./catalogueText.ts";
import { REMARK_MAX, normalizeRemark } from "./leadRemarks.ts";

export const LEAD_SHEET = "Leads";
export const LEAD_LIST_SHEET = "Lists";

export const LEAD_COLUMNS = [
  { key: "month", header: "Month", width: 11 },
  { key: "full_name", header: "Name", width: 26 },
  { key: "contact_number", header: "Contact number", width: 18 },
  { key: "email", header: "Email", width: 28 },
  { key: "country_of_interest", header: "Country", width: 22 },
  { key: "current_qualification", header: "Current qualification", width: 22 },
  { key: "level_applying_for", header: "Applying for", width: 14 },
  { key: "course_of_interest", header: "Course of interest", width: 24 },
  { key: "status", header: "Status", width: 20 },
  { key: "counselor", header: "Counselor", width: 22 },
  { key: "remarks", header: "Remarks", width: 44 },
  { key: "follow_up_date", header: "Follow-up date", width: 15 },
  { key: "follow_up_note", header: "Follow-up note", width: 30 },
  { key: "date_of_inquiry", header: "Inquiry date", width: 14 },
  { key: "platform_source", header: "Source", width: 18 },
] as const;

export type LeadColumnKey = (typeof LEAD_COLUMNS)[number]["key"];
export type LeadSheetRow = Record<LeadColumnKey, string>;

export const LEAD_LEVELS = ["bachelors", "masters", "phd"] as const;

/**
 * Who a new lead goes to when its row names no counsellor. Matched by name
 * against the active counsellors when the import runs; if nobody by this name
 * is one any more, the lead is left unassigned and the import says so.
 */
export const DEFAULT_IMPORT_COUNSELOR = "Muhammad Usman";

/** The template's example row, by a name the import skips rather than file as a lead. */
export const EXAMPLE_LEAD = "Example Student (delete this row)";

export function isExampleLead(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase().startsWith("example student");
}

/** 1-based, as a spreadsheet counts. */
export function leadColumnIndex(key: LeadColumnKey): number {
  return LEAD_COLUMNS.findIndex((c) => c.key === key) + 1;
}

/** "Oct 2026" for 2026-10-02 — the list's Month column, worked out from the inquiry date. */
export function monthLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m) return "";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
}

// ------------------------------------------------------------- headers

/** What people retype a heading as, each to the column it means. */
const ALIASES: Record<string, LeadColumnKey> = {
  month: "month",
  name: "full_name", full_name: "full_name", student: "full_name", student_name: "full_name",
  contact: "contact_number", contact_number: "contact_number", phone: "contact_number", mobile: "contact_number", phone_number: "contact_number",
  email: "email", email_address: "email",
  country: "country_of_interest", country_of_interest: "country_of_interest", countries: "country_of_interest",
  current_qualification: "current_qualification", qualification: "current_qualification",
  applying_for: "level_applying_for", level_applying_for: "level_applying_for", level: "level_applying_for",
  course_of_interest: "course_of_interest", course: "course_of_interest",
  status: "status",
  counselor: "counselor", counsellor: "counselor", assigned_counselor: "counselor", assigned_counsellor: "counselor",
  remarks: "remarks", remark: "remarks", notes: "remarks", comments: "remarks",
  follow_up_date: "follow_up_date", follow_up: "follow_up_date", followup_date: "follow_up_date",
  follow_up_note: "follow_up_note", followup_note: "follow_up_note",
  inquiry_date: "date_of_inquiry", date_of_inquiry: "date_of_inquiry", date: "date_of_inquiry",
  source: "platform_source", platform: "platform_source", platform_source: "platform_source",
};

/** A heading as the import reads it: "Contact number", "contact-number" and "contact_number" are one. */
export function leadHeaderKey(header: string): LeadColumnKey | null {
  const key = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return ALIASES[key] ?? null;
}

/** A row keyed by column, whatever its headings say; a heading nothing reads is dropped. */
export function keyedLeadRow(raw: Record<string, string>): Partial<LeadSheetRow> {
  const out: Partial<LeadSheetRow> = {};
  for (const [heading, value] of Object.entries(raw)) {
    const key = leadHeaderKey(heading);
    if (key && !out[key]) out[key] = String(value ?? "").trim();
  }
  return out;
}

// ---------------------------------------------------------------- reading

export type LeadInput = {
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: (typeof LEAD_LEVELS)[number] | null;
  course_of_interest: string | null;
  status: LeadStatus | null;
  /** The counsellor's name as the sheet gives it; matched to staff by the action. */
  counselor: string | null;
  remarks: string | null;
  follow_up_date: string | null;
  follow_up_note: string | null;
  date_of_inquiry: string | null;
  platform_source: string | null;
};

const text = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim() || null;

/** A status by its label or its key, any case: "In Discussion", "in_discussion". */
export function parseLeadStatus(value: string | undefined): LeadStatus | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  return (LEAD_STATUSES as readonly string[]).find((s) => s === v.replace(/\s+/g, "_") || LEAD_STATUS_LABELS[s as LeadStatus].toLowerCase() === v) as LeadStatus | null ?? null;
}

/**
 * One sheet row as a lead, or null for a row with no name. What a cell says
 * that cannot be used is reported, and the cell left out.
 */
export function leadFromRow(raw: Record<string, string>, problems: string[]): LeadInput | null {
  const row = keyedLeadRow(raw);
  const full_name = text(row.full_name);
  if (!full_name) return null;
  const say = (m: string) => problems.push(`${full_name}: ${m}`);

  let status = parseLeadStatus(row.status);
  if (row.status && !status) say(`status "${row.status}" is not one the leads list has — left out`);
  if (status === "registered") {
    say("Registered is set by registering the student, not by an import — left out");
    status = null;
  }

  const levelRaw = text(row.level_applying_for);
  const level = normalizeLevel(levelRaw);
  const level_applying_for = level && (LEAD_LEVELS as readonly string[]).includes(level) ? (level as (typeof LEAD_LEVELS)[number]) : null;
  if (levelRaw && !level_applying_for) say(`"Applying for" ${levelRaw} is not bachelors, masters or phd — left out`);

  const dateProblems: string[] = [];
  const date_of_inquiry = row.date_of_inquiry ? parseDay(row.date_of_inquiry, dateProblems, "Inquiry date") : null;
  const follow_up_date = row.follow_up_date ? parseDay(row.follow_up_date, dateProblems, "Follow-up date") : null;
  dateProblems.forEach(say);

  const remarks = normalizeRemark(row.remarks).slice(0, REMARK_MAX) || null;
  return {
    full_name,
    contact_number: text(row.contact_number),
    email: text(row.email)?.toLowerCase() ?? null,
    country_of_interest: text(row.country_of_interest),
    current_qualification: text(row.current_qualification),
    level_applying_for,
    course_of_interest: text(row.course_of_interest),
    status,
    counselor: text(row.counselor),
    remarks,
    follow_up_date,
    follow_up_note: text(row.follow_up_note),
    date_of_inquiry,
    platform_source: text(row.platform_source),
  };
}

/** Phone numbers compared by their digits, with or without the country code. */
export function phoneKey(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("92") && d.length === 12) return `0${d.slice(2)}`;
  return d;
}

// ---------------------------------------------------------------- merging

/** A lead as the import compares a row against it. */
export type StoredLead = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  status: string | null;
  counselorName: string | null;
  date_of_inquiry: string | null;
  platform_source: string | null;
  remark: string | null;
  /** Follow-up dates already set and not done, so the same one is not added twice. */
  followUpDates: string[];
};

export type LeadMerge = {
  /** Columns to write on the lead: only ones it had nothing in, or added to. */
  patch: Partial<Record<"contact_number" | "email" | "country_of_interest" | "current_qualification" | "level_applying_for" | "course_of_interest" | "date_of_inquiry" | "platform_source", string>>;
  /** A counsellor for a lead that has none, by name. */
  counselor: string | null;
  /** A status for a lead that has none. */
  status: LeadStatus | null;
  /** The remark to save as its next version, already joined to the one on file. */
  remark: string | null;
  followUp: { date: string; note: string | null } | null;
  /** Each change in words, for the import's report. */
  added: string[];
  /** What the sheet said that the lead kept its own value for. */
  kept: string[];
};

const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** "Italy; Germany" — the new value beside the old, unless the old already says it. */
function joined(old: string, add: string): string | null {
  const parts = old.split(/\s*[;,]\s*/).map((p) => p.toLowerCase());
  return parts.includes(add.trim().toLowerCase()) || old.toLowerCase().includes(add.trim().toLowerCase()) ? null : `${old}; ${add}`;
}

export function mergeIntoLead(stored: StoredLead, input: LeadInput): LeadMerge {
  const merge: LeadMerge = { patch: {}, counselor: null, status: null, remark: null, followUp: null, added: [], kept: [] };

  // Held only once: filled where empty, otherwise the lead keeps its own.
  const single = [
    ["contact_number", "contact number"],
    ["email", "email"],
    ["level_applying_for", "applying for"],
    ["date_of_inquiry", "inquiry date"],
  ] as const;
  for (const [field, label] of single) {
    const value = input[field];
    if (!value) continue;
    const old = stored[field];
    if (!old) {
      merge.patch[field] = value;
      merge.added.push(`${label} ${value}`);
    } else if (!(field === "contact_number" ? phoneKey(old) === phoneKey(value) : sameText(old, value))) {
      merge.kept.push(`${label} ${old} (the sheet says ${value})`);
    }
  }
  if (!sameText(stored.full_name, input.full_name)) merge.kept.push(`name ${stored.full_name} (the sheet says ${input.full_name})`);

  // Can hold more than one: added beside what is there.
  const lists = [
    ["country_of_interest", "country"],
    ["current_qualification", "qualification"],
    ["course_of_interest", "course"],
    ["platform_source", "source"],
  ] as const;
  for (const [field, label] of lists) {
    const value = input[field];
    if (!value) continue;
    const old = stored[field];
    if (!old) {
      merge.patch[field] = value;
      merge.added.push(`${label} ${value}`);
    } else {
      const both = joined(old, value);
      if (both) {
        merge.patch[field] = both;
        merge.added.push(`${label} ${value} beside ${old}`);
      }
    }
  }

  if (input.status) {
    if (!stored.status) merge.status = input.status;
    else if (stored.status !== input.status) {
      merge.kept.push(`status ${LEAD_STATUS_LABELS[stored.status as LeadStatus] ?? stored.status} (the sheet says ${LEAD_STATUS_LABELS[input.status]})`);
    }
  }
  if (input.counselor) {
    if (!stored.counselorName) merge.counselor = input.counselor;
    else if (!sameText(stored.counselorName, input.counselor)) merge.kept.push(`counselor ${stored.counselorName} (the sheet says ${input.counselor})`);
  }

  if (input.remarks) {
    const old = normalizeRemark(stored.remark);
    if (!old) merge.remark = input.remarks;
    else if (!old.toLowerCase().includes(input.remarks.toLowerCase())) merge.remark = `${old}\n${input.remarks}`.slice(0, REMARK_MAX);
    if (merge.remark) merge.added.push(old ? "remark added to the one on file" : "remark");
  }

  if (input.follow_up_date && !stored.followUpDates.includes(input.follow_up_date)) {
    merge.followUp = { date: input.follow_up_date, note: input.follow_up_note };
    merge.added.push(`follow-up on ${input.follow_up_date}`);
  }
  return merge;
}

// ---------------------------------------------------------------- writing

export type ExportLead = {
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  status: string | null;
  counselorName: string | null;
  remark: string | null;
  nextFollowUp: { date: string; note: string | null } | null;
  date_of_inquiry: string | null;
  platform_source: string | null;
};

/** A lead as one row of the sheet — the list's columns, every one in its own cell. */
export function leadSheetRow(lead: ExportLead): LeadSheetRow {
  return {
    month: monthLabel(lead.date_of_inquiry),
    full_name: lead.full_name,
    contact_number: lead.contact_number ?? "",
    email: lead.email ?? "",
    country_of_interest: lead.country_of_interest ?? "",
    current_qualification: lead.current_qualification ?? "",
    level_applying_for: lead.level_applying_for ?? "",
    course_of_interest: lead.course_of_interest ?? "",
    status: lead.status ? (LEAD_STATUS_LABELS[lead.status as LeadStatus] ?? lead.status) : "",
    counselor: lead.counselorName ?? "",
    remarks: lead.remark ?? "",
    follow_up_date: lead.nextFollowUp?.date ?? "",
    follow_up_note: lead.nextFollowUp?.note ?? "",
    date_of_inquiry: lead.date_of_inquiry?.slice(0, 10) ?? "",
    platform_source: lead.platform_source ?? "",
  };
}
