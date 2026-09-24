"use client";

import { createClient } from "@/lib/supabase/client";
import { STAGING_BUCKET, STAGING_VIDEO_BUCKET, makeStagedRef, stagingPath } from "./stagedUploadRef.ts";
import { formatFileSize } from "./fileSize.ts";

export type StageResult = { ok: true; ref: string } | { ok: false; error: string };

/**
 * Puts a chosen file straight into Supabase Storage and returns the reference
 * the form posts instead of the file (see src/lib/stagedUpload.ts for why).
 *
 * The file goes from the browser to Supabase directly — not through Vercel —
 * so its size is limited only by the staging bucket, and a slow connection
 * holds no server open while it trickles up.
 */
export async function stageFile(file: File, { video = false }: { video?: boolean } = {}): Promise<StageResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) return { ok: false, error: "You have been signed out. Sign in again, then choose the file again." };

  const bucket = video ? STAGING_VIDEO_BUCKET : STAGING_BUCKET;
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const path = stagingPath(userId, file.name, Date.now(), random);

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    // Storage enforces the bucket's size limit itself; say it in our words.
    if (/exceeded|too large|payload|413/i.test(error.message)) {
      return { ok: false, error: `This file is ${formatFileSize(file.size)}, which is over the limit.` };
    }
    return { ok: false, error: "The upload didn't go through. Check your connection and choose the file again." };
  }
  return { ok: true, ref: makeStagedRef(bucket, path, file.name) };
}
