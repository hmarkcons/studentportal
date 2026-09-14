"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Ticks or unticks one arrival step for the signed-in student.
 *
 * The student is resolved from the session rather than passed in: a student id
 * arriving from the browser would let anyone tick anyone's checklist, and this
 * is the one action on the page a student can take.
 */
export async function setTravelItemDone(itemId: string, done: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are signed out — reload the page." };

  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!student) return { error: "That account is not linked to a student record." };

  if (done) {
    const { error } = await supabase
      .from("student_travel_checks")
      .upsert({ student_id: student.id, item_id: itemId }, { onConflict: "student_id,item_id" });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("student_travel_checks")
      .delete()
      .eq("student_id", student.id)
      .eq("item_id", itemId);
    if (error) return { error: error.message };
  }

  revalidatePath("/portal/travel");
  return { success: true };
}

type IncomingItem = { id?: string; label?: unknown; detail?: unknown; daysAfterArrival?: unknown };
type IncomingSection = { id?: string; title?: unknown; intro?: unknown; items?: unknown };

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Saves one destination's travel & arrival guide.
 *
 * Ids travel with the payload and are kept, because a student's ticks are keyed
 * to the item: re-wording "Apply for your permesso di soggiorno" must not wipe
 * the tick of everyone who has already done it. Deleting an item does take its
 * ticks with it, which is correct and is said out loud in the editor.
 *
 * The whole list arrives as one JSON field rather than repeated inputs, so a
 * reorder cannot split a label from the section it belongs to.
 */
export async function saveTravelGuide(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "settings.travel_guide",
    "Only Processing, Management and Super Admin can edit the travel guides."
  );
  if (denied) return { error: denied.error };

  const destinationId = String(formData.get("destination_id") ?? "");
  if (!destinationId) return { error: "Pick a destination first." };

  let incoming: IncomingSection[];
  try {
    const parsed = JSON.parse(String(formData.get("sections") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("not a list");
    incoming = parsed as IncomingSection[];
  } catch {
    return { error: "That guide could not be read. Reload the page and try again." };
  }

  const sections = incoming.map((s) => ({
    id: typeof s.id === "string" && s.id ? s.id : randomUUID(),
    existing: typeof s.id === "string" && Boolean(s.id),
    title: text(s.title, 160),
    intro: text(s.intro, 1000) || null,
    items: (Array.isArray(s.items) ? (s.items as IncomingItem[]) : []).map((i) => {
      const days = Number(i.daysAfterArrival);
      return {
        id: typeof i.id === "string" && i.id ? i.id : randomUUID(),
        label: text(i.label, 300),
        detail: text(i.detail, 1000) || null,
        // Counted from the day they land. Blank means "no deadline", which is
        // different from day zero, so an empty box must not become 0.
        days_after_arrival:
          i.daysAfterArrival === "" || i.daysAfterArrival == null || !Number.isFinite(days)
            ? null
            : Math.max(0, Math.min(365, Math.round(days))),
      };
    }),
  }));

  for (const s of sections) {
    if (!s.title) return { error: "Every section needs a heading." };
    if (s.items.length === 0) return { error: `“${s.title}” has no steps in it — add one, or remove the section.` };
    for (const i of s.items) {
      if (!i.label) return { error: `A step under “${s.title}” is blank. Give it a label or remove it.` };
    }
  }

  const supabase = await createClient();

  // Anything the editor no longer lists is gone. Section deletes cascade to
  // their items, and item deletes cascade to the ticks.
  const keptSectionIds = sections.map((s) => s.id);
  const { data: current } = await supabase
    .from("travel_guide_sections")
    .select("id")
    .eq("destination_id", destinationId);
  const removedSections = (current ?? []).map((r) => r.id as string).filter((id) => !keptSectionIds.includes(id));
  if (removedSections.length > 0) {
    const { error } = await supabase.from("travel_guide_sections").delete().in("id", removedSections);
    if (error) return { error: error.message };
  }

  if (sections.length > 0) {
    const { error } = await supabase.from("travel_guide_sections").upsert(
      sections.map((s, index) => ({
        id: s.id,
        destination_id: destinationId,
        title: s.title,
        intro: s.intro,
        sort_order: (index + 1) * 10,
        updated_at: new Date().toISOString(),
      }))
    );
    // An upsert that writes nothing back is RLS refusing it, not a no-op.
    if (error) return { error: error.message };
  }

  for (const s of sections) {
    const keptItemIds = s.items.map((i) => i.id);
    const { data: currentItems } = await supabase.from("travel_guide_items").select("id").eq("section_id", s.id);
    const removedItems = (currentItems ?? []).map((r) => r.id as string).filter((id) => !keptItemIds.includes(id));
    if (removedItems.length > 0) {
      const { error } = await supabase.from("travel_guide_items").delete().in("id", removedItems);
      if (error) return { error: error.message };
    }
    const { error } = await supabase.from("travel_guide_items").upsert(
      s.items.map((i, index) => ({
        id: i.id,
        section_id: s.id,
        label: i.label,
        detail: i.detail,
        days_after_arrival: i.days_after_arrival,
        sort_order: (index + 1) * 10,
        updated_at: new Date().toISOString(),
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/setup/travel-guide");
  revalidatePath("/portal/travel");
  return { success: true };
}
