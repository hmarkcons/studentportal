"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { allRecipients } from "@/lib/emailCampaigns/reportData";
import { filterLabel, recipientFilter } from "@/lib/emailCampaigns/reportRules";

type Fail = { error: string };

/**
 * A list made from a report's filter — "opened, did not click" for the
 * follow-up, "bounced" to check by hand. Leads join as themselves and
 * contacts as contacts, so whoever has since unsubscribed is still left out
 * when the list is used. The recipients are read as the caller.
 */
export async function listFromCampaignRecipients(
  campaignId: string,
  _prev: unknown,
  formData: FormData
): Promise<{ success: true; listId: string; added: number; message: string } | Fail> {
  const denied =
    (await requirePermission("email.audience.manage", "You don't have permission to make lists.")) ??
    (await requirePermission("email.reports.view", "You don't have permission to see who it reached."));
  if (denied) return denied;
  const filter = recipientFilter(String(formData.get("filter") ?? ""));
  const supabase = await createClient();
  const { data: campaign } = await supabase.from("email_campaigns").select("name").eq("id", campaignId).maybeSingle();
  if (!campaign) return { error: "That campaign no longer exists." };
  const name = (String(formData.get("name") ?? "").trim() || `${campaign.name as string} — ${filterLabel(filter)}`).slice(0, 120);

  let rows;
  try {
    rows = await allRecipients(supabase, campaignId, filter);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The recipients could not be read." };
  }
  const seen = new Set<string>();
  const members: { lead_id: string | null; contact_id: string | null }[] = [];
  for (const r of rows) {
    const key = r.lead_id ? `l:${r.lead_id}` : r.contact_id ? `c:${r.contact_id}` : null;
    // One whose lead or contact has since been deleted cannot join a list.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    members.push({ lead_id: r.lead_id ?? null, contact_id: r.lead_id ? null : r.contact_id });
  }
  if (!members.length) return { error: "Nobody to put on a list — no one matches, or they are no longer on file." };

  const user = await getCurrentUser();
  const { data: list, error } = await supabase
    .from("email_lists")
    .insert({ name, description: `From the campaign “${campaign.name as string}”: ${filterLabel(filter).toLowerCase()}.`.slice(0, 500), created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) return { error: error.message };
  let added = 0;
  for (let i = 0; i < members.length; i += 500) {
    const { data, error: addError } = await supabase
      .from("email_list_members")
      .insert(members.slice(i, i + 500).map((m) => ({ list_id: list.id, ...m, added_by: user?.id ?? null })))
      .select("id");
    if (addError) return { error: `The list was made, but not everyone was added: ${addError.message}` };
    added += data?.length ?? 0;
  }
  revalidatePath("/marketing/email/audience/lists");
  return { success: true, listId: list.id as string, added, message: `List “${name}” made with ${added.toLocaleString("en-US")} people.` };
}
