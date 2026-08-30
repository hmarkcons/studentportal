export const LEAD_STATUSES = [
  "potential",
  "meeting_done",
  "repeated_reschedules",
  "in_discussion",
  "not_answering",
  "powered_off",
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

export const DOCUMENT_STATUSES = ["missing", "submitted", "under_review", "verified", "rejected"] as const;

export const DOCUMENT_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  missing: "neutral",
  submitted: "warning",
  under_review: "info",
  verified: "success",
  rejected: "danger",
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
