"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { blockKeyOf, cleanBlockHtml } from "@/lib/emailCampaigns/contentBlocks";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

const BLOCKS_PATH = "/marketing/email/templates/blocks";
const DENIED = "Only someone allowed to manage email templates can change content blocks.";

type Result = { success: true; message: string } | { error: string };

/**
 * Saves a content block (0361): new when no id is given. Its key is what
 * templates name — {{block:key}} — so it is set once and never changed; the
 * HTML is cleaned of anything an email cannot carry, and says what went.
 */
export async function saveContentBlock(blockId: string | null, _prev: unknown, formData: FormData): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", DENIED);
  if (denied) return denied;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Give the block a name (at most 80 characters)." };
  const raw = String(formData.get("html") ?? "");
  if (raw.length > 100_000) return { error: "That block is too long." };
  const { html, removed } = cleanBlockHtml(raw);
  if (!html) return { error: "The block is empty." };
  const supabase = await createClient();
  const user = await getCurrentUser();

  let key: string;
  if (blockId) {
    const { data: saved, error } = await supabase
      .from("email_content_blocks")
      .update({ name, html, updated_by: user?.id ?? null })
      .eq("id", blockId)
      .select("key");
    if (error) return { error: error.message };
    if (!saved?.length) return { error: DENIED };
    key = saved[0].key as string;
  } else {
    key = blockKeyOf(String(formData.get("key") ?? "") || name);
    if (!key) return { error: "Give the block a name with letters or digits in it." };
    const { error } = await supabase.from("email_content_blocks").insert({ key, name, html, updated_by: user?.id ?? null });
    if (error) return { error: error.code === "23505" ? `There is already a block called {{block:${key}}} — choose another name.` : error.message };
  }
  await logEmailActivity("block_saved", { summary: `{{block:${key}}} “${name}”` });
  revalidatePath(BLOCKS_PATH);
  return { success: true, message: removed.length ? `Saved — and took out ${removed.join(", ")}.` : "Saved." };
}

export async function deleteContentBlock(blockId: string): Promise<Result> {
  const denied = await requirePermission("email.templates.manage", DENIED);
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_content_blocks").delete().eq("id", blockId).select("key");
  if (error) return { error: error.message };
  if (!data?.length) return { error: DENIED };
  await logEmailActivity("block_deleted", { summary: `{{block:${data[0].key as string}}}` });
  revalidatePath(BLOCKS_PATH);
  return { success: true, message: "Deleted." };
}
