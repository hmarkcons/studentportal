import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { researchBody, PROPOSABLE_FIELDS, type ProposableField } from "@/lib/scholarshipResearch";
import { currentAcademicYear } from "@/lib/academicYear";

/**
 * Reads one body's call and records what it found.
 *
 * Shared by the button and by the nightly cron, because two copies of this
 * would drift: the browser path would start proposing something the cron did
 * not, and which one ran would change what the office saw.
 *
 * Takes an already-claimed run — claiming is the caller's job, since only the
 * caller knows whether it is competing with another tab or another cron.
 */
export async function runScholarshipCheck(
  // The admin client, deliberately: this writes on behalf of a background job,
  // and the body being updated is not row-scoped to whoever pressed the button.
  admin: SupabaseClient,
  runId: string,
  bodyId: string,
  academicYear: string | null
): Promise<{ body: string; result: string }> {
  const { data: body } = await admin
    .from("scholarship_bodies")
    .select(
      "id, name, region, academic_year, application_deadline, apply_url, source_url, call_pdf_url, isee_threshold, ispe_threshold, stipend_amount, benefits, covers, guide_sections, destinations:scholarship_body_destinations(destination:destinations(country))"
    )
    .eq("id", bodyId)
    .maybeSingle();

  const finished_at = new Date().toISOString();

  if (!body) {
    await admin
      .from("scholarship_body_update_runs")
      .update({ status: "failed", error: "That scholarship body was deleted.", finished_at })
      .eq("id", runId);
    return { body: "Unknown body", result: "deleted" };
  }

  const country =
    (body.destinations ?? [])
      .map((d: { destination?: { country?: string } | { country?: string }[] }) =>
        Array.isArray(d.destination) ? d.destination[0]?.country : d.destination?.country
      )
      .filter(Boolean)[0] ?? "Italy";

  const current: Partial<Record<ProposableField, unknown>> = {};
  for (const f of PROPOSABLE_FIELDS) current[f] = (body as Record<string, unknown>)[f];

  const outcome = await researchBody(
    {
      name: body.name,
      region: body.region,
      country,
      sourceUrl: body.source_url,
      applyUrl: body.apply_url,
      academicYear: body.academic_year,
      covers: body.covers ?? [],
    },
    academicYear || currentAcademicYear(),
    current
  );

  const stamp = { last_checked_at: finished_at };

  if (outcome.state === "failed") {
    await admin
      .from("scholarship_body_update_runs")
      .update({ status: "failed", error: outcome.error, finished_at })
      .eq("id", runId);
    await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "failed" }).eq("id", body.id);
    return { body: body.name, result: `failed — ${outcome.error}` };
  }

  if (outcome.state === "awaiting") {
    await admin
      .from("scholarship_body_update_runs")
      .update({
        status: "awaiting",
        notes: outcome.notes,
        source_fingerprint: outcome.fingerprint,
        source_url: outcome.sources[0] ?? body.source_url,
        finished_at,
      })
      .eq("id", runId);
    // Recorded on the body itself, so the next person can see this is the
    // calendar rather than work nobody has done.
    await admin
      .from("scholarship_bodies")
      .update({
        ...stamp,
        last_check_result: "awaiting",
        call_status: "awaiting",
        call_expected_on: outcome.expectedOn,
        call_notes: outcome.notes || null,
      })
      .eq("id", body.id);
    return { body: body.name, result: outcome.expectedOn ? `call expected ${outcome.expectedOn}` : "call not published yet" };
  }

  // "Do not update it again unless there is a change in the call" is this
  // comparison: the fingerprint of what was read against the last time anyone
  // looked and settled it.
  const { data: lastSeen } = await admin
    .from("scholarship_body_update_runs")
    .select("source_fingerprint")
    .eq("scholarship_body_id", body.id)
    .in("status", ["applied", "dismissed", "no_change"])
    .not("source_fingerprint", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unchanged = lastSeen?.source_fingerprint === outcome.fingerprint;
  const nothingToSay = Object.keys(outcome.fields).length === 0;

  if (unchanged || nothingToSay) {
    await admin
      .from("scholarship_body_update_runs")
      .update({
        status: "no_change",
        notes: unchanged ? "The call has not changed since the last check." : outcome.notes,
        source_fingerprint: outcome.fingerprint,
        source_url: outcome.sources[0] ?? body.source_url,
        finished_at,
      })
      .eq("id", runId);
    await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "no_change" }).eq("id", body.id);
    return { body: body.name, result: "no change" };
  }

  // from/to on every field, so the review screen can show what is being
  // replaced rather than only what is being offered.
  const proposal: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(outcome.fields)) {
    proposal[field] = { from: (body as Record<string, unknown>)[field] ?? null, to };
  }

  await admin
    .from("scholarship_body_update_runs")
    .update({
      status: "proposed",
      proposal,
      notes: [outcome.notes, outcome.sources.length ? `Sources: ${outcome.sources.join(", ")}` : null]
        .filter(Boolean)
        .join("\n\n"),
      source_fingerprint: outcome.fingerprint,
      source_url: outcome.sources[0] ?? body.source_url,
      call_pdf_url: outcome.callPdfUrl,
      finished_at,
    })
    .eq("id", runId);
  await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "proposed" }).eq("id", body.id);

  const n = Object.keys(outcome.fields).length;
  return { body: body.name, result: `${n} change${n === 1 ? "" : "s"} proposed` };
}
