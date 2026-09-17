import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remove everything stored under one prefix in the documents bucket.
 *
 * Written for deleting a student. Everything a student owns lives under
 * `<studentId>/` — their documents at the top, and agreements, invoices,
 * additional-services uploads and consent recordings in subfolders — so
 * clearing the prefix catches all of it. Chasing the individual path columns
 * instead is what let this leak in the first place: each new feature that
 * stored a file added a column somebody had to remember.
 *
 * Why it matters beyond tidiness: those files are passports, certificates,
 * transcripts, tax returns and signed agreements. Leaving them in the bucket
 * after the record has gone means keeping somebody's personal documents with
 * nothing left to say whose they are. Production had 47 such folders — 111
 * files, about 13 MB — from students deleted over the project's life.
 *
 * Supabase Storage has no recursive delete, so this walks the prefix. Two
 * levels is enough for the shapes actually in use, and `depth` allows more.
 *
 * Never throws. The caller has already removed the record, which was the
 * user's intent; failing their action because a file could not be tidied would
 * be the wrong trade. Failures are logged so a leak is discoverable.
 */
export async function removeStoragePrefix(
  supabase: SupabaseClient,
  prefix: string,
  { bucket = "documents", depth = 2 }: { bucket?: string; depth?: number } = {}
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;

  async function collect(path: string, level: number): Promise<string[]> {
    if (level > depth) return [];
    const { data, error } = await supabase.storage.from(bucket).list(path, { limit: 1000 });
    if (error) {
      console.error(`[removeStoragePrefix] could not list ${bucket}/${path}:`, error.message);
      failed++;
      return [];
    }
    const found: string[] = [];
    for (const entry of data ?? []) {
      const full = `${path}/${entry.name}`;
      // Storage reports a folder as an entry with no id and no metadata.
      if (entry.id === null || entry.metadata == null) {
        found.push(...(await collect(full, level + 1)));
      } else {
        found.push(full);
      }
    }
    return found;
  }

  const files = await collect(prefix, 1);
  if (files.length === 0) return { removed, failed };

  // The API caps how many paths one call accepts.
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`[removeStoragePrefix] could not remove a batch under ${prefix}:`, error.message);
      failed += batch.length;
    } else {
      removed += (data ?? []).length;
    }
  }

  return { removed, failed };
}
