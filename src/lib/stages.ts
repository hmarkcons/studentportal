export const STAGES = [
  "inquiry",
  "profile_eval",
  "shortlisting",
  "application",
  "offer",
  "visa",
  "accommodation",
  "enrollment",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  inquiry: "Inquiry",
  profile_eval: "Profile Eval",
  shortlisting: "Shortlisting",
  application: "Application",
  offer: "Offer",
  visa: "Visa",
  accommodation: "Accommodation",
  enrollment: "Enrollment",
};

export const DESTINATION_COUNTRIES = [
  "UK",
  "Australia",
  "Italy",
  "Germany",
  "France",
  "Austria",
  "Finland",
] as const;
