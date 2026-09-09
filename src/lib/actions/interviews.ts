"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { interviewFieldsError, localWallTimeToInstant } from "@/lib/interviews";

// Scheduling an interview was open to any staff member who could see the
// student — a counselor included. The brief puts it with Super Admin and the
// Processing team, and migration 0151 enforces the same at the database, so the
// floor does not depend on this check being here.
const DENIED = "Only Super Admin and the Processing team can manage interviews.";

async function gate() {
  const denied = await requirePermission("interviews.manage", DENIED);
  return denied ? denied.error : null;
}

function readFields(formData: FormData) {
  return {
    roundLabel: String(formData.get("round_label") ?? "").trim(),
    localDateTime: String(formData.get("local_datetime") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
    platform: String(formData.get("platform") ?? "").trim(),
    platformOther: String(formData.get("platform_other") ?? "").trim(),
    status: String(formData.get("status") ?? "scheduled").trim(),
    link: String(formData.get("interview_link") ?? "").trim(),
  };
}

function toRow(fields: ReturnType<typeof readFields>, formData: FormData) {
  return {
    round_label: fields.roundLabel,
    // Staff type the time as the university quoted it; the instant is worked
    // out from the zone they picked, for that date — Rome is +1 in November and
    // +2 in July, so a fixed offset would be an hour out for half the year.
    confirmed_datetime: localWallTimeToInstant(fields.localDateTime, fields.timezone),
    timezone: fields.timezone,
    platform: fields.platform,
    platform_other: fields.platform === "other" ? fields.platformOther : null,
    status: fields.status,
    interview_link: fields.link || null,
    interview_details: String(formData.get("interview_details") ?? "").trim() || null,
    preparation_notes: String(formData.get("preparation_notes") ?? "").trim() || null,
  };
}

export async function addInterview(applicationId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readFields(formData);
  const invalid = interviewFieldsError(fields);
  if (invalid) return { error: invalid };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: interview, error: insertError } = await supabase
    .from("application_interviews")
    .insert({ application_id: applicationId, created_by: user?.id ?? null, ...toRow(fields, formData) })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  const credentialsError = await saveCredentials(supabase, interview.id, formData);
  if (credentialsError) return { error: credentialsError };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateInterview(interviewId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readFields(formData);
  const invalid = interviewFieldsError(fields);
  if (invalid) return { error: invalid };

  const { error: updateError } = await supabase
    .from("application_interviews")
    .update(toRow(fields, formData))
    .eq("id", interviewId);
  if (updateError) return { error: updateError.message };

  const credentialsError = await saveCredentials(supabase, interviewId, formData);
  if (credentialsError) return { error: credentialsError };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteInterview(interviewId: string, revalidateTo: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  // The credentials row cascades with it.
  const { error: deleteError } = await supabase.from("application_interviews").delete().eq("id", interviewId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Credentials live in their own table so "show the student only if required"
 * can be enforced by a policy rather than by which columns a query happens to
 * ask for — the student holds a session and could read the interview row
 * directly.
 *
 * With nothing filled in, any existing row is deleted rather than left holding
 * blanks with a share flag still set.
 */
async function saveCredentials(supabase: Client, interviewId: string, formData: FormData): Promise<string | null> {
  const login_username = String(formData.get("login_username") ?? "").trim() || null;
  const login_password = String(formData.get("login_password") ?? "").trim() || null;
  const login_instructions = String(formData.get("login_instructions") ?? "").trim() || null;
  const share_with_student = formData.get("share_with_student") === "on";

  if (!login_username && !login_password && !login_instructions) {
    const { error } = await supabase.from("application_interview_credentials").delete().eq("interview_id", interviewId);
    return error ? error.message : null;
  }

  // Sharing nothing but a tick is a mistake worth catching: the student would
  // be shown an empty credentials box.
  if (share_with_student && !login_username && !login_password && !login_instructions) {
    return "There are no credentials to share yet.";
  }

  const { error } = await supabase.from("application_interview_credentials").upsert(
    {
      interview_id: interviewId,
      login_username,
      login_password,
      login_instructions,
      share_with_student,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "interview_id" }
  );
  return error ? error.message : null;
}
