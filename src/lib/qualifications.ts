// Education/qualification history (student profile "Education" tab).
// Secondary School and High School are the two standard entries every
// registered student is expected to have; the rest are added on top via
// the "Add qualification" picker, one type per student at most.

export const STANDARD_QUALIFICATION_TYPES = ["secondary_school", "high_school"] as const;

export const ADDITIONAL_QUALIFICATION_TYPES = [
  "associate_degree_2yr",
  "bachelors_topup_2yr",
  "bachelors_3yr",
  "bachelors_4yr",
  "masters_16yr",
  "masters_3_5yr",
  "masters_1yr",
  "masters_18yr",
] as const;

export const QUALIFICATION_TYPES = [...STANDARD_QUALIFICATION_TYPES, ...ADDITIONAL_QUALIFICATION_TYPES] as const;
export type QualificationType = (typeof QUALIFICATION_TYPES)[number];

export const QUALIFICATION_TYPE_LABELS: Record<QualificationType, string> = {
  secondary_school: "Secondary School",
  high_school: "High School",
  associate_degree_2yr: "Associate Degree (2 Years)",
  bachelors_topup_2yr: "Bachelors (top-up 2 Years)",
  bachelors_3yr: "Bachelors (3 Years)",
  bachelors_4yr: "Bachelors (4 years)",
  masters_16yr: "Masters (16 Years Education)",
  masters_3_5yr: "Masters (3.5 Years)",
  masters_1yr: "Masters (1 Year)",
  masters_18yr: "Masters (18 years)",
};

// The institution field is labeled differently per type (a school for
// secondary, a college for high school, otherwise a generic institution).
export function institutionLabel(type: QualificationType): string {
  if (type === "secondary_school") return "School name";
  if (type === "high_school") return "College name";
  return "Institution name";
}

// Non-blocking completeness check for the tab's checklist banner — per the
// user's own direction, missing qualifications are surfaced as an
// incomplete indicator only, nothing is blocked anywhere else in the app.
// The bachelors/masters "acceptable prior-pathway" combinations named by
// the user are read here as: at least one qualification of the
// corresponding tier is present (any of the specific bachelors- or
// masters-tier types satisfies the requirement) — a deliberately
// inclusive reading given the enforcement is advisory only. Flag to the
// user if a stricter reading (exact combination matching) is actually
// wanted.
const BACHELORS_TIER: QualificationType[] = ["bachelors_topup_2yr", "bachelors_3yr", "bachelors_4yr", "masters_16yr"];
const MASTERS_TIER: QualificationType[] = ["masters_16yr", "masters_3_5yr", "masters_1yr", "masters_18yr"];

export type QualificationChecklistItem = { label: string; met: boolean };

export function qualificationChecklist(levelApplyingFor: string | null, presentTypes: Set<QualificationType>): QualificationChecklistItem[] {
  const items: QualificationChecklistItem[] = [
    { label: "Secondary School", met: presentTypes.has("secondary_school") },
    { label: "High School", met: presentTypes.has("high_school") },
  ];

  if (levelApplyingFor === "masters" || levelApplyingFor === "phd") {
    items.push({
      label: "A bachelors-equivalent qualification (Associate Degree + top-up, Bachelors 3/4 years, or Masters 16 years)",
      met: BACHELORS_TIER.some((t) => presentTypes.has(t)),
    });
  }
  if (levelApplyingFor === "phd") {
    items.push({
      label: "A masters qualification",
      met: MASTERS_TIER.some((t) => presentTypes.has(t)),
    });
  }

  return items;
}
