/**
 * Which countries a student actually has a visa process for.
 *
 * The rule, which the student's own Visa page has always applied and the staff
 * tab now shares so the two cannot drift:
 *
 *   - the visa belongs to the university the student is going to, so once a
 *     country has a finalised application, only that application counts;
 *   - a country with no finalised application yet has no visa process to
 *     report at all, and listing it would suggest several are under way;
 *   - the test is per country. A finalised Italian pre-enrolment says nothing
 *     about a German application that is still open.
 */

export type VisaApplication = {
  id: string;
  isFinalized: boolean;
  countryCode: string | null;
  countryName: string | null;
  universityName: string | null;
};

export type VisaCountry = {
  code: string;
  name: string;
  /** The application the visa hangs off — the finalised one. */
  appId: string;
  universities: string[];
};

export function visaCountries(applications: VisaApplication[]): VisaCountry[] {
  const finalisedCountries = new Set(
    applications.filter((a) => a.isFinalized && a.countryCode).map((a) => a.countryCode as string)
  );

  const byCountry = new Map<string, VisaCountry>();
  for (const a of applications) {
    if (!a.countryCode) continue;
    // A country with nothing finalised is not in the visa process yet.
    if (!finalisedCountries.has(a.countryCode)) continue;
    // And within one that is, only the finalised application counts.
    if (!a.isFinalized) continue;

    const existing = byCountry.get(a.countryCode);
    if (existing) {
      if (a.universityName && !existing.universities.includes(a.universityName)) {
        existing.universities.push(a.universityName);
      }
      continue;
    }
    byCountry.set(a.countryCode, {
      code: a.countryCode,
      name: a.countryName ?? a.countryCode,
      appId: a.id,
      universities: a.universityName ? [a.universityName] : [],
    });
  }

  // Named order, so two staff looking at the same student read the same list.
  return [...byCountry.values()].sort((x, y) => x.name.localeCompare(y.name));
}
