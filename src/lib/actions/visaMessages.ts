"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

const PAGE = "/setup/visa-messages";

/**
 * Saves what a student reads when their visa decision arrives.
 *
 * Refuses a blank heading or body rather than letting the table's own CHECK
 * reach the user as a constraint name — and because an empty message leaves a
 * card with a badge and nothing under it, on the page somebody opens to find
 * out whether they are going.
 */
export async function updateVisaMessages(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "settings.visa_messages",
    "Only Management and Super Admin can change the visa messages."
  );
  if (denied) return { error: denied.error };

  const read = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);

  const fields = {
    approved_heading: read("approved_heading", 200),
    approved_body: read("approved_body", 4000),
    approved_signoff: read("approved_signoff", 120),
    refused_heading: read("refused_heading", 200),
    refused_body: read("refused_body", 4000),
    refused_signoff: read("refused_signoff", 120),
  };

  for (const [label, value] of [
    ["approval heading", fields.approved_heading],
    ["approval message", fields.approved_body],
    ["refusal heading", fields.refused_heading],
    ["refusal message", fields.refused_body],
  ] as const) {
    if (!value) return { error: `The ${label} cannot be empty.` };
  }

  // A placeholder nobody spelled correctly renders as literal text on a
  // student's screen, which is the one place it must never appear.
  const stray = `${fields.approved_heading} ${fields.approved_body} ${fields.refused_heading} ${fields.refused_body}`
    .match(/\{[^}]*\}/g)
    ?.filter((m) => m !== "{name}" && m !== "{country}");
  if (stray?.length) {
    return {
      error: `${stray[0]} is not something that can be filled in — only {name} and {country} are, and a student would read it exactly as written.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("visa_messages")
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That change was refused — you may not have permission for it." };

  revalidatePath(PAGE);
  revalidatePath("/portal/visa");
  return { success: true };
}
