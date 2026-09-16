/**
 * Embassies, consulates and visa application centres, as the pages show them.
 *
 * The office's question is never "list the missions" — it is "where does this
 * student hand in their application, and what is the address". So the ordering
 * puts the place applications are lodged first, and the labelling says which
 * kind of place each one is rather than leaving a reader to infer it from the
 * name.
 */

export type VisaOfficeKind = "embassy" | "high_commission" | "consulate" | "visa_centre";

export type VisaOffice = {
  id: string;
  kind: VisaOfficeKind;
  name: string;
  city: string | null;
  operator: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  appointmentUrl: string | null;
  officeHours: string | null;
  jurisdiction: string | null;
  submitsApplications: boolean;
  /** Shown to the student. Only what a student should read. */
  notes: string | null;
  /**
   * Staff only, and absent entirely on the student's page rather than merely
   * unrendered — see loadVisaOffices. What still needs checking, which source
   * disagreed, who to ring.
   */
  internalNotes?: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
};

export const VISA_OFFICE_KINDS: { value: VisaOfficeKind; label: string }[] = [
  { value: "embassy", label: "Embassy" },
  { value: "high_commission", label: "High Commission" },
  { value: "consulate", label: "Consulate" },
  { value: "visa_centre", label: "Visa application centre" },
];

export function kindLabel(kind: VisaOfficeKind | string): string {
  return VISA_OFFICE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/**
 * Where the application actually goes, first.
 *
 * Then the mission, then everything else, each group by city so a student in
 * Karachi is not reading Islamabad twice before reaching their own.
 */
export function orderOffices(offices: VisaOffice[]): VisaOffice[] {
  const rank = (o: VisaOffice) => {
    if (o.submitsApplications) return 0;
    if (o.kind === "embassy" || o.kind === "high_commission") return 1;
    if (o.kind === "consulate") return 2;
    return 3;
  };
  return [...offices].sort(
    (a, b) => rank(a) - rank(b) || (a.city ?? "").localeCompare(b.city ?? "") || a.name.localeCompare(b.name)
  );
}

/**
 * The one sentence a student needs above the list.
 *
 * Said explicitly for the case the office called out: a country with no visa
 * centre, where the application goes to the mission itself. A student who has
 * only ever heard of VFS will otherwise go looking for a centre that does not
 * exist.
 */
export function whereToApply(offices: VisaOffice[]): string | null {
  const lodging = offices.filter((o) => o.submitsApplications);
  if (lodging.length === 0) return null;

  const centres = lodging.filter((o) => o.kind === "visa_centre");
  const missions = lodging.filter((o) => o.kind !== "visa_centre");

  const cities = (list: VisaOffice[]) =>
    [...new Set(list.map((o) => o.city).filter((c): c is string => Boolean(c)))].join(", ");

  if (centres.length > 0 && missions.length === 0) {
    const operator = [...new Set(centres.map((c) => c.operator).filter(Boolean))].join(" / ");
    const where = cities(centres);
    return `Applications are submitted at ${operator || "the visa application centre"}${where ? ` in ${where}` : ""}, not at the embassy.`;
  }
  if (missions.length > 0 && centres.length === 0) {
    const where = cities(missions);
    const what = missions[0].kind === "consulate" ? "the consulate" : "the mission";
    // Two different situations reach here and they must not be worded the same.
    //
    // The one the office asked for is Ukraine: no visa centre exists at all, so
    // a student who has only ever heard of VFS goes looking for one that is not
    // there. Saying so is the whole point of the sentence.
    //
    // France is the other: a centre exists and the student will deal with it —
    // AEG books the appointment — but the application itself is handed in at
    // the consulate. Telling that student "there is no visa application centre
    // for this country" is simply false, and it is false about the one step
    // they have to take first. The sections below explain the split; this
    // sentence only has to not lie about it.
    const centreExists = offices.some((o) => o.kind === "visa_centre");
    return centreExists
      ? `Applications are submitted at ${what}${where ? ` in ${where}` : ""}, by appointment — not at the visa application centre.`
      : `There is no visa application centre for this country — applications are submitted at ${what}${where ? ` in ${where}` : ""}, by appointment.`;
  }
  return `Applications are submitted at ${lodging.map((o) => o.name).join(" or ")}.`;
}

/** Said where an entry has never been confirmed, rather than presenting it as fact. */
export function needsChecking(office: VisaOffice): boolean {
  return !office.verifiedAt;
}
