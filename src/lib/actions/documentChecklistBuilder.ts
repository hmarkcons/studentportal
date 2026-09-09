"use server";

// Create Doc Checklist (Setup) — the write side.
//
// Everything here edits the CATALOGUE: which sections a destination's
// checklist has, in what order, and which requirements sit in each. It never
// touches a student's uploaded document.
//
// It does retract requirements from students, though, and that is deliberate:
// removing "Police clearance" from Italy is pointless if forty Italian
// students go on being asked for it. The rule is the one used everywhere else
// in this codebase — a requirement with nothing uploaded against it is
// removed, and one carrying a file is always kept, because the student sent
// that document in and deleting the row would put the file out of reach.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

const REVALIDATE = "/setup/create-doc-checklist";
const DENIED = "Only Super Admin and the Processing team can edit document checklists.";

async function gate() {
  const denied = await requirePermission("document_checklist.manage", DENIED);
  return denied ? denied.error : null;
}

/** A section key derived from its label: lowercase, underscores, no surprises. */
function toKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Stops asking students for the given requirements, without destroying
 * anything they have already sent. Returns how many rows were retracted and
 * how many were kept because a file was attached, so the caller can say so.
 */
async function retractFromStudents(supabase: Client, templateIds: string[]) {
  if (templateIds.length === 0) return { retracted: 0, keptWithFile: 0 };

  const { data: rows } = await supabase
    .from("student_documents")
    .select("id, file_path")
    .in("template_id", templateIds);

  const empty = (rows ?? []).filter((r) => !r.file_path).map((r) => r.id);
  const keptWithFile = (rows ?? []).length - empty.length;

  if (empty.length > 0) {
    // Chunked: a destination with many students can exceed what one URL-encoded
    // `in` filter will carry.
    for (let i = 0; i < empty.length; i += 100) {
      const { error } = await supabase.from("student_documents").delete().in("id", empty.slice(i, i + 100));
      if (error) return { error: error.message, retracted: 0, keptWithFile };
    }
  }

  // A kept row would still point at a template about to be deleted, and that
  // FK is ON DELETE NO ACTION — so the name is copied onto the row first,
  // otherwise the delete fails and the row would read as nameless if it did not.
  if (keptWithFile > 0) {
    const keep = (rows ?? []).filter((r) => r.file_path).map((r) => r.id);
    const { data: templates } = await supabase.from("document_templates").select("id, name").in("id", templateIds);
    const nameOf = new Map((templates ?? []).map((t) => [t.id, t.name]));
    const { data: keepRows } = await supabase.from("student_documents").select("id, template_id, custom_name").in("id", keep);
    for (const r of keepRows ?? []) {
      await supabase
        .from("student_documents")
        .update({ custom_name: r.custom_name ?? nameOf.get(r.template_id as string) ?? "Document", template_id: null })
        .eq("id", r.id);
    }
  }

  return { retracted: empty.length, keptWithFile };
}

// ------------------------------------------------------------- the palette

export async function createSection(_prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Give the section a name." };

  const key = toKey(label);
  if (!key) return { error: "That name has no letters or numbers in it — try another." };

  const { data: clash } = await supabase.from("document_sections").select("key, label").eq("key", key).maybeSingle();
  if (clash) return { error: `"${clash.label}" already uses that name.` };

  const { data: last } = await supabase
    .from("document_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insertError } = await supabase
    .from("document_sections")
    .insert({ key, label, is_predefined: false, sort_order: (last?.sort_order ?? 0) + 10 });
  if (insertError) return { error: insertError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function renameSection(sectionKey: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Give the section a name." };

  // The key is left alone on purpose: it is what document_templates.category
  // and every student_documents row already store, so renaming the label is
  // safe while changing the key would orphan them.
  const { error: updateError } = await supabase.from("document_sections").update({ label }).eq("key", sectionKey);
  if (updateError) return { error: updateError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteSection(sectionKey: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { data: section } = await supabase
    .from("document_sections")
    .select("key, label, is_predefined")
    .eq("key", sectionKey)
    .maybeSingle();
  if (!section) return { error: "That section no longer exists." };
  if (section.is_predefined) {
    return {
      error: `"${section.label}" is a built-in section and stays in the palette. Remove it from a destination's checklist instead.`,
    };
  }

  const { count } = await supabase
    .from("document_templates")
    .select("id", { count: "exact", head: true })
    .eq("category", sectionKey);
  if ((count ?? 0) > 0) {
    return { error: `"${section.label}" still holds ${count} requirement(s). Remove those first.` };
  }

  const { error: deleteError } = await supabase.from("document_sections").delete().eq("key", sectionKey);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

// ------------------------------------------- sections on one destination

/** The drop target: puts a palette section into this destination's checklist. */
export async function addSectionToDestination(destinationId: string | null, sectionKey: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  // `is null` and `eq` are different filters, so the All-destinations case is
  // built explicitly rather than trying to express both in one call.
  let lookup = supabase.from("destination_document_sections").select("id").eq("section_key", sectionKey);
  lookup = destinationId === null ? lookup.is("destination_id", null) : lookup.eq("destination_id", destinationId);
  const { data: dup } = await lookup.maybeSingle();
  if (dup) return { error: "That section is already on this checklist." };

  const { data: last } = await supabase
    .from("destination_document_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insertError } = await supabase
    .from("destination_document_sections")
    .insert({ destination_id: destinationId, section_key: sectionKey, sort_order: (last?.sort_order ?? 0) + 10 });
  if (insertError) return { error: insertError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

/**
 * Takes a whole section off one destination's checklist.
 *
 * The destination's own requirements in that section go with it — leaving them
 * in the database, invisible and still seeded to students, is the kind of
 * hidden state that turns into a bug report. Shared requirements are untouched
 * and simply stop appearing for this destination.
 */
export async function removeSectionFromDestination(destinationId: string | null, sectionKey: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  let owned = supabase.from("document_templates").select("id").eq("category", sectionKey);
  owned = destinationId === null ? owned.is("destination_id", null) : owned.eq("destination_id", destinationId);
  const { data: ownTemplates } = await owned;
  const ownIds = (ownTemplates ?? []).map((t) => t.id);

  const retraction = await retractFromStudents(supabase, ownIds);
  if ("error" in retraction && retraction.error) return { error: retraction.error };

  if (ownIds.length > 0) {
    const { error: deleteError } = await supabase.from("document_templates").delete().in("id", ownIds);
    if (deleteError) return { error: deleteError.message };
  }

  let removal = supabase.from("destination_document_sections").delete().eq("section_key", sectionKey);
  removal = destinationId === null ? removal.is("destination_id", null) : removal.eq("destination_id", destinationId);
  const { error: sectionError } = await removal;
  if (sectionError) return { error: sectionError.message };

  revalidatePath(REVALIDATE);
  return { success: true, ...retraction };
}

export async function reorderDestinationSections(destinationId: string | null, orderedKeys: string[]) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  for (let i = 0; i < orderedKeys.length; i++) {
    let q = supabase
      .from("destination_document_sections")
      .update({ sort_order: (i + 1) * 10 })
      .eq("section_key", orderedKeys[i]);
    q = destinationId === null ? q.is("destination_id", null) : q.eq("destination_id", destinationId);
    const { error: updateError } = await q;
    if (updateError) return { error: updateError.message };
  }

  revalidatePath(REVALIDATE);
  return { success: true };
}

// -------------------------------------------------------------- the items

export async function addChecklistItem(
  destinationId: string | null,
  sectionKey: string,
  _prevState: unknown,
  formData: FormData
) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the requirement a name." };
  const description = String(formData.get("description") ?? "").trim() || null;
  const required = formData.get("required") !== "off";
  const level = String(formData.get("level") ?? "all");

  const { data: last } = await supabase
    .from("document_templates")
    .select("sort_order")
    .eq("category", sectionKey)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insertError } = await supabase.from("document_templates").insert({
    destination_id: destinationId,
    category: sectionKey,
    name,
    description,
    required,
    level,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function updateChecklistItem(templateId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the requirement a name." };

  const { error: updateError } = await supabase
    .from("document_templates")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      required: formData.get("required") !== "off",
      level: String(formData.get("level") ?? "all"),
    })
    .eq("id", templateId);
  if (updateError) return { error: updateError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteChecklistItem(templateId: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const retraction = await retractFromStudents(supabase, [templateId]);
  if ("error" in retraction && retraction.error) return { error: retraction.error };

  const { error: deleteError } = await supabase.from("document_templates").delete().eq("id", templateId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(REVALIDATE);
  return { success: true, ...retraction };
}

/**
 * Drops a shared requirement from one destination only.
 *
 * A shared item belongs to the All-destinations list, so it cannot be deleted
 * from a country without taking it away from every other one. This records
 * that this destination does not ask for it.
 */
export async function excludeSharedItem(destinationId: string, templateId: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { error: insertError } = await supabase
    .from("destination_document_exclusions")
    .insert({ destination_id: destinationId, template_id: templateId });
  if (insertError && insertError.code !== "23505") return { error: insertError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function includeSharedItem(destinationId: string, templateId: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("destination_document_exclusions")
    .delete()
    .eq("destination_id", destinationId)
    .eq("template_id", templateId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

/**
 * Writes a new order for the requirements in one section.
 *
 * sort_order lives on the requirement itself, so reordering a SHARED
 * requirement changes its position for every destination. That follows from
 * shared items being edited in one place, which is the model chosen for this
 * builder — the UI says so next to any shared row rather than letting it
 * surprise anyone.
 */
export async function reorderChecklistItems(orderedIds: string[]) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error: updateError } = await supabase
      .from("document_templates")
      .update({ sort_order: i + 1 })
      .eq("id", orderedIds[i]);
    if (updateError) return { error: updateError.message };
  }

  revalidatePath(REVALIDATE);
  return { success: true };
}
