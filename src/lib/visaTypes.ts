// The kind of visa a trip was on, or that a refusal/deportation was against —
// used on a registered student's Travel & visa history and woven into the
// Documents requirements it raises. Pure, so the unit tests read it directly.

export type VisaTypeOption = {
  /** Stored value. */
  value: string;
  /** Shown in the dropdown. */
  label: string;
  /** The compact word used when the type is written into a document's name ("Student visa refusal letter"). */
  short: string;
};

/**
 * The dropdown, in the order it reads. "other" is last and opens a free-text
 * box so an unusual visa (a Schengen C, a Working Holiday) can be named exactly.
 */
export const VISA_TYPES: readonly VisaTypeOption[] = [
  { value: "tourist", label: "Tourist / Visit", short: "Tourist" },
  { value: "student", label: "Student", short: "Student" },
  { value: "work", label: "Work", short: "Work" },
  { value: "business", label: "Business", short: "Business" },
  { value: "family", label: "Family / Dependent", short: "Family" },
  { value: "transit", label: "Transit", short: "Transit" },
  { value: "medical", label: "Medical", short: "Medical" },
  { value: "conference", label: "Conference / Seminar", short: "Conference" },
  { value: "pilgrimage", label: "Pilgrimage (Hajj / Umrah)", short: "Pilgrimage" },
  { value: "settlement", label: "Settlement / Immigration", short: "Settlement" },
  { value: "other", label: "Other", short: "Other" },
];

export const VISA_TYPE_OTHER = "other";

const BY_VALUE = new Map(VISA_TYPES.map((t) => [t.value, t]));

/** Whether a stored value is one the dropdown offers. */
export function isVisaType(value: string | null | undefined): boolean {
  return Boolean(value && BY_VALUE.has(value));
}

/** The full label for a stored visa type — the typed name when it is "other". */
export function visaTypeLabel(value: string | null | undefined, other?: string | null): string | null {
  if (!value) return null;
  if (value === VISA_TYPE_OTHER) return (other ?? "").trim() || "Other";
  return BY_VALUE.get(value)?.label ?? value;
}

/** The compact word for writing into a document's name — the typed name when it is "other". */
export function visaTypeShort(value: string | null | undefined, other?: string | null): string | null {
  if (!value) return null;
  if (value === VISA_TYPE_OTHER) return (other ?? "").trim() || null;
  return BY_VALUE.get(value)?.short ?? value;
}
