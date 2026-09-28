// What a registered student sees of their agreements: the signed copies, and
// which of them is in force.
//
// The office corrects an agreement by generating a new one for the same
// country, and every row is stored as "version 1", so the numbering here is
// the order they were made in, country by country. The newest signed
// agreement for a country is the one that applies; each older one is shown as
// replaced by it — kept for the student's records, and said plainly so nobody
// reads an old fee off a copy that was corrected. A backup country's
// agreement is a separate agreement, never a correction of the main one.
//
// Pure, so it is unit-tested (scripts/student-agreements-test.mjs).

export type AgreementRow = {
  id: string;
  status: string;
  created_at: string;
  signed_file_uploaded_at: string | null;
  country: string | null;
  is_backup: boolean | null;
};

export type SignedVersion = {
  id: string;
  /** 1 for the first made for this country, counting every signed one. */
  number: number;
  of: number;
  current: boolean;
  /** The date it was signed, or made when no signing date was recorded. */
  signedOn: string;
  /** For an older copy: the one that corrects it. */
  replacedBy: { number: number; signedOn: string } | null;
  /** For the newest, when there were earlier ones: the one it corrects. */
  replaces: { number: number; signedOn: string } | null;
};

export type SignedGroup = { country: string; backup: boolean; versions: SignedVersion[] };

const signedOn = (a: AgreementRow) => (a.signed_file_uploaded_at ?? a.created_at).slice(0, 10);

/** Signed agreements by country — the main country first — each country's newest first. */
export function signedAgreementGroups(rows: readonly AgreementRow[]): SignedGroup[] {
  const groups = new Map<string, AgreementRow[]>();
  for (const row of rows) {
    if (row.status !== "signed") continue;
    const key = `${row.is_backup ? "backup" : "main"}::${row.country ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const oldestFirst = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const of = oldestFirst.length;
      const versions = oldestFirst.map((a, i): SignedVersion => {
        const next = oldestFirst[of - 1];
        const previous = oldestFirst[i - 1];
        const current = i === of - 1;
        return {
          id: a.id,
          number: i + 1,
          of,
          current,
          signedOn: signedOn(a),
          replacedBy: current ? null : { number: of, signedOn: signedOn(next) },
          replaces: current && previous ? { number: i, signedOn: signedOn(previous) } : null,
        };
      });
      return { country: list[0].country ?? "Your agreement", backup: key.startsWith("backup"), versions: versions.reverse() };
    })
    .sort((a, b) => Number(a.backup) - Number(b.backup) || a.country.localeCompare(b.country));
}
