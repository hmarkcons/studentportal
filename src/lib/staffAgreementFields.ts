// What a staff agreement template can say about the staff member it is
// generated for: the {{placeholders}}, their values, and the check that
// refuses to generate a contract with a hole in it.
//
// The student agreement has its own list (templateWording.MERGE_FIELDS); this
// is the staff one. Pure, so it is unit-tested (scripts/staff-agreement-fields-test.mjs),
// and free of `@/` imports for the same reason.

export type StaffForAgreement = {
  full_name: string;
  designation: string | null;
  cnic: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  mobile_official: string | null;
  mobile_personal: string | null;
  email_official: string | null;
  email_personal: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_number: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[] | null;
  monthly_target: number | null;
  /** Display labels, already translated from role keys. */
  roles: string[];
};

export type PayForAgreement = {
  monthly_salary: number | null;
  currency: string | null;
  allowance: number | null;
  commission_rate_general: number | null;
  commission_type_general: string | null;
  commission_rate_public_universities: number | null;
  commission_type_public_universities: string | null;
  bonus_eligible: boolean | null;
  bonus_rate_percent: number | null;
};

/**
 * The office's attendance policy — the hours a staff member is held to when
 * their own record sets none, and the grace period on arrival. The same
 * fallback payroll applies (attendancePayroll.effectiveSchedule), so what a
 * contract says about hours and lateness is what payroll then deducts by.
 */
export type OfficePolicy = {
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[] | null;
  grace_minutes: number | null;
};

import { COMPANY_MERGE_FIELDS } from "./agreementCompany.ts";

export const STAFF_MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "staff_name", label: "Staff member's full name" },
  { key: "designation", label: "Their designation (job title)" },
  { key: "roles", label: "Their portal roles, e.g. \"Counselor, Processing\"" },
  { key: "cnic", label: "CNIC number" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "marital_status", label: "Marital status" },
  { key: "address", label: "Home address" },
  { key: "mobile", label: "Official mobile number (personal if there is no official one)" },
  { key: "email", label: "Official email address" },
  { key: "emergency_contact", label: "Emergency contact — name, relation and number" },
  { key: "working_hours", label: "Working hours, e.g. \"12:00 PM – 9:00 PM\" (theirs, else the office's)" },
  { key: "entry_time", label: "Entry time, e.g. \"12:00 PM\" (theirs, else the office's)" },
  { key: "exit_time", label: "Exit time, e.g. \"9:00 PM\" (theirs, else the office's)" },
  { key: "working_days", label: "Working days, e.g. \"Monday – Saturday\" (theirs, else the office's)" },
  { key: "grace_minutes", label: "Minutes of grace after the entry time before arriving counts as late (the office attendance policy)" },
  { key: "monthly_salary", label: "Monthly salary with currency, e.g. \"PKR 120,000.00\"" },
  { key: "allowance", label: "Monthly allowance with currency" },
  { key: "total_monthly_pay", label: "Salary plus allowance, with currency" },
  { key: "currency", label: "Pay currency code, e.g. \"PKR\"" },
  { key: "commission_general", label: "Commission on general registrations, e.g. \"5%\" or \"PKR 5,000.00 per registration\"" },
  { key: "commission_public", label: "Commission on public-university registrations" },
  { key: "bonus", label: "Bonus terms, e.g. \"10% of salary\" or \"Not eligible\"" },
  { key: "monthly_target", label: "Monthly registrations target" },
  { key: "agreement_date", label: "The date the agreement was generated" },
  { key: "signatory_name", label: "The template's authorised HMARK signatory" },
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * "Monday – Friday" for a run of consecutive days, a list otherwise.
 * Monday-first, the way a working week is read, so Sunday comes last.
 */
export function describeWorkDays(days: readonly number[] | null | undefined): string {
  if (!days || days.length === 0) return "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  const positions = sorted.map((d) => order.indexOf(d));
  const consecutive = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (sorted.length >= 3 && consecutive) return `${DAY_NAMES[sorted[0]]} – ${DAY_NAMES[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

/** "21:00:00" → "9:00 PM", the way a contract states a time. */
export function clockTime(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${suffix}`;
}

function commission(rate: number | null, type: string | null, currency: string): string {
  if (rate === null || rate === undefined) return "";
  return type === "flat" ? `${money(currency, rate)} per registration` : `${rate}%`;
}

function formatDay(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Every placeholder's value for one staff member. A value it has nothing for is "". */
export function staffMergeVars(
  staff: StaffForAgreement,
  pay: PayForAgreement | null,
  extra: { agreementDate: string; signatoryName: string; policy?: OfficePolicy | null }
): Record<string, string> {
  const policy = extra.policy ?? null;
  const start = staff.work_start_time ?? policy?.work_start_time ?? null;
  const end = staff.work_end_time ?? policy?.work_end_time ?? null;
  const days = staff.work_days?.length ? staff.work_days : policy?.work_days ?? null;
  const currency = pay?.currency || "PKR";
  const salary = pay?.monthly_salary ?? null;
  const allowance = pay?.allowance ?? null;
  const emergency = [
    staff.emergency_contact_name,
    staff.emergency_contact_relation ? `(${staff.emergency_contact_relation})` : null,
    staff.emergency_contact_number,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    staff_name: staff.full_name ?? "",
    designation: staff.designation ?? "",
    roles: staff.roles.join(", "),
    cnic: staff.cnic ?? "",
    date_of_birth: formatDay(staff.date_of_birth),
    gender: staff.gender ?? "",
    marital_status: staff.marital_status ?? "",
    address: staff.address ?? "",
    mobile: staff.mobile_official || staff.mobile_personal || "",
    email: staff.email_official ?? "",
    emergency_contact: staff.emergency_contact_name ? emergency : "",
    working_hours: start && end ? `${clockTime(start)} – ${clockTime(end)}` : "",
    entry_time: clockTime(start),
    exit_time: clockTime(end),
    working_days: describeWorkDays(days),
    grace_minutes: policy?.grace_minutes !== null && policy?.grace_minutes !== undefined ? String(policy.grace_minutes) : "",
    monthly_salary: salary !== null ? money(currency, salary) : "",
    allowance: allowance !== null ? money(currency, allowance) : "",
    total_monthly_pay: salary !== null ? money(currency, salary + (allowance ?? 0)) : "",
    currency: pay?.currency ?? "",
    commission_general: commission(pay?.commission_rate_general ?? null, pay?.commission_type_general ?? null, currency),
    commission_public: commission(
      pay?.commission_rate_public_universities ?? null,
      pay?.commission_type_public_universities ?? null,
      currency
    ),
    bonus: !pay ? "" : pay.bonus_eligible ? (pay.bonus_rate_percent !== null ? `${pay.bonus_rate_percent}% of salary` : "Eligible") : "Not eligible",
    monthly_target: staff.monthly_target !== null && staff.monthly_target !== undefined ? String(staff.monthly_target) : "",
    agreement_date: extra.agreementDate,
    signatory_name: extra.signatoryName,
  };
}

/**
 * The placeholders the wording uses that this staff member has nothing for,
 * as their labels.
 *
 * Generating a contract that reads "a monthly salary of ." is worse than not
 * generating one: it looks finished and gets signed. So the generator refuses
 * and names what to fill in on their record first. Only placeholders the
 * wording actually uses count — a template that never mentions commission
 * does not need one on file.
 */
export function missingMergeFields(wording: string, vars: Record<string, string>): string[] {
  const used = new Set([...wording.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  return STAFF_MERGE_FIELDS.filter((f) => used.has(f.key) && !(vars[f.key] ?? "").trim()).map((f) => f.label);
}

/**
 * Everything a staff template may use: the staff member's fields, and the
 * company's (Setup → Agreement templates → Company details). The company's
 * are kept out of missingMergeFields, whose message sends people to the staff
 * record; a blank one is caught by missingCompanyFields instead.
 */
export const STAFF_TEMPLATE_FIELDS: { key: string; label: string }[] = [...STAFF_MERGE_FIELDS, ...COMPANY_MERGE_FIELDS];

/** Placeholders the wording uses that are not staff fields at all — a typo, or one copied from a student template. */
export function unknownMergeFields(wording: string): string[] {
  const known = new Set(STAFF_TEMPLATE_FIELDS.map((f) => f.key));
  return [...new Set([...wording.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].filter((k) => !known.has(k));
}
