import { createClient } from "@/lib/supabase/server";
import { STAGING_MAX_AGE_MS, isStagedRef, parseStagedRef, stagedAtFromName } from "./stagedUploadRef.ts";
import { getCurrentUser } from "@/lib/auth/currentUser";

/**
 * The file a form sent in `name`, wherever it travelled.
 *
 * The browser puts a chosen file straight into a staging bucket (0275) and
 * posts only a reference to it, because a Vercel Function refuses any request
 * over 4.5 MB. This fetches the file back and hands it over as the File the
 * action always received — so the checks after it, and the upload to the
 * file's real destination as the signed-in person, are exactly what they were.
 *
 * A file posted the old way (the upload into staging failed and the form fell
 * back to sending a small file itself) is returned as it came.
 *
 * Returns null when nothing usable was sent, which every caller already reads
 * as "choose a file". The staged copy is left for the sweep rather than
 * deleted here: an import is previewed and then committed from the same
 * reference, so it is read twice.
 */
export async function uploadedFile(
  formData: FormData,
  name: string,
  { allowVideo = false }: { allowVideo?: boolean } = {}
): Promise<File | null> {
  const value = formData.get(name);
  if (value instanceof File) return value;
  if (!isStagedRef(value)) return null;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const ref = parseStagedRef(value, user.id, { allowVideo });
  if ("error" in ref) return null;

  // Read as the signed-in person: the staging policies let nobody else read it.
  const { data: blob, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error || !blob) return null;

  await sweepStaged(supabase, ref.bucket, user.id);
  return new File([blob], ref.fileName, { type: blob.type || "application/octet-stream" });
}

/**
 * Several files posted under one name, each staged on its own — kept as
 * separate files, unlike FileField's "multiple", which joins them into one
 * PDF. Files that cannot be read (expired, not the caller's) are left out;
 * the caller compares the count with what was sent.
 */
export async function uploadedFiles(formData: FormData, name: string, { max = 10 }: { max?: number } = {}): Promise<{ files: File[]; sent: number }> {
  const all = formData.getAll(name);
  const values = all.slice(0, max);
  const supabase = await createClient();
  const user = await getCurrentUser();
  const files: File[] = [];
  let bucket: string | null = null;
  for (const value of values) {
    if (value instanceof File) {
      if (value.size > 0) files.push(value);
      continue;
    }
    if (!user || !isStagedRef(value)) continue;
    const ref = parseStagedRef(value, user.id, { allowVideo: false });
    if ("error" in ref) continue;
    const { data: blob, error } = await supabase.storage.from(ref.bucket).download(ref.path);
    if (error || !blob) continue;
    bucket = ref.bucket;
    files.push(new File([blob], ref.fileName, { type: blob.type || "application/octet-stream" }));
  }
  // One sweep for the lot, not one per file.
  if (bucket && user) await sweepStaged(supabase, bucket, user.id);
  return { files, sent: all.length };
}

/** Removes this person's staged files once they are a day old. Best effort. */
async function sweepStaged(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, userId: string) {
  try {
    const { data } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
    const cutoff = Date.now() - STAGING_MAX_AGE_MS;
    const stale = (data ?? [])
      .filter((o) => {
        const at = stagedAtFromName(o.name);
        return at !== null && at < cutoff;
      })
      .map((o) => `${userId}/${o.name}`);
    if (stale.length) await supabase.storage.from(bucket).remove(stale);
  } catch {
    // A missed sweep costs a few megabytes until the next upload; never an upload.
  }
}
