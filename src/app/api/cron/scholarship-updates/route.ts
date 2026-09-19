import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronRequest, CRON_OPEN_WARNING } from "@/lib/cronAuth";
import { researchConfigured } from "@/lib/scholarshipResearch";
import { runScholarshipCheck } from "@/lib/scholarshipCheckRunner";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import {
  FAILURE_STREAK,
  buildScholarshipFailureEmail,
  decideFailureAlert,
  type RunRow,
} from "@/lib/scholarshipFailureAlert";

/** Who gets told. Resolved from the permission, not a hardcoded role. */
const PERMISSION = "scholarships.manage";

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

  let processed = 0;
  let outcome: Awaited<ReturnType<typeof runScholarshipCheck>> | null = null;
  let note: string | undefined;

  if (next && !dryRun) {
    const { data: claimed } = await admin
      .from("scholarship_body_update_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", next.id)
      .eq("status", "queued")
      .select("id");
    if (claimed?.length) {
      outcome = await runScholarshipCheck(admin, next.id, next.scholarship_body_id, next.academic_year);
      processed = 1;
    } else {
      note = "already claimed";
    }
  }

  // Evaluated on every path, including the one where there was nothing queued.
  // That is the important one: a dead key makes each run fail, failures leave
  // the queue, and by the next morning there is no work left to do — so an
  // alert that only ran after processing something would never fire on exactly
  // the days it is needed. See scholarshipFailureAlert.ts.
  const failureAlert = await reportRepeatedFailures(admin, { dryRun });

  const { count } = await admin
    .from("scholarship_body_update_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldProcess: next ? 1 : 0,
      remaining: count ?? 0,
      failureAlert,
      ...openWarning,
    });
  }

  return NextResponse.json({
    processed,
    ...(outcome ? { body: outcome.body, result: outcome.result } : {}),
    ...(note ? { note } : {}),
    remaining: count ?? 0,
    failureAlert,
    ...openWarning,
  });
}

/**
 * Emails whoever manages scholarships when the checks keep failing.
 *
 * Recipients are derived from the permission rather than a hardcoded role, so
 * a Super Admin who moves `scholarships.manage` to another role does not
 * silently stop these going out.
 */
async function reportRepeatedFailures(
  admin: ReturnType<typeof createAdminClient>,
  { dryRun }: { dryRun: boolean }
) {
  const { data: runs } = await admin
    .from("scholarship_body_update_runs")
    .select("id, status, finished_at, error, failure_notified_at, body:scholarship_bodies(name)")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(FAILURE_STREAK * 3);

  const rows: RunRow[] = (runs ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    finished_at: r.finished_at as string | null,
    error: r.error as string | null,
    failure_notified_at: r.failure_notified_at as string | null,
    body: (Array.isArray(r.body) ? r.body[0]?.name : (r.body as { name?: string } | null)?.name) ?? null,
  }));

  const decision = decideFailureAlert(rows);
  if (!decision.alert) return { sent: 0, reason: decision.reason, streak: decision.streak };

  const recipients = await scholarshipManagers(admin);
  const { subject, text } = buildScholarshipFailureEmail(decision);

  if (dryRun) {
    return { dryRun: true, wouldEmail: recipients.map((r) => r.email), streak: decision.streak, subject };
  }
  if (!isEmailConfigured()) {
    return { sent: 0, reason: "email isn't configured", streak: decision.streak };
  }

  let sent = 0;
  for (const r of recipients) {
    const result = await sendEmail({ to: r.email, subject, text });
    if ("success" in result) sent += 1;
  }

  // Stamped whether or not a mail got through. A send that fails is logged by
  // sendEmail, and retrying the same alert every morning for a week is the
  // behaviour this whole thing exists to avoid.
  await admin
    .from("scholarship_body_update_runs")
    .update({ failure_notified_at: new Date().toISOString() })
    .in("id", decision.runs.map((r) => r.id));

  return { sent, streak: decision.streak, recipients: recipients.length };
}

/** Active staff holding a role that grants `scholarships.manage`. */
async function scholarshipManagers(admin: ReturnType<typeof createAdminClient>) {
  const { data: definition } = await admin
    .from("permission_definitions")
    .select("default_roles")
    .eq("key", PERMISSION)
    .maybeSingle();

  const { data: overrides } = await admin
    .from("role_permission_overrides")
    .select("role, allowed")
    .eq("permission_key", PERMISSION);

  const allowed = new Set<string>((definition?.default_roles as string[]) ?? []);
  for (const o of overrides ?? []) {
    if (o.allowed) allowed.add(o.role as string);
    else allowed.delete(o.role as string);
  }
  // Super Admin always has every permission and cannot be revoked (0094).
  allowed.add("super_admin");
  if (allowed.size === 0) return [];

  const { data: staff } = await admin
    .from("staff")
    .select("id, full_name")
    .eq("status", "active")
    .overlaps("roles", [...allowed]);
  if (!staff?.length) return [];

  // Staff email addresses live on the auth user, not the staff row.
  const wanted = new Set(staff.map((s) => s.id));
  const emails = new Map<string, string>();
  let page = 1;
  while (emails.size < wanted.size) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!data.users.length) break;
    for (const u of data.users) if (wanted.has(u.id) && u.email) emails.set(u.id, u.email);
    if (data.users.length < 200) break;
    page += 1;
  }

  return staff
    .map((s) => ({ id: s.id, name: s.full_name as string, email: emails.get(s.id) ?? null }))
    .filter((s): s is { id: string; name: string; email: string } => Boolean(s.email));
}
