"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Staff-only — students see the result read-only on their own portal
// dashboard, via a plain select query (no write action needed for them).
export async function setDashboardStageValue(
  leadId: string,
  destinationId: string,
  stageKey: string,
  revalidateTo: string,
  value: string | null
) {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("lead_destinations")
    .select("dashboard_stage_values")
    .eq("lead_id", leadId)
    .eq("destination_id", destinationId)
    .maybeSingle();

  const current = (row?.dashboard_stage_values as Record<string, string> | null) ?? {};
  const next = { ...current };
  if (value) next[stageKey] = value;
  else delete next[stageKey];

  // Many existing students have a real application to a destination with no
  // lead_destinations row at all (that table is only populated via the
  // Registration form's destination checkboxes, a separate, optional step)
  // — upsert instead of update so the first stage value staff sets doesn't
  // silently no-op against a row that was never created.
  const { error } = await supabase
    .from("lead_destinations")
    .upsert({ lead_id: leadId, destination_id: destinationId, dashboard_stage_values: next }, { onConflict: "lead_id,destination_id" });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
