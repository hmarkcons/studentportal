import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest, CRON_OPEN_WARNING } from "@/lib/cronAuth";
import { researchConfigured } from "@/lib/scholarshipResearch";
import { runScholarshipCheck } from "@/lib/scholarshipCheckRunner";

// A backstop, not the main path. The button drains the queue from the browser
// one body at a time, which is the only way to get an answer in under a minute
// on a plan whose crons run once a day. This picks up whatever was still
// queued when somebody closed the tab.
//
// One body per run because a function here is capped at sixty seconds and
// reading one regional site takes most of that; a batch would be killed
// halfway through with rows left claimed.
export const maxDuration = 60;

export async function GET(request: Request) {
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const auth = checkCronRequest(request, { dryRun });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!researchConfigured()) {
    // Said rather than failed quietly: the queue would otherwise fill with
    // rows nothing was ever going to process.
    return NextResponse.json(
      { skipped: true, reason: "ANTHROPIC_API_KEY is not set, so no scholarship call can be read." },
      { status: 200 }
    );
  }

  const admin = createAdminClient();

  // Anything left claimed by a function that died, or the one-live-request
  // index blocks that body forever.
  const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
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

  const openWarning = auth.secretConfigured ? {} : { warning: CRON_OPEN_WARNING };
  if (!next) return NextResponse.json({ processed: 0, ...openWarning });
  if (dryRun) return NextResponse.json({ dryRun: true, wouldProcess: 1, ...openWarning });

  const { data: claimed } = await admin
    .from("scholarship_body_update_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed?.length) return NextResponse.json({ processed: 0, note: "already claimed", ...openWarning });

  const outcome = await runScholarshipCheck(admin, next.id, next.scholarship_body_id, next.academic_year);

  const { count } = await admin
    .from("scholarship_body_update_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return NextResponse.json({ processed: 1, body: outcome.body, result: outcome.result, remaining: count ?? 0, ...openWarning });
}
