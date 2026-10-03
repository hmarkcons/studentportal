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
type CountedPage<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>;

/**
 * readAll, but the pages after the first are fetched together rather than one
 * after another: the first asks for the total as well (count: "exact"), and the
 * rest go out at once. For a list a page waits on, where three round trips in
 * a row were most of the wait. `run` is called with `withCount` true for the
 * first page only, which must then ask for the count.
 */
export async function readAllParallel<T>(run: (from: number, to: number, withCount: boolean) => CountedPage<T>): Promise<T[]> {
  const first = await run(0, PAGE_SIZE - 1, true);
  if (first.error) throw new Error(first.error.message);
  const rows = first.data ?? [];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE_SIZE || total <= PAGE_SIZE) return rows;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE_SIZE) - 1 }, (_, i) => run((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1, false))
  );
  for (const page of rest) {
    if (page.error) throw new Error(page.error.message);
    rows.push(...(page.data ?? []));
  }
  // Rows added between the count and the reads land past the last page: read on.
  if (rows.length >= Math.ceil(total / PAGE_SIZE) * PAGE_SIZE) {
    rows.push(...(await readAll((from, to) => run(from + rows.length, to + rows.length, false))));
  }
  return rows;
}

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
