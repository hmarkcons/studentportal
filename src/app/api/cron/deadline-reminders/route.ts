import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { buildDeadlineReminderEmail } from "@/lib/deadlineReminderEmail";
import { buildDeadlineRecipients, DEADLINE_WINDOW_DAYS, type DeadlineRow, type ProcessingStaff } from "@/lib/deadlineReminders";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type StudentRef = { full_name?: string | null; processing_officer_id?: string | null } | null;

// Daily Vercel Cron (see vercel.json) — emails the processing officer every
// deadline falling due in the next DEADLINE_WINDOW_DAYS: programme
// application deadlines, application-task due dates, and document
// deadlines. Repeats daily while the deadline is still ahead. A student
// with no officer assigned falls back to the whole processing team, so
// nothing goes unwatched. Bucketing lives in buildDeadlineRecipients() so
// it can be tested without running this route against live data.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured.", deadlinesChecked: 0, recipients: 0 });
  }

  const admin = createAdminClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [{ data: programRows }, { data: taskRows }, { data: documentRows }, { data: staffRows }] = await Promise.all([
    admin
      .from("applications")
      .select("id, program:programs(name, application_deadline), student:leads(full_name, processing_officer_id)")
      .not("program_id", "is", null),
    admin
      .from("application_tasks")
      .select("id, description, due_date, application:applications(student:leads(full_name, processing_officer_id))")
      .eq("status", "pending")
      .not("due_date", "is", null),
    admin
      .from("student_documents")
      .select("id, custom_name, category, deadline, student:leads(full_name, processing_officer_id)")
      .not("deadline", "is", null)
      .neq("status", "verified"),
    admin.from("staff").select("id, full_name").eq("role", "processing").eq("status", "active"),
  ]);

  const deadlines: DeadlineRow[] = [];

  (programRows ?? []).forEach((a) => {
    const program = one(a.program) as { name?: string; application_deadline?: string | null } | null;
    const student = one(a.student) as StudentRef;
    if (!program?.application_deadline) return;
    deadlines.push({
      kind: "program",
      title: program.name ?? "Programme",
      studentName: student?.full_name ?? "Unknown student",
      dueDate: program.application_deadline,
      processingOfficerId: student?.processing_officer_id ?? null,
    });
  });

  (taskRows ?? []).forEach((t) => {
    const student = one(one(t.application)?.student as never) as StudentRef;
    deadlines.push({
      kind: "task",
      title: t.description,
      studentName: student?.full_name ?? "Unknown student",
      dueDate: t.due_date!,
      processingOfficerId: student?.processing_officer_id ?? null,
    });
  });

  (documentRows ?? []).forEach((d) => {
    const student = one(d.student) as StudentRef;
    deadlines.push({
      kind: "document",
      title: d.custom_name ?? d.category ?? "Document",
      studentName: student?.full_name ?? "Unknown student",
      dueDate: d.deadline!,
      processingOfficerId: student?.processing_officer_id ?? null,
    });
  });

  // Staff emails live on the auth user, not the staff row.
  const staffIds = new Set((staffRows ?? []).map((s) => s.id));
  const emailById = new Map<string, string>();
  if (staffIds.size) {
    let page = 1;
    while (emailById.size < staffIds.size) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (!data.users.length) break;
      for (const u of data.users) {
        if (staffIds.has(u.id) && u.email) emailById.set(u.id, u.email);
      }
      if (data.users.length < 200) break;
      page++;
    }
  }

  const processingStaff: ProcessingStaff[] = (staffRows ?? []).map((s) => ({
    id: s.id,
    name: s.full_name,
    email: emailById.get(s.id) ?? null,
  }));

  const recipients = buildDeadlineRecipients(deadlines, processingStaff, todayStr, DEADLINE_WINDOW_DAYS);

  // ?dry=1 reports exactly who would be emailed and with what, without
  // sending anything — safe to run by hand against production to check the
  // routing before or after changing officer assignments.
  if (request.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({
      dryRun: true,
      deadlinesChecked: deadlines.length,
      processingStaff: processingStaff.length,
      recipients: Array.from(recipients, ([to, bucket]) => ({
        to,
        name: bucket.name,
        items: bucket.items.map((i) => `${i.dueDate} ${i.kind}: ${i.title} — ${i.studentName}`),
      })),
    });
  }

  let sent = 0;
  let failed = 0;
  const results: { to: string; result: unknown }[] = [];
  for (const [to, bucket] of recipients) {
    const { subject, text, html } = buildDeadlineReminderEmail(bucket, todayStr);
    const result = await sendEmail({ to, subject, text, html });
    results.push({ to, result });
    if ("success" in result) sent++;
    else failed++;
  }

  return NextResponse.json({
    deadlinesChecked: deadlines.length,
    processingStaff: processingStaff.length,
    recipients: recipients.size,
    sent,
    failed,
    results,
  });
}
