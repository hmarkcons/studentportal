// Signed URLs for private storage objects, asked for all at once.
//
// createSignedUrl signs ONE path per call, and every call is a round trip to
// Supabase Storage. Pages here sign in loops — a student's documents, every
// invoice PDF, both files on each agreement, a row of staff photos — so a
// student with twenty documents cost twenty round trips before the page could
// render. Promise.all made them concurrent, not free: they still queue on the
// connection pool and each one still pays the full network latency.
//
// createSignedUrls (plural) signs a whole list in one request. Same result,
// one round trip.
//
// Callers get a Map keyed by the storage path, because that is what they
// already hold on the row they are rendering.
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SignedUrlOptions = {
  /** Seconds. Matches the hour the pages here have always used. */
  expiresIn?: number;
  /** Ask the browser to save rather than display, under this filename. */
  download?: string;
};

/**
 * Signs every path given and returns path → URL.
 *
 * Nulls, blanks and duplicates are dropped before asking, so callers can pass
 * a column straight from a row set without filtering first. A path that cannot
 * be signed — a file deleted out from under the row — is simply absent from
 * the map, which is the same thing the one-at-a-time version did when it
 * failed, and every caller already handles a missing URL.
 */
export async function signedUrlMap(
  supabase: SupabaseClient,
  bucket: string,
  paths: readonly (string | null | undefined)[],
  options: SignedUrlOptions = {}
): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p && p.trim())))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;

  const expiresIn = options.expiresIn ?? 3600;

  // A per-file download name cannot go through the batch call, which takes one
  // set of options for the whole list. Those are rare — one or two files on a
  // page — so they keep the single-path call rather than losing the name.
  if (options.download) {
    const signed = await Promise.all(
      wanted.map(async (path) => {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn, {
          download: options.download,
        });
        return [path, data?.signedUrl] as const;
      })
    );
    for (const [path, url] of signed) if (url) out.set(path, url);
    return out;
  }

  const { data } = await supabase.storage.from(bucket).createSignedUrls(wanted, expiresIn);
  for (const row of data ?? []) {
    // The row carries its own error when that one path could not be signed.
    if (row.signedUrl && !row.error) out.set(row.path ?? "", row.signedUrl);
  }
  return out;
}

/** The common case: private files in the `documents` bucket, signed for an hour. */
export function documentUrls(
  supabase: SupabaseClient,
  paths: readonly (string | null | undefined)[],
  options: SignedUrlOptions = {}
): Promise<Map<string, string>> {
  return signedUrlMap(supabase, "documents", paths, options);
}

/**
 * Profile photos, signed once and reused.
 *
 * A signed URL carries a fresh signature every time it is minted, so the same
 * photo had a different URL on every page load and no browser could ever
 * reuse the copy it already had. Staff avatars are the same handful of files
 * on page after page, and they are phone photos — one on file is 900x1600 and
 * 128KB, displayed at 46 pixels square. Measured from Karachi they took about
 * two seconds each, every single load, and they were the largest remaining
 * cost on the student page.
 *
 * Signed for a day and the URL kept for an hour, so it is stable long enough
 * for the browser to serve the second view from its own cache, and always
 * refreshed long before it expires. Vercel's Data Cache outlives a deploy, so
 * the gap between the two matters: an entry served at the end of its hour is
 * still twenty-three hours from expiry.
 *
 * Not for documents. Those are read once, by one person, and a stable URL for
 * them would be a link that keeps working after the page that produced it is
 * gone.
 */
export const avatarUrls = unstable_cache(
  async (paths: string[]): Promise<[string, string][]> => {
    const supabase = createAdminClient();
    const map = await signedUrlMap(supabase, "documents", paths, { expiresIn: 86400 });
    return [...map.entries()];
  },
  ["avatar-signed-urls"],
  { tags: ["avatar-urls"], revalidate: 3600 }
);

/** avatarUrls as a Map, with the blanks and duplicates already dropped. */
export async function avatarUrlMap(
  paths: readonly (string | null | undefined)[]
): Promise<Map<string, string>> {
  // Sorted and de-duplicated before it becomes part of the cache key, so two
  // pages asking for the same faces in a different order share one entry.
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p && p.trim())))].sort();
  if (wanted.length === 0) return new Map();
  return new Map(await avatarUrls(wanted));
}
