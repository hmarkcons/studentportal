import type { SupabaseClient } from "@supabase/supabase-js";
import { orderCycles, resolveCycleDocuments, type Cycle } from "@/lib/intakeCycle";

/**
 * A student's documents for one intake, as their Documents page lists them.
 *
 * A student who has gone round the process more than once has a tab per
 * intake; the rows shown for one are that intake's, plus anything approved
 * for an earlier one that carries over (resolveCycleDocuments). Shared by the
 * Documents page and the dashboard, so "8 of 12 approved" on one is the same
 * eight and twelve on the other.
 *
 * `cycleParam` picks an intake; without one it is the current intake.
 */
export async function loadCycleDocuments(supabase: SupabaseClient, studentId: string, cycleParam?: string | null) {
  const [{ data: cycleRows }, { data: renewTemplates }, { data: allDocs }] = await Promise.all([
    supabase.from("student_cycles").select("id, sequence, intake, is_current").eq("student_id", studentId).order("sequence"),
    supabase.from("document_templates").select("id").eq("renew_each_intake", true),
    supabase
      .from("student_documents")
      .select(
        "id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, uploaded_at, uploaded_by_role, verified_at, created_at, template_id, derived_key, cycle_id, template:document_templates(name)"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
  ]);

  const cycles = orderCycles((cycleRows ?? []) as Cycle[]);
  const showCycleTabs = cycles.length > 1;
  const currentCycleId = cycles.find((c) => c.is_current)?.id ?? cycles[0]?.id ?? null;
  const activeCycleId =
    showCycleTabs && cycleParam && cycles.some((c) => c.id === cycleParam) ? cycleParam : currentCycleId;
  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null;
  const isPreviousIntake = Boolean(activeCycle && !activeCycle.is_current);

  let docs = allDocs ?? [];
  const inheritedFromById = new Map<string, number | null>();
  if (showCycleTabs && activeCycleId) {
    const resolved = resolveCycleDocuments(
      docs.map((d) => ({
        id: d.id,
        cycle_id: d.cycle_id,
        category: d.category ?? null,
        template_id: d.template_id ?? null,
        derived_key: d.derived_key ?? null,
        status: d.status,
      })),
      activeCycleId,
      new Map(cycles.map((c) => [c.id, c.sequence])),
      new Set((renewTemplates ?? []).map((t) => t.id as string))
    );
    const keep = new Map(resolved.map((r) => [r.doc.id, r.inheritedFrom]));
    for (const [docId, from] of keep) inheritedFromById.set(docId, from);
    docs = docs.filter((d) => keep.has(d.id));
  }

  return { docs, cycles, showCycleTabs, activeCycleId, activeCycle, isPreviousIntake, inheritedFromById };
}

/** The four numbers the Documents page heads with and the dashboard's ring draws. */
export function documentCounts(docs: readonly { status: string }[]) {
  return {
    total: docs.length,
    verified: docs.filter((d) => d.status === "verified").length,
    waiting: docs.filter((d) => d.status === "missing" || d.status === "rejected").length,
    inReview: docs.filter((d) => d.status === "submitted" || d.status === "under_review").length,
  };
}
