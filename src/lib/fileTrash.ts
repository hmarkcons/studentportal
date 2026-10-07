import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/currentUser";

// Deleted files, kept for TRASH_DAYS so that restoring a record from the audit
// log (0322) brings its file back too: a student's passport scan, a signed
// agreement, an invoice PDF.
//
// A file is copied to trash/<day>/<random>/<its path> in its own bucket
// before it is removed, and the copy recorded in trashed_files. The removal
// itself is still made by the caller's own client, so storage's policies
// decide it exactly as before; only the copy, and putting it back, use the
// service role. trash/ is outside every student's own folder, so no student
// can read it.

export const TRASH_DAYS = 90;

/** How many copies are made at once: a whole student's folder is a hundred files. */
const AT_ONCE = 8;

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += AT_ONCE) await Promise.all(items.slice(i, i + AT_ONCE).map(run));
}

/**
 * Removes files from storage, keeping a copy of each for TRASH_DAYS. Answers
 * as storage's own remove does ({ data, error }), so it replaces one where it
 * stands. A file that could not be copied is still removed — the deletion was
 * asked for — and said in the log.
 */
export async function removeStorageFiles(client: SupabaseClient, bucket: string, paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (list.length === 0) return { data: [], error: null };

  const admin = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const kept: { path: string; trash: string }[] = [];
  await inBatches(list, async (path) => {
    const trash = `trash/${day}/${crypto.randomUUID()}/${path}`;
    const { error } = await admin.storage.from(bucket).copy(path, trash);
    if (error) {
      // Already gone, or not a file: nothing to keep.
      if (!/not found|does not exist/i.test(error.message)) console.error(`[fileTrash] could not keep ${bucket}/${path}:`, error.message);
      return;
    }
    kept.push({ path, trash });
  });

  const result = await client.storage.from(bucket).remove(list);
  if (result.error) {
    // Not removed: the copies are not needed.
    if (kept.length) await admin.storage.from(bucket).remove(kept.map((k) => k.trash));
    return result;
  }
  if (kept.length) {
    const user = await getCurrentUser().catch(() => null);
    const { error } = await admin
      .from("trashed_files")
      .insert(kept.map((k) => ({ bucket, path: k.path, trash_path: k.trash, deleted_by: user?.id ?? null })));
    if (error) console.error("[fileTrash] kept files could not be recorded:", error.message);
  }
  return result;
}

/**
 * Puts kept files back where they were, for the paths named — the values of a
 * record just restored or reverted. A path with a file in place already is
 * left alone. Returns how many came back.
 */
export async function restoreTrashedFiles(paths: string[]): Promise<number> {
  const candidates = [...new Set(paths.filter((p) => p && p.includes("/") && !/\s/.test(p) && p.length < 500))];
  if (candidates.length === 0) return 0;
  const admin = createAdminClient();
  const rows: { id: string; bucket: string; path: string; trash_path: string; deleted_at: string }[] = [];
  for (let i = 0; i < candidates.length; i += 200) {
    const { data } = await admin
      .from("trashed_files")
      .select("id, bucket, path, trash_path, deleted_at")
      .in("path", candidates.slice(i, i + 200))
      .is("restored_at", null)
      .order("deleted_at", { ascending: false });
    rows.push(...((data ?? []) as typeof rows));
  }
  // The latest copy of each path.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(`${r.bucket}|${r.path}`)) latest.set(`${r.bucket}|${r.path}`, r);

  let restored = 0;
  await inBatches([...latest.values()], async (r) => {
    const { error } = await admin.storage.from(r.bucket).copy(r.trash_path, r.path);
    if (error && !/exists|duplicate/i.test(error.message)) {
      console.error(`[fileTrash] could not put back ${r.bucket}/${r.path}:`, error.message);
      return;
    }
    await admin.from("trashed_files").update({ restored_at: new Date().toISOString() }).eq("id", r.id);
    if (!error) restored++;
  });
  return restored;
}

/** Every string in a record — a path may be in any column, or inside a JSON one. */
export function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

/** Deletes kept copies older than TRASH_DAYS. Called by the ten-minute cron. */
export async function purgeTrash(limit = 200): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  const { data } = await admin.from("trashed_files").select("id, bucket, trash_path").lt("deleted_at", cutoff).limit(limit);
  const rows = (data ?? []) as { id: string; bucket: string; trash_path: string }[];
  const byBucket = new Map<string, typeof rows>();
  for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r]);
  for (const [bucket, list] of byBucket) {
    await admin.storage.from(bucket).remove(list.map((r) => r.trash_path));
    await admin.from("trashed_files").delete().in("id", list.map((r) => r.id));
  }
  return rows.length;
}
