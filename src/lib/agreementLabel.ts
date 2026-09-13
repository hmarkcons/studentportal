// Which agreement is which.
//
// A student holds one agreement per destination now — a primary country and up
// to three backups — so "v1 · paper · 12 Sep" describes several rows equally
// well. The country is the thing that tells them apart, and it is the thing
// staff are looking for when they go to upload a signed copy.

type WithTemplate = {
  template?: { destination?: { country?: string | null } | { country?: string | null }[] | null } | { destination?: unknown }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * The country an agreement is for, or null when its template has none.
 *
 * PostgREST returns an embedded row as an object or a one-element array
 * depending on the shape of the query, so both are unwrapped rather than one
 * being assumed.
 */
export function agreementCountry(agreement: WithTemplate): string | null {
  const template = one(agreement.template as never) as { destination?: unknown } | null;
  if (!template) return null;
  const destination = one(template.destination as never) as { country?: string | null } | null;
  return destination?.country ?? null;
}

/** "Italy · v2", for a heading that has to be scanned quickly. */
export function agreementLabel(agreement: WithTemplate & { version?: number | null }): string {
  const country = agreementCountry(agreement);
  const version = agreement.version;
  if (country && version != null) return `${country} · v${version}`;
  if (country) return country;
  return version != null ? `v${version}` : "Agreement";
}
