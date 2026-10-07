// How the audit log (0322) reads to a person: what kind of record a table
// holds, what a column is called, what a row is called, how a stored value
// looks, and — for one event — each field before, after and as it is now.
//
// Pure, so the unit tests import it directly (scripts/audit-labels-test.mjs).

import { formatStamp } from "./activityStamp.ts";

export type AuditAction = "INSERT" | "UPDATE" | "DELETE" | "RESTORE";

/** The tabs, and the subject_type each lists. */
export const AUDIT_TABS = [
  { key: "students", label: "Registered students", kind: "student" },
  { key: "leads", label: "Leads", kind: "lead" },
  { key: "staff", label: "Staff", kind: "staff" },
  { key: "universities", label: "Universities", kind: "university" },
  { key: "other", label: "Settings & everything else", kind: "other" },
  { key: "all", label: "All activity", kind: null },
] as const;

export type AuditTabKey = (typeof AUDIT_TABS)[number]["key"];

export function auditTab(value: string | undefined | null): (typeof AUDIT_TABS)[number] {
  return AUDIT_TABS.find((t) => t.key === value) ?? AUDIT_TABS[0];
}

/** One record of each table, in words. A table not named here is spelled from its name. */
const TABLE_LABELS: Record<string, string> = {
  ad_campaigns: "Ad campaign",
  additional_service_requests: "Additional service request",
  agreement_settings: "Agreement company details",
  agreement_submission_archive: "Earlier signed agreement copy",
  agreement_templates: "Agreement template",
  agreements: "Agreement",
  application_country_extra: "Application country field",
  application_interviews: "Interview",
  application_remark_current: "Application remark (latest)",
  application_remarks: "Application remark",
  application_stage_history: "Application stage history",
  application_tasks: "Application task",
  applications: "Application",
  attendance_policy: "Attendance policy",
  attendance_records: "Attendance record",
  campaigns: "Campaign",
  destination_document_exclusions: "Country document exclusion",
  destination_document_sections: "Country document section",
  destinations: "Destination country",
  document_guide_country_notes: "Document guide country note",
  document_sections: "Document section",
  document_templates: "Document checklist item",
  fee_products: "Fee product",
  field_groups: "Field group",
  guide_videos: "Guide video",
  inventory_items: "Inventory item",
  inventory_requests: "Inventory request",
  invoice_admin_charges: "Invoice admin charge",
  invoice_installments: "Installment",
  invoice_line_items: "Invoice line item",
  invoice_settings: "Invoice settings",
  invoices: "Invoice",
  lead_call_logs: "Call log",
  lead_destinations: "Student destination",
  lead_remark_current: "Lead remark (latest)",
  lead_remarks: "Lead remark",
  leads: "Student",
  leave_requests: "Leave request",
  list_column_orders: "List column order",
  login_figures: "Login page figure",
  login_screen: "Login page",
  message_templates: "Message template",
  messages: "Message",
  office_holidays: "Office holiday",
  office_networks: "Office network",
  partner_agreements: "Partner agreement",
  partner_commissions: "University commission",
  partner_document_exchange: "Partner document",
  partner_university_accounts: "Partner account",
  payment_receipts: "Payment receipt",
  permission_definitions: "Permission",
  personal_tasks: "Task",
  pkr_rates: "PKR rate",
  profile_document_guides: "Profile document guide",
  program_commission_rates: "Programme commission rate",
  program_intake_rounds: "Intake round",
  programs: "Programme",
  receipts: "Receipt",
  reengagement_messages: "Re-engagement message",
  referral_parties: "Referral party",
  referrals: "Referral",
  refund_requests: "Refund request",
  reminders: "Reminder",
  role_permission_overrides: "Role permission",
  scholarship_bodies: "Scholarship body",
  scholarship_body_destinations: "Scholarship body country",
  scholarship_proofs: "Scholarship proof",
  social_calendar_posts: "Social calendar post",
  staff: "Staff member",
  staff_agreement_templates: "Staff agreement template",
  staff_agreements: "Staff agreement",
  staff_commission_credits: "Staff commission credit",
  staff_commissions: "Staff commission",
  staff_compensation: "Pay",
  staff_offsite_access: "Off-site access",
  staff_payroll: "Payroll",
  staff_permission_overrides: "Staff permission",
  staff_reassignment_log: "Reassignment",
  student_academic_records: "Academic record",
  student_assignment_notices: "Assignment notice",
  student_cycles: "Intake cycle",
  student_document_archive: "Earlier document copy",
  student_documents: "Document",
  student_profiles: "Student profile",
  student_qualifications: "Qualification",
  student_scholarships: "Scholarship",
  student_test_scores: "Test score",
  student_travel_checks: "Travel checklist tick",
  support_faqs: "Support FAQ",
  support_ticket_replies: "Support reply",
  support_tickets: "Support ticket",
  tracker_country_order: "Tracker country order",
  tracker_definitions: "Tracker field",
  travel_guide_items: "Travel guide item",
  travel_guide_sections: "Travel guide section",
  universities: "University",
  visa_destination_messages: "Country visa message",
  visa_messages: "Visa message",
  visa_offices: "Visa office",
  visa_page_sections: "Visa page section",
};

export function tableLabel(table: string): string {
  return TABLE_LABELS[table] ?? sentenceCase(table.replace(/_/g, " "));
}

/** Words written in capitals wherever they appear in a column name. */
const ACRONYMS = new Set(["cnic", "url", "pdf", "pkr", "eur", "iban", "swift", "isee", "ispe", "ip", "id", "dsu", "faq", "qr", "sms"]);

/** Columns with a name of their own. */
const FIELD_LABELS: Record<string, string> = {
  full_name: "Name",
  contact_number: "Phone",
  assigned_counselor_id: "Counsellor",
  current_stage: "Stage",
  student_code: "Student ID",
  auth_user_id: "Portal sign-in",
  is_finalized: "University finalized",
  preenrollment_finalized: "Pre-enrolment finalized",
  file_path: "File",
  signed_file_path: "Signed copy",
  pdf_path: "PDF",
  photo_path: "Photo",
  payment_proof_path: "Payment proof",
  sort_order: "Position",
  roles: "Roles",
  role: "Primary role",
  body: "Text",
  is_backup: "Backup country",
  created_at: "Created",
  updated_at: "Last changed",
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  let k = key;
  let suffix = "";
  if (k.endsWith("_by")) {
    // "verified_by" → "Verified by"
  } else if (k.endsWith("_at")) {
    k = k.slice(0, -3);
  } else if (k.endsWith("_id") && k.length > 3) {
    k = k.slice(0, -3);
  } else if (k.endsWith("_path")) {
    k = k.slice(0, -5);
    suffix = " (file)";
  }
  if (k.startsWith("is_")) k = k.slice(3);
  const words = k.split("_").filter(Boolean).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  return sentenceCase(words.join(" ")) + suffix;
}

function sentenceCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Columns that only ever move with something else, left out of a comparison. */
const NOISE = new Set(["updated_at"]);

/** The fields shown for a whole record, in its own order, without the noise. */
export function recordFields(row: Record<string, unknown> | null | undefined): string[] {
  return row ? Object.keys(row).filter((k) => !NOISE.has(k)) : [];
}

/** The columns that name a record, best first. */
const NAME_COLUMNS = [
  "full_name", "name", "title", "subject", "custom_name", "invoice_number", "label", "display_name", "country",
  "staff_name", "referrer_name", "question", "theme", "category", "field_key", "section_key", "key", "test_type",
  "qualification_name", "institution", "institution_name", "kind", "stage", "type", "service_type", "platform",
  "list_key", "permission_key", "work_date", "holiday_date", "payroll_month", "post_date", "description", "body", "remark",
];

function plain(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = (typeof value === "string" ? value : typeof value === "number" ? String(value) : "").replace(/\s+/g, " ").trim();
  return s || null;
}

/** What a row is called: its name, title or subject — or, for a row with none, what it is. */
export function recordLabel(table: string, row: Record<string, unknown> | null | undefined): string {
  if (!row) return tableLabel(table);
  if (table === "invoice_installments" && row.installment_no != null) return `Installment ${row.installment_no}`;
  if (table === "agreements" && row.version != null) return `Agreement v${row.version}`;
  for (const col of NAME_COLUMNS) {
    const v = plain(row[col]);
    if (v) return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  }
  return tableLabel(table);
}

export const ACTION_WORDS: Record<AuditAction, string> = {
  INSERT: "Added",
  UPDATE: "Edited",
  DELETE: "Deleted",
  RESTORE: "Restored",
};

export function actionWord(action: string, sourceEvent?: string | null): string {
  if (sourceEvent && action === "UPDATE") return "Reverted";
  if (sourceEvent && action === "DELETE") return "Taken back";
  return ACTION_WORDS[action as AuditAction] ?? action;
}

export function actionTone(action: string): "success" | "info" | "danger" | "warning" | "neutral" {
  if (action === "INSERT") return "success";
  if (action === "UPDATE") return "info";
  if (action === "DELETE") return "danger";
  if (action === "RESTORE") return "warning";
  return "neutral";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * A stored value as text. `names` turns an id into whose or what it is; a
 * timestamp is shown in Karachi, as everything else in the portal is.
 */
export function formatValue(value: unknown, names?: Map<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const named = names?.get(value);
    if (named) return named;
    if (ISO_DATE.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }
    if (ISO_STAMP.test(value)) return formatStamp(value) || value;
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((v) => typeof v !== "object" || v === null)) return value.map((v) => formatValue(v, names)).join(", ");
  }
  return JSON.stringify(value, null, 2);
}

/** Two stored values are the same value — JSON compared by content, not by key order. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => sameValue(v, bb[i]));
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  return ak.length === bk.length && ak.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** The fields an edit changed: as the log recorded them, or — for an edit logged before it did — worked out. */
export function changedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  recorded?: string[] | null
): string[] {
  if (recorded && recorded.length) return recorded.filter((k) => !NOISE.has(k));
  if (!before || !after) return [];
  return Object.keys(after).filter((k) => !NOISE.has(k) && !sameValue(before[k], after[k]));
}

export type FieldRow = {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  /** As it is now; undefined when the record is not in the portal now. */
  now: unknown;
  /** This event changed it. */
  changed: boolean;
  /** Changed again since this event — reverting would undo that later change too. */
  changedSince: boolean;
};

/**
 * One event's fields, side by side. For an edit, the fields it changed (or
 * every field, with `all`); for an addition, deletion or restore, the whole
 * record. `now` is the record as it is in the portal now, or null if it is not.
 */
export function eventFields(input: {
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  now: Record<string, unknown> | null;
  changed?: string[] | null;
  all?: boolean;
}): FieldRow[] {
  const { action, before, after, now } = input;
  const touched = action === "UPDATE" ? changedFields(before, after, input.changed) : [];
  const snapshot = after ?? before;
  const keys =
    action === "UPDATE" && !input.all
      ? touched
      : // A column added since the event is shown too, as it is now.
        recordFields(snapshot).concat(recordFields(now).filter((k) => !(snapshot && k in snapshot)));
  // What the event left the field as: the after of an edit or an addition; for a deletion, what it was.
  const left = action === "DELETE" ? before : after;
  return keys.map((key) => {
    const b = before?.[key];
    const a = after?.[key];
    const n = now ? now[key] : undefined;
    return {
      key,
      label: fieldLabel(key),
      before: b,
      after: a,
      now: n,
      changed: action === "UPDATE" ? touched.includes(key) : false,
      changedSince: now !== null && left !== null && key in left && !NOISE.has(key) && !sameValue(n, left[key]),
    };
  });
}

/** Which buttons an event offers, given whether its record is in the portal now. */
export function eventActions(action: string, exists: boolean, keyed: boolean): { revert: boolean; restore: boolean; remove: boolean } {
  return {
    revert: keyed && action === "UPDATE" && exists,
    restore: keyed && action === "DELETE" && !exists,
    remove: keyed && (action === "INSERT" || action === "RESTORE") && exists,
  };
}

/** The values in a set of rows that look like ids, for naming them. */
export function idsIn(rows: (Record<string, unknown> | null | undefined)[]): string[] {
  const out = new Set<string>();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of rows) {
    if (!row) continue;
    for (const [k, v] of Object.entries(row)) {
      if (k === "id") continue;
      if (typeof v === "string" && UUID.test(v)) out.add(v);
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && UUID.test(x)) out.add(x);
    }
  }
  return [...out];
}

/** The tables that are someone's own record: the line a change is shown by when it took others with it. */
const OWN_TABLES = new Set(["leads", "staff", "universities"]);

/**
 * One line per change, not per row: everything one action did — a student
 * deleted with their 26 documents, an application and an intake cycle; a
 * restore bringing them back — happened in one transaction, and reads as one
 * line led by the person's own record, the rest listed beneath it.
 */
export function groupByChange<T extends { action_type: string; entity_type: string; txid: number | string | null }>(
  rows: T[]
): { main: T; rest: T[] }[] {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    const head = last?.[0];
    if (head && row.txid !== null && head.txid === row.txid && head.action_type === row.action_type) last.push(row);
    else groups.push([row]);
  }
  return groups.map((g) => {
    const main = g.find((r) => OWN_TABLES.has(r.entity_type)) ?? g[0];
    return { main, rest: g.filter((r) => r !== main) };
  });
}

/** "Document × 26, Intake cycle, Application": what else a change took with it, most first. */
export function countsByKind(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => (n === 1 ? label : `${label} × ${n}`))
    .join(", ");
}
