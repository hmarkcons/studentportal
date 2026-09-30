import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applicationStageLabel, isFinalizedStage } from "@/lib/finalizedStage";

/**
 * Pre-Enrolled and University Finalized say which university is finalized for
 * the visa, so they are reached by finalizing it, not picked from the stage
 * list — picked by hand on an application that is not finalized, they would
 * say something untrue. Shared with the partner portal's stage form.
 */
export async function refuseFinalizedStageByHand(
  supabase: SupabaseClient,
  applicationId: string,
  stage: string
): Promise<{ error: string } | null> {
  if (!isFinalizedStage(stage)) return null;
  const { data } = await supabase.from("applications").select("is_finalized").eq("id", applicationId).maybeSingle();
  if (data?.is_finalized) return null;
  return { error: `${applicationStageLabel(stage)} is reached by finalizing this university for the visa, not chosen from the list.` };
}
