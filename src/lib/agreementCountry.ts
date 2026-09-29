// The country an agreement is for, from the rows a query brought back.
//
// An agreement names its own country (0298) — the only place one made from a
// general visa-service template has one — and every agreement on file had it
// filled from its template when that column arrived. The template's country is
// still read after it, so a query that embeds only the template keeps working.
//
// Every reader asks the agreement first: a finance page that read only the
// template would find no country, and so no track and no currency, on exactly
// the visa agreements the general template exists for.
//
// Pure, so it is unit-tested (scripts/agreement-country-test.mjs).

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function agreementDestination<T = Record<string, unknown>>(row: { destination?: unknown; template?: unknown } | null | undefined): T | null {
  if (!row) return null;
  const own = one(row.destination as T | T[] | null | undefined);
  if (own) return own;
  const template = one(row.template as { destination?: unknown } | { destination?: unknown }[] | null | undefined);
  return one(template?.destination as T | T[] | null | undefined);
}
