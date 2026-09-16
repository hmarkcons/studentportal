"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { translateScholarshipValues } from "@/lib/translateScholarship";
import { currentAcademicYear } from "@/lib/academicYear";
import {
  PROPOSABLE_FIELDS,
  researchConfigured,
  testResearchConnection,
  type ProposableField,
} from "@/lib/scholarshipResearch";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScholarshipCheck } from "@/lib/scholarshipCheckRunner";

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

  // A proposal read off an Italian bando comes back in whatever language the
  // bando was written in. Put it into English on the way in, so the office
  // never has to think about which pages are translated and which are not.
  const englished = await translateScholarshipValues(patch);
  for (const [key, value] of Object.entries(englished.values)) patch[key] = value;
  if (englished.changed.length > 0) {
    patch.original_text = englished.original;
    patch.translated_at = new Date().toISOString();
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

/**
 * Applies several proposals in one press.
 *
 * A sweep of twenty-one bodies that gets twenty of them right is twenty
 * separate presses, and the office asked not to do that. What this is not is
 * "accept everything": each entry carries the fields that are still ticked on
 * its own card, so a field somebody deliberately unticked because it looked
 * wrong stays unticked here too. That is the whole reason the per-field
 * choice exists, and a bulk button that ignored it would quietly undo it.
 *
 * Runs one body at a time and reports each outcome rather than stopping at
 * the first failure: nineteen applied and two named is a useful answer, and
 * "it failed" after nineteen silent successes is not.
 */
export async function applyScholarshipProposals(
  entries: { runId: string; fields: string[] }[]
): Promise<{
  applied: { runId: string; fields: number }[];
  failed: { runId: string; error: string }[];
  skipped: string[];
}> {
  const error = await gate();
  if (error) return { applied: [], failed: [{ runId: "", error }], skipped: [] };

  const applied: { runId: string; fields: number }[] = [];
  const failed: { runId: string; error: string }[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    // Nothing ticked is a deliberate "not this one", not an error.
    if (entry.fields.length === 0) {
      skipped.push(entry.runId);
      continue;
    }
    const result = await applyScholarshipProposal(entry.runId, entry.fields);
    if (result && "error" in result && result.error) {
      failed.push({ runId: entry.runId, error: result.error });
    } else {
      applied.push({ runId: entry.runId, fields: result?.applied ?? entry.fields.length });
    }
  }

  revalidatePath(PAGE);
  return { applied, failed, skipped };
}

/**
 * Takes the next queued body, reads its call, and records the outcome.
 *
 * One at a time and called from the browser in a loop: a serverless function
 * here is capped at sixty seconds and reading one regional site takes most of
 * that, so a batch would be killed halfway through with rows left claimed.
 *
 * Returns what happened and whether anything is left, so the caller knows
 * whether to come round again.
 */
export async function processNextScholarshipUpdate(): Promise<
  { error: string } | { done: true; remaining: 0 } | { done: false; body: string; outcome: string; remaining: number }
> {
  const error = await gate();
  if (error) return { error };

  if (!researchConfigured()) {
    return { error: "ANTHROPIC_API_KEY is not set in this environment, so no call can be read." };
  }

  const admin = createAdminClient();

  // Anything claimed and never finished — a function that died mid-read — is
  // released, or the one-live-request index blocks that body forever.
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("scholarship_body_update_runs")
    .update({ status: "failed", error: "The check did not finish — try again.", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", stale);

  const { data: next } = await admin
    .from("scholarship_body_update_runs")
    .select("id, scholarship_body_id, academic_year")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return { done: true, remaining: 0 };

  // Claimed conditionally, so two tabs cannot both take the same row.
  const { data: claimed } = await admin
    .from("scholarship_body_update_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed?.length) {
    const { count } = await admin
      .from("scholarship_body_update_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");
    return { done: false, body: "", outcome: "taken by another tab", remaining: count ?? 0 };
  }

  const outcome = await runScholarshipCheck(admin, next.id, next.scholarship_body_id, next.academic_year);

  const { count } = await admin
    .from("scholarship_body_update_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  revalidatePath(PAGE);
  return { done: false, body: outcome.body, outcome: outcome.result, remaining: count ?? 0 };
}

/** Checks the research key before anybody spends a sweep finding out. */
export async function testScholarshipResearch() {
  const error = await gate();
  if (error) return { error };
  const result = await testResearchConnection();
  return result.ok ? { success: true, model: result.model } : { error: result.error };
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
