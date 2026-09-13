"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { currentAcademicYear } from "@/lib/academicYear";
import { PROPOSABLE_FIELDS, type ProposableField } from "@/lib/scholarshipResearch";

const PAGE = "/setup/scholarship-bodies";
const DENIED = "Only Super Admin and the Processing team can manage scholarships.";

async function gate() {
  const denied = await requirePermission("scholarships.manage", DENIED);
  return denied ? denied.error : null;
}

/**
 * Asks for one or every body to be checked against its own website.
 *
 * Queued rather than done here: reading twenty-one regional sites takes far
 * longer than a request may live, and a button that appears to hang is a button
 * people press again.
 *
 * A body that already has a live request is skipped rather than queued twice —
 * the unique index in 0176 would refuse it anyway, and "already queued" is not
 * an error worth showing anybody.
 */
export async function requestScholarshipUpdate(bodyId: string | null) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const query = supabase.from("scholarship_bodies").select("id");
  const { data: bodies, error: readError } = bodyId ? await query.eq("id", bodyId) : await query;
  if (readError) return { error: readError.message };
  if (!bodies?.length) return { error: "No scholarship body to check." };

  const { data: live } = await supabase
    .from("scholarship_body_update_runs")
    .select("scholarship_body_id")
    .in("status", ["queued", "running", "proposed"]);
  const busy = new Set((live ?? []).map((r) => r.scholarship_body_id));

  const toQueue = bodies.filter((b) => !busy.has(b.id));
  if (toQueue.length === 0) {
    return { success: true, queued: 0, skipped: bodies.length };
  }

  const academic_year = currentAcademicYear();
  const { error: insertError } = await supabase.from("scholarship_body_update_runs").insert(
    toQueue.map((b) => ({
      scholarship_body_id: b.id,
      status: "queued",
      academic_year,
      requested_by: user?.id ?? null,
    }))
  );
  if (insertError) return { error: insertError.message };

  revalidatePath(PAGE);
  return { success: true, queued: toQueue.length, skipped: bodies.length - toQueue.length };
}

/**
 * Accepts a proposal, writing its fields onto the body.
 *
 * The field list is re-derived from PROPOSABLE_FIELDS rather than taken from
 * the stored proposal, so a row that somehow carried an unexpected key cannot
 * reach into a column a run was never allowed to touch.
 */
export async function applyScholarshipProposal(runId: string, acceptedFields: string[]) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: run } = await supabase
    .from("scholarship_body_update_runs")
    .select("id, scholarship_body_id, status, proposal, call_pdf_url, academic_year")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { error: "That update run no longer exists." };
  if (run.status !== "proposed") return { error: "That run has already been dealt with." };

  const proposal = (run.proposal ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const accepted = new Set(acceptedFields);
  const patch: Record<string, unknown> = {};

  for (const field of PROPOSABLE_FIELDS) {
    if (!accepted.has(field)) continue;
    const change = proposal[field as ProposableField];
    if (!change) continue;
    patch[field] = change.to;
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Nothing was selected to apply." };
  }

  // Accepting a proposal is a person confirming the guide for this year, which
  // is exactly what guide_updated_at records.
  patch.guide_updated_at = new Date().toISOString();
  patch.guide_updated_by = user?.id ?? null;
  patch.call_status = "published";
  patch.call_expected_on = null;
  if (run.call_pdf_url) patch.call_pdf_url = run.call_pdf_url;

  const { error: updateError } = await supabase
    .from("scholarship_bodies")
    .update(patch)
    .eq("id", run.scholarship_body_id);
  if (updateError) return { error: updateError.message };

  await supabase
    .from("scholarship_body_update_runs")
    .update({ status: "applied", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", runId);

  revalidatePath(PAGE);
  return { success: true, applied: Object.keys(patch).length };
}

/** Rejects a proposal. The reading is kept, so the next run can tell it has seen this call. */
export async function dismissScholarshipProposal(runId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error: updateError } = await supabase
    .from("scholarship_body_update_runs")
    .update({ status: "dismissed", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["proposed", "failed", "awaiting", "no_change"])
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!data?.length) return { error: "That run has already been dealt with." };

  revalidatePath(PAGE);
  return { success: true };
}
