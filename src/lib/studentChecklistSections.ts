// The sections a given student's Documents tab should show, in the order the
// Create Doc Checklist builder put them.
//
// A student can be pursuing more than one destination, so this is the union of
// their destinations' sections plus the shared ones. Where two destinations
// place the same section differently, the earlier position wins — a section
// that is second for Italy and fifth for Germany reads better second than
// buried.

import type { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documentCategories";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ChecklistSectionRef = { key: string; label: string };

const FALLBACK: ChecklistSectionRef[] = CATEGORY_ORDER.map((c) => ({
  key: c as string,
  label: CATEGORY_LABELS[c] ?? (c as string),
}));

export async function loadStudentChecklistSections(
  supabase: Client,
  studentId: string
): Promise<ChecklistSectionRef[]> {
  const [{ data: destRows }, { data: sections }] = await Promise.all([
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId),
    supabase.from("document_sections").select("key, label"),
  ]);

  const destinationIds = new Set((destRows ?? []).map((d) => d.destination_id as string));
  const { data: destinationSections } = await supabase
    .from("destination_document_sections")
    .select("destination_id, section_key, sort_order");

  const labelOf = new Map((sections ?? []).map((s) => [s.key, s.label]));

  const best = new Map<string, number>();
  for (const row of destinationSections ?? []) {
    // Shared sections (destination_id null) always apply; a destination's own
    // only if the student is pursuing it.
    if (row.destination_id !== null && !destinationIds.has(row.destination_id)) continue;
    const current = best.get(row.section_key);
    if (current === undefined || row.sort_order < current) best.set(row.section_key, row.sort_order);
  }

  // Nothing configured — a student with no destinations yet, or a database
  // where 0137 has not run. Fall back to the built-in order rather than
  // rendering a documents tab with no sections at all.
  if (best.size === 0) return FALLBACK;

  const ordered = [...best.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([key]) => ({ key, label: labelOf.get(key) ?? CATEGORY_LABELS[key] ?? key }));

  // "Other" is where a requirement filed under an unconfigured section lands,
  // so it is always available as a home for one.
  if (!ordered.some((o) => o.key === "other")) {
    ordered.push({ key: "other", label: labelOf.get("other") ?? CATEGORY_LABELS.other ?? "Other" });
  }

  return ordered;
}
