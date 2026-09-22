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
