import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { buildCalendarReminderEmail } from "@/lib/calendarReminderEmail";
import { buildReminderRecipients } from "@/lib/calendarReminders";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Daily Vercel Cron job (see vercel.json) — every still-pending calendar
// task/personal reminder gets emailed once a day to whoever has a stake in
// it: for a student-linked task, the assigned counselor + the student
// themself + any guests; for a personal reminder, the owner + any guests.
// Repeats daily until the item is marked done, at which point it simply
// stops appearing in this query. Recipient-bucketing logic lives in
// buildReminderRecipients() so it can be tested against a scoped fixture
// without ever running this route against live production data.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured.", tasksChecked: 0, personalChecked: 0, recipients: 0 });
  }

  const admin = createAdminClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: tasks } = await admin
    .from("application_tasks")
    .select(
      "id, description, notes, due_date, due_time, all_day, priority, color, guest_emails, application:applications(student:leads(id, full_name, email, assigned_counselor_id))"
    )
    .eq("status", "pending")
    .not("due_date", "is", null);

  const { data: personalTasks } = await admin
    .from("personal_tasks")
    .select("id, title, description, due_date, due_time, all_day, priority, color, guest_emails, owner_id")
    .eq("status", "pending");

  const staffIds = new Set<string>();
  (tasks ?? []).forEach((t) => {
    const student = one(one(t.application)?.student as never) as { assigned_counselor_id?: string | null } | null;
    if (student?.assigned_counselor_id) staffIds.add(student.assigned_counselor_id);
  });
  (personalTasks ?? []).forEach((p) => staffIds.add(p.owner_id));

  const { data: staffRows } = staffIds.size
    ? await admin.from("staff").select("id, full_name").in("id", Array.from(staffIds))
    : { data: [] };
  const staffNameById = new Map((staffRows ?? []).map((s) => [s.id, s.full_name]));

  const staffEmailById = new Map<string, string>();
  {
    let page = 1;
    while (staffEmailById.size < staffIds.size) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (!data.users.length) break;
      for (const u of data.users) {
        if (staffIds.has(u.id) && u.email) staffEmailById.set(u.id, u.email);
      }
      if (data.users.length < 200) break;
      page++;
    }
  }

  const recipients = buildReminderRecipients(
    (tasks ?? []) as never,
    (personalTasks ?? []) as never,
    staffNameById,
    staffEmailById,
    todayStr
  );

  let sent = 0;
  let failed = 0;
  const results: { to: string; result: unknown }[] = [];
  for (const [to, bucket] of recipients) {
    const { subject, text, html } = buildCalendarReminderEmail(bucket.name, bucket.items);
    const result = await sendEmail({ to, subject, text, html });
    results.push({ to, result });
    if ("success" in result) sent++;
    else failed++;
  }

  return NextResponse.json({
    tasksChecked: tasks?.length ?? 0,
    personalChecked: personalTasks?.length ?? 0,
    recipients: recipients.size,
    sent,
    failed,
    results,
  });
}
