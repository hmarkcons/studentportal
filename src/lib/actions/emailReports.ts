"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { requirePermission } from "@/lib/auth/permissions";
import { allRecipients } from "@/lib/emailCampaigns/reportData";
import { filterLabel, recipientFilter } from "@/lib/emailCampaigns/reportRules";
import { getStaffSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTaskPeople } from "@/lib/staffTasksLoad";
import { NOTES_MAX, TITLE_MAX } from "@/lib/staffTasks";

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

const FOLLOW_UP_MAX = 500;

/**
 * Follow-up tasks from a report's filter — "clicked, did not convert" — one
 * per lead, given to that lead's own counsellor and linked to the lead, as the
 * office chose (2026-11-12). A lead with no counsellor (or one who has left)
 * goes to the person picked in the form, or is skipped if none was picked.
 * Imported contacts are not leads and have no counsellor, so they are counted
 * and left out. A lead who already has the same task open is not given it twice.
 */
export async function followUpTasksFromCampaign(
  campaignId: string,
  _prev: unknown,
  formData: FormData
): Promise<{ success: true; message: string; given: number } | Fail> {
  const denied = await requirePermission("email.reports.view", "You don't have permission to see who it reached.");
  if (denied) return denied;
  const filter = recipientFilter(String(formData.get("filter") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a title." };
  if (title.length > TITLE_MAX) return { error: `Keep the title to ${TITLE_MAX} characters.` };
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > NOTES_MAX) return { error: `Keep the notes to ${NOTES_MAX} characters.` };
  const due = String(formData.get("due_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) return { error: "Choose the day it is due." };
  const fallback = String(formData.get("fallback_owner") ?? "").trim() || null;

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "Sign in again." };
  const { data: campaign } = await supabase.from("email_campaigns").select("name").eq("id", campaignId).maybeSingle();
  if (!campaign) return { error: "That campaign no longer exists." };

  let rows;
  try {
    rows = await allRecipients(supabase, campaignId, filter);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The recipients could not be read." };
  }
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((id): id is string => Boolean(id)))];
  const contacts = rows.filter((r) => !r.lead_id).length;
  if (!leadIds.length) return { error: contacts ? "None of these are leads — imported contacts have no counsellor to follow them up." : "Nobody matches." };
  if (leadIds.length > FOLLOW_UP_MAX) return { error: `That is ${leadIds.length.toLocaleString("en-US")} leads — at most ${FOLLOW_UP_MAX} tasks at a time. Narrow the filter.` };

  const people = await loadTaskPeople(supabase);
  const active = new Set(people.filter((p) => p.active).map((p) => p.id));
  if (fallback && !active.has(fallback)) return { error: "The person chosen for leads with no counsellor is no longer on the staff." };

  // Counsellors are read past RLS: the person giving the tasks may see only some leads' records.
  const admin = createAdminClient();
  const owners = new Map<string, string | null>();
  const open = new Set<string>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const [{ data: leads }, { data: existing }] = await Promise.all([
      admin.from("leads").select("id, assigned_counselor_id").in("id", chunk),
      admin.from("personal_tasks").select("student_id").in("student_id", chunk).eq("title", title).neq("status", "done"),
    ]);
    for (const l of leads ?? []) owners.set(l.id as string, (l.assigned_counselor_id as string | null) ?? null);
    for (const t of existing ?? []) open.add(t.student_id as string);
  }

  const plan: { lead: string; owner: string }[] = [];
  let toFallback = 0;
  let noOne = 0;
  for (const lead of leadIds) {
    if (open.has(lead)) continue;
    const counsellor = owners.get(lead);
    if (counsellor && active.has(counsellor)) plan.push({ lead, owner: counsellor });
    else if (fallback) {
      plan.push({ lead, owner: fallback });
      toFallback += 1;
    } else noOne += 1;
  }
  if (!plan.length) {
    return { error: open.size ? "Every one of these leads already has this task open." : "None of these leads has a counsellor — choose someone to give their tasks to." };
  }

  let given = 0;
  for (let i = 0; i < plan.length; i += 100) {
    const part = plan.slice(i, i + 100);
    // One task each, so each counsellor ticks their own lead off.
    const { data: tasks, error } = await supabase.from("staff_tasks").insert(part.map(() => ({ created_by: staff.id }))).select("id");
    if (error || !tasks || tasks.length !== part.length) return { error: `${given} tasks were given, then: ${error?.message ?? "the tasks could not be made"}` };
    const { error: copyError } = await supabase.from("personal_tasks").insert(
      part.map((p, j) => ({
        task_id: tasks[j].id,
        owner_id: p.owner,
        assigned_by: p.owner === staff.id ? null : staff.id,
        title,
        description: notes || `From the email campaign “${campaign.name as string}”: ${filterLabel(filter).toLowerCase()}.`,
        due_date: due,
        due_time: null,
        all_day: true,
        priority: "medium",
        student_id: p.lead,
      }))
    );
    if (copyError) {
      await supabase.from("staff_tasks").delete().in("id", tasks.map((t) => t.id as string));
      return { error: `${given} tasks were given, then: ${copyError.message}` };
    }
    given += part.length;
  }

  const counsellors = new Set(plan.map((p) => p.owner)).size;
  const parts = [`${given.toLocaleString("en-US")} follow-up task${given === 1 ? "" : "s"} given to ${counsellors} ${counsellors === 1 ? "person" : "people"}`];
  if (toFallback) parts.push(`${toFallback} with no counsellor went to the person you chose`);
  if (noOne) parts.push(`${noOne} with no counsellor were skipped`);
  if (open.size) parts.push(`${open.size} already had it open`);
  if (contacts) parts.push(`${contacts} imported contact${contacts === 1 ? "" : "s"} left out`);
  // No revalidation: the task lists are read fresh, and revalidating would re-render this whole report into the answer.
  return { success: true, given, message: `${parts.join("; ")}.` };
}
