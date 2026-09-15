"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

const PAGE = "/setup/visa-page-builder";
const AUDIENCES = ["student", "staff", "both"] as const;

async function gate() {
  const denied = await requirePermission(
    "settings.visa_page",
    "Only Management and Super Admin can build the visa page."
  );
  return denied ? denied.error : null;
}

function readSection(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const audienceRaw = String(formData.get("audience") ?? "both");
  return {
    title: String(formData.get("title") ?? "").trim(),
    body: text("body"),
    link_label: text("link_label"),
    link_url: text("link_url"),
    audience: (AUDIENCES as readonly string[]).includes(audienceRaw) ? audienceRaw : "both",
    sort_order: Number(formData.get("sort_order") ?? 0) || 0,
    // Saved hidden by default is wrong — somebody writing a section means it
    // to appear. Hiding is a deliberate separate action.
    status: formData.get("hidden") === "on" ? "hidden" : "active",
  };
}

/**
 * Adds a section to one country's visa page, or to every country's.
 *
 * destinationId null is "shared": it shows for every destination including
 * ones added later, which is the point — a rule that applies everywhere
 * should not need re-typing when a country is added.
 */
export async function createVisaSection(destinationId: string | null, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };

  const payload = readSection(formData);
  if (!payload.title) return { error: "Give the section a title." };
  if (payload.link_url && !payload.link_label) {
    // A bare URL as a link with no words is a link nobody clicks.
    return { error: "Give the link something to say, or clear the address." };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("visa_page_sections")
    .insert({ ...payload, destination_id: destinationId });
  if (insertError) return { error: insertError.message };

  revalidatePath(PAGE);
  return { success: true };
}

export async function updateVisaSection(sectionId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };

  const payload = readSection(formData);
  if (!payload.title) return { error: "Give the section a title." };
  if (payload.link_url && !payload.link_label) {
    return { error: "Give the link something to say, or clear the address." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("visa_page_sections").update(payload).eq("id", sectionId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}

/** Takes a section off the page without losing what it said. */
export async function setVisaSectionHidden(sectionId: string, hidden: boolean) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("visa_page_sections")
    .update({ status: hidden ? "hidden" : "active" })
    .eq("id", sectionId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}

/**
 * Deletes a section outright.
 *
 * Offered as well as hiding because a section written for a country the office
 * no longer sends students to is clutter, not history — unlike a visa office,
 * nothing else refers to it.
 */
export async function deleteVisaSection(sectionId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("visa_page_sections").delete().eq("id", sectionId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(PAGE);
  return { success: true };
}

/** Moves a section up or down among its siblings. */
export async function moveVisaSection(sectionId: string, direction: "up" | "down") {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { data: section } = await supabase
    .from("visa_page_sections")
    .select("id, destination_id, sort_order")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return { error: "That section is already gone." };

  // Its siblings are the ones sharing its scope — a shared section reorders
  // among shared sections, not among Italy's.
  const query = supabase.from("visa_page_sections").select("id, sort_order").order("sort_order");
  const { data: siblings } =
    section.destination_id === null
      ? await query.is("destination_id", null)
      : await query.eq("destination_id", section.destination_id);

  const ordered = siblings ?? [];
  const index = ordered.findIndex((s) => s.id === sectionId);
  const swapWith = direction === "up" ? ordered[index - 1] : ordered[index + 1];
  if (!swapWith) return { success: true };

  // Positions are rewritten across the whole group rather than swapped: rows
  // left at 0 by an import would otherwise swap nothing and look broken.
  const reordered = [...ordered];
  reordered.splice(index, 1);
  reordered.splice(direction === "up" ? index - 1 : index + 1, 0, ordered[index]);
  for (let i = 0; i < reordered.length; i++) {
    await supabase.from("visa_page_sections").update({ sort_order: i * 10 }).eq("id", reordered[i].id);
  }

  revalidatePath(PAGE);
  return { success: true };
}

/**
 * A country's own wording for the approved and refused messages.
 *
 * Every field is optional and a blank one falls back to the shared wording, so
 * an override that only changes the refusal heading leaves everything else
 * exactly as it was.
 */
export async function saveVisaMessageOverride(destinationId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };

  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const payload = {
    destination_id: destinationId,
    approved_heading: text("approved_heading"),
    approved_body: text("approved_body"),
    approved_signoff: text("approved_signoff"),
    refused_heading: text("refused_heading"),
    refused_body: text("refused_body"),
    refused_signoff: text("refused_signoff"),
  };

  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("visa_destination_messages")
    .upsert(payload, { onConflict: "destination_id" });
  if (upsertError) return { error: upsertError.message };

  revalidatePath(PAGE);
  return { success: true };
}

/** Drops a country's override so it reads the shared wording again. */
export async function clearVisaMessageOverride(destinationId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("visa_destination_messages")
    .delete()
    .eq("destination_id", destinationId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(PAGE);
  return { success: true };
}
