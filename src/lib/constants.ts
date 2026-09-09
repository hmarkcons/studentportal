export const LEAD_STATUSES = [
  "potential",
  "meeting_done",
  "repeated_reschedules",
  "in_discussion",
  "not_answering",
  "powered_off",
  "call_later",
  "busy",
  "next_intake",
  "not_interested",
  "not_eligible",
  "registered",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  potential: "Potential",
  meeting_done: "Meeting Done",
  repeated_reschedules: "Repeated Reschedules",
  in_discussion: "In Discussion",
  not_answering: "Not Answering",
  powered_off: "Powered Off",
  call_later: "Call Later",
  busy: "Busy",
  next_intake: "Next Intake",
  not_interested: "Not Interested",
  not_eligible: "Not Eligible",
  registered: "Registered",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  potential: "info",
  meeting_done: "info",
  repeated_reschedules: "warning",
  in_discussion: "info",
  not_answering: "warning",
  powered_off: "warning",
  call_later: "warning",
  busy: "warning",
  next_intake: "neutral",
  not_interested: "danger",
  not_eligible: "danger",
  registered: "success",
};

export const STUDY_LEVELS = ["bachelors", "masters", "phd"] as const;

export const QUALIFICATION_LEVELS = [
  "Secondary School",
  "High School",
  "Associate Degree (2 Years)",
  "Bachelors (top-up 2 Years)",
  "Bachelors (3 Years)",
  "Bachelors (4 years)",
  "Masters (16 Years Education)",
  "Masters (18 years)",
] as const;

export const STAFF_ROLES = [
  "super_admin",
  "management",
  "counselor",
  "processing",
  "finance",
  "marketing",
  "digital_marketing",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  management: "Management",
  counselor: "Counselor / Advisor",
  processing: "Processing Team",
  finance: "Finance / Accounts",
  marketing: "Marketing / Lead Generation",
  digital_marketing: "Digital Marketing",
};

export const COMMISSION_TYPES = ["percentage", "flat"] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];
export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  percentage: "Percentage",
  flat: "Flat Rate",
};

// Monthly bonus increment options — a bonus-eligible staff member's whole
// month's earned commission is multiplied by (1 + this/100) once they reach
// their monthly_target (applied on the Payroll page, not stored computed).
export const BONUS_RATE_OPTIONS = [25, 50, 75, 100] as const;

export const DOCUMENT_STATUSES = ["missing", "submitted", "under_review", "verified", "rejected"] as const;

export const DOCUMENT_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  missing: "neutral",
  submitted: "warning",
  under_review: "info",
  verified: "success",
  rejected: "danger",
};

// "verified" is the stored value; staff and students read it as Approved,
// which is the word used on the Accept button that sets it.
export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  missing: "Missing",
  submitted: "Submitted",
  under_review: "Under review",
  verified: "Approved",
  rejected: "Rejected",
};

export const MANUAL_APPLICATION_STATUSES = ["rejected", "declined", "withdrawn"] as const;

export const STAFF_DESIGNATIONS = [
  "Counselor",
  "Senior Counselor",
  "Team Lead",
  "Branch Manager",
  "Processing Officer",
  "Documentation Officer",
  "Finance Officer",
  "Marketing Executive",
  "Digital Marketing Executive",
  "HR Officer",
  "Management",
  "Super Admin",
] as const;

export const GENDERS = ["Male", "Female", "Other"] as const;

export const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"] as const;

export const STAFF_CURRENCIES = ["PKR", "USD", "EUR"] as const;

export const CURRENCY_SYMBOLS: Record<string, string> = { PKR: "₨", USD: "$", EUR: "€" };

// Rough conversion used only for summarizing mixed-currency commission
// figures into one PKR total on the payroll/commission dashboards — not a
// live FX rate, just a fixed approximation.
export const PKR_RATE: Record<string, number> = { PKR: 1, USD: 280, EUR: 335 };

export function toPKR(amount: number, currency: string) {
  return amount * (PKR_RATE[currency] ?? 1);
}

// HMARK's WhatsApp line, in one place because it appears on the login page and
// in the portal's Support section. Both previously pointed at wa.me/923000000000
// — a placeholder that reached nobody, on the two screens a stuck student is
// most likely to try.
//
// WHATSAPP_LINK carries the digits wa.me needs (no +, spaces or leading zero);
// WHATSAPP_DISPLAY is what a human should read.
export const WHATSAPP_NUMBER = "923343297870";
export const WHATSAPP_DISPLAY = "+92 334 3297870";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

// Mirrors the partner_commissions.status check constraint. This list was
// written out separately in five places — the status picker, the edit form,
// the server action's validation, the finance page's colour map and the
// revenue report — which is how the revenue report came to treat the status
// as a received/not-received binary and fold partially_received, overdue and
// disputed into one number.
export const PARTNER_COMMISSION_STATUSES = [
  "not_yet_due",
  "pending",
  "received",
  "partially_received",
  "overdue",
  "disputed",
] as const;

export type PartnerCommissionStatus = (typeof PARTNER_COMMISSION_STATUSES)[number];

export const PARTNER_COMMISSION_STATUS_LABELS: Record<PartnerCommissionStatus, string> = {
  not_yet_due: "Not yet due",
  pending: "Pending",
  received: "Received",
  partially_received: "Partially received",
  overdue: "Overdue",
  disputed: "Disputed",
};
