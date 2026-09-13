import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest, CRON_OPEN_WARNING } from "@/lib/cronAuth";
import { researchBody, researchConfigured, PROPOSABLE_FIELDS, type ProposableField } from "@/lib/scholarshipResearch";
import { currentAcademicYear } from "@/lib/academicYear";

// Reading a regional website takes tens of seconds, so the queue is drained a
// few at a time rather than all at once: a run that overshoots the function's
// own lifetime would leave rows stuck in 'running' with nothing to finish them.
const BATCH = 3;
export const maxDuration = 300;

export async function GET(request: Request) {
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const auth = checkCronRequest(request, { dryRun });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!researchConfigured()) {
    // Said rather than failed quietly: the queue would otherwise fill up with
    // rows nothing was ever going to process.
    return NextResponse.json(
      { skipped: true, reason: "ANTHROPIC_API_KEY is not set, so no scholarship call can be read." },
      { status: 200 }
    );
  }

  const admin = createAdminClient();

  // Anything left 'running' for over twenty minutes was in a function that
  // died; without this the unique index blocks that body forever.
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await admin
    .from("scholarship_body_update_runs")
    .update({ status: "failed", error: "The check did not finish — try again.", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", stale);

  const { data: queued } = await admin
    .from("scholarship_body_update_runs")
    .select("id, scholarship_body_id, academic_year")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(BATCH);

  if (!queued?.length) return NextResponse.json({ processed: 0, ...(auth.secretConfigured ? {} : { warning: CRON_OPEN_WARNING }) });

  if (dryRun) {
    return NextResponse.json({ dryRun: true, wouldProcess: queued.length });
  }

  const results: Record<string, string> = {};

  for (const run of queued) {
    // Claimed conditionally, so two overlapping cron runs cannot both take the
    // same row.
    const { data: claimed } = await admin
      .from("scholarship_body_update_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) continue;

    const { data: body } = await admin
      .from("scholarship_bodies")
      .select(
        "id, name, region, academic_year, application_deadline, apply_url, source_url, call_pdf_url, isee_threshold, ispe_threshold, stipend_amount, benefits, covers, guide_sections, destinations:scholarship_body_destinations(destination:destinations(country))"
      )
      .eq("id", run.scholarship_body_id)
      .maybeSingle();

    if (!body) {
      await admin
        .from("scholarship_body_update_runs")
        .update({ status: "failed", error: "That scholarship body was deleted.", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      continue;
    }

    const country =
      (body.destinations ?? [])
        .map((d: { destination?: { country?: string } | { country?: string }[] }) =>
          Array.isArray(d.destination) ? d.destination[0]?.country : d.destination?.country
        )
        .filter(Boolean)[0] ?? "Italy";

    const current: Partial<Record<ProposableField, unknown>> = {};
    for (const f of PROPOSABLE_FIELDS) current[f] = (body as Record<string, unknown>)[f];

    const year = run.academic_year || currentAcademicYear();
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
      year,
      current
    );

    const finished_at = new Date().toISOString();
    const stamp = { last_checked_at: finished_at };

    if (outcome.state === "failed") {
      await admin
        .from("scholarship_body_update_runs")
        .update({ status: "failed", error: outcome.error, finished_at })
        .eq("id", run.id);
      await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "failed" }).eq("id", body.id);
      results[body.name] = "failed";
      continue;
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
        .eq("id", run.id);
      // The body itself is marked as waiting, with the date to come back on —
      // that is the difference between work nobody has done and a call the
      // region has not published.
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
      results[body.name] = outcome.expectedOn ? `call expected ${outcome.expectedOn}` : "call not published yet";
      continue;
    }

    // Nothing has moved since the last look: "do not update it again unless
    // there is a change in the call" is this branch.
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
        .eq("id", run.id);
      await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "no_change" }).eq("id", body.id);
      results[body.name] = "no change";
      continue;
    }

    // from/to on every field, so the review screen can show what it is
    // replacing rather than only what it wants to put there.
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
      .eq("id", run.id);
    await admin.from("scholarship_bodies").update({ ...stamp, last_check_result: "proposed" }).eq("id", body.id);
    results[body.name] = `${Object.keys(outcome.fields).length} changes proposed`;
  }

  return NextResponse.json({
    processed: Object.keys(results).length,
    results,
    ...(auth.secretConfigured ? {} : { warning: CRON_OPEN_WARNING }),
  });
}
