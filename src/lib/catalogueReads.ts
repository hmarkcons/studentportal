// Reading the catalogue in full, for the export and for the imports.
//
// Two limits that both fail without saying so:
//
// **PostgREST stops at 1000 rows.** A read past that comes back truncated and
// error-free, so an export would look complete while missing half a country,
// and an import would decide that stored programmes do not exist and create
// them a second time. Every read here pages, ordered by id so that a page
// boundary cannot skip or repeat a row.
//
// **`.in()` puts every id in the URL.** A whole catalogue's worth of uuids is
// tens of kilobytes of query string, well past what the gateway accepts. So
// id lists are sent in chunks.

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE_SIZE = 1000;

/** ~150 uuids is ~5.5 KB of URL — comfortably inside every limit on the way. */
const IN_CHUNK = 150;

/** Every row a query matches, one page at a time. Throws on error. */
export async function readAll<T>(run: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/** readAll, for a query filtered by a list of ids that may be long. */
export async function readAllIn<T>(
  ids: readonly string[],
  run: (chunk: string[], from: number, to: number) => Page<T>
): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; at < ids.length; at += IN_CHUNK) {
    const chunk = ids.slice(at, at + IN_CHUNK);
    out.push(...(await readAll((from, to) => run(chunk, from, to))));
  }
  return out;
}
