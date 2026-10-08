import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/catalogueReads";
import { karachiEpoch } from "@/lib/calendarLayout";
import type { DeadlineRecord, FollowUpRecord, GuestEventRecord, InstalmentRecord, InterviewRecord } from "@/lib/calendarAuto";

// The records the calendars' automatic items are made from (src/lib/
// calendarAuto.ts), read for a span of days — by whoever is looking, under
// their own row-level security, or by the reminder runs with the service role.
// Each record carries the people it concerns, so the caller decides whose
// calendar it goes on.

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** The instant a Karachi day starts, and the one after a later day ends. */
function instants(from: string, to: string) {
  return { start: new Date(karachiEpoch(from, 0)).toISOString(), end: new Date(karachiEpoch(to, 1440)).toISOString() };
}

export type StaffInterview = InterviewRecord & {
  counsellorId: string | null;
  processingOfficerId: string | null;
  universityId: string | null;
  studentEmail: string | null;
  studentUserId: string | null;
};

/** Interviews still ahead with a confirmed time, between two days. */
export async function loadInterviews(client: SupabaseClient, from: string, to: string): Promise<StaffInterview[]> {
  const { start, end } = instants(from, to);
  const rows = await readAll<Record<string, unknown>>((a, b) =>
    client
      .from("application_interviews")
      .select(
        "id, application_id, confirmed_datetime, status, round_label, platform, platform_other, interview_details, application:applications(id, university_id, student:leads(id, full_name, email, auth_user_id, assigned_counselor_id, processing_officer_id), university:universities(name), program:programs(name))"
      )
      .in("status", ["scheduled", "rescheduled"])
      .gte("confirmed_datetime", start)
      .lt("confirmed_datetime", end)
      .order("confirmed_datetime")
      .order("id")
      .range(a, b) as never
  );
  return rows.map((r) => {
    const app = one(r.application as never) as Record<string, unknown> | null;
    const student = one(app?.student as never) as Record<string, string | null> | null;
    const uni = one(app?.university as never) as { name?: string } | null;
    const program = one(app?.program as never) as { name?: string } | null;
    return {
      id: r.id as string,
      applicationId: r.application_id as string,
      confirmedAt: (r.confirmed_datetime as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      roundLabel: (r.round_label as string | null) ?? null,
      platform: (r.platform as string | null) ?? null,
      platformOther: (r.platform_other as string | null) ?? null,
      details: (r.interview_details as string | null) ?? null,
      studentId: student?.id ?? null,
      studentName: student?.full_name ?? null,
      university: uni?.name ?? null,
      program: program?.name ?? null,
      counsellorId: student?.assigned_counselor_id ?? null,
      processingOfficerId: student?.processing_officer_id ?? null,
      universityId: (app?.university_id as string | null) ?? null,
      studentEmail: student?.email ?? null,
      studentUserId: student?.auth_user_id ?? null,
    };
  });
}

export type StaffInstalment = InstalmentRecord & { counsellorId: string | null; studentEmail: string | null; studentUserId: string | null };

/** Instalments not paid in full and due between two days. */
export async function loadInstalments(client: SupabaseClient, from: string, to: string): Promise<StaffInstalment[]> {
  const rows = await readAll<Record<string, unknown>>((a, b) =>
    client
      .from("invoice_installments")
      .select(
        "id, installment_no, due_date, amount, amount_paid, status, invoice:invoices(currency, student:leads(id, full_name, email, auth_user_id, assigned_counselor_id))"
      )
      .neq("status", "paid")
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date")
      .order("id")
      .range(a, b) as never
  );
  return rows.map((r) => {
    const invoice = one(r.invoice as never) as Record<string, unknown> | null;
    const student = one(invoice?.student as never) as Record<string, string | null> | null;
    return {
      id: r.id as string,
      installmentNo: (r.installment_no as number | null) ?? null,
      dueDate: (r.due_date as string | null) ?? null,
      amount: (r.amount as number | null) ?? null,
      amountPaid: (r.amount_paid as number | null) ?? null,
      status: (r.status as string | null) ?? null,
      currency: (invoice?.currency as string | null) ?? null,
      studentId: student?.id ?? null,
      studentName: student?.full_name ?? null,
      counsellorId: student?.assigned_counselor_id ?? null,
      studentEmail: student?.email ?? null,
      studentUserId: student?.auth_user_id ?? null,
    };
  });
}

export type StaffFollowUp = FollowUpRecord & { ownerId: string | null };

/** Follow-ups not yet resolved, due between two days; each belongs to the lead's counsellor, or whoever set it. */
export async function loadFollowUps(client: SupabaseClient, from: string, to: string): Promise<StaffFollowUp[]> {
  const rows = await readAll<Record<string, unknown>>((a, b) =>
    client
      .from("reminders")
      .select("id, due_date, due_time, note, resolved, created_by, student:leads(id, full_name, contact_number, assigned_counselor_id)")
      .eq("type", "follow_up")
      .eq("resolved", false)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date")
      .order("id")
      .range(a, b) as never
  );
  return rows.map((r) => {
    const lead = one(r.student as never) as Record<string, string | null> | null;
    return {
      id: r.id as string,
      dueDate: (r.due_date as string | null) ?? null,
      dueTime: (r.due_time as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      resolved: r.resolved === true,
      studentId: lead?.id ?? null,
      studentName: lead?.full_name ?? null,
      contactNumber: lead?.contact_number ?? null,
      ownerId: lead?.assigned_counselor_id ?? (r.created_by as string | null) ?? null,
    };
  });
}

/** A partner's applications, as their own RPC gives them: the student's name is not theirs to read otherwise. */
export async function loadPartnerApplications(client: SupabaseClient) {
  const { data } = await client.rpc("get_partner_applications");
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    applicationId: a.application_id as string,
    studentName: (a.student_name as string | null) ?? null,
    program: (a.program_name as string | null) ?? null,
    roundLabel: (a.round_label as string | null) ?? null,
    deadline: (a.application_deadline as string | null) ?? null,
  }));
}

export function partnerDeadlines(apps: Awaited<ReturnType<typeof loadPartnerApplications>>, university: string | null): DeadlineRecord[] {
  return apps.map((a) => ({
    applicationId: a.applicationId,
    date: a.deadline,
    studentName: a.studentName,
    program: a.program,
    roundLabel: a.roundLabel,
    university,
  }));
}

export type InvitedEvent = GuestEventRecord & { guests: string[] };

/** Pending calendar items with guests that may have an occurrence between two days. */
export async function loadInvitedEvents(client: SupabaseClient, from: string, to: string): Promise<InvitedEvent[]> {
  // A one-off item before the span is over; a series that began earlier may not be.
  const stillAhead = `due_date.gte.${from},recurrence.neq.none`;
  const [personal, tasks] = await Promise.all([
    readAll<Record<string, unknown>>((a, b) =>
      client
        .from("personal_tasks")
        .select("id, title, due_date, due_time, end_time, all_day, recurrence, recurrence_end_date, location, status, guest_emails")
        .eq("status", "pending")
        .not("guest_emails", "is", null)
        .neq("guest_emails", "{}")
        .lte("due_date", to)
        .or(stillAhead)
        .order("id")
        .range(a, b) as never
    ),
    readAll<Record<string, unknown>>((a, b) =>
      client
        .from("application_tasks")
        .select("id, description, due_date, due_time, end_time, all_day, recurrence, recurrence_end_date, location, status, guest_emails")
        .eq("status", "pending")
        .not("guest_emails", "is", null)
        .neq("guest_emails", "{}")
        .lte("due_date", to)
        .or(stillAhead)
        .order("id")
        .range(a, b) as never
    ),
  ]);
  const shape = (table: "personal_tasks" | "application_tasks", r: Record<string, unknown>): InvitedEvent => ({
    table,
    id: r.id as string,
    title: ((table === "personal_tasks" ? r.title : r.description) as string | null)?.trim() || "Calendar event",
    dueDate: (r.due_date as string | null) ?? null,
    dueTime: (r.due_time as string | null) ?? null,
    endTime: (r.end_time as string | null) ?? null,
    allDay: r.all_day === true,
    recurrence: (r.recurrence as string | null) ?? null,
    recurrenceEndDate: (r.recurrence_end_date as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    done: r.status !== "pending",
    guests: ((r.guest_emails as string[] | null) ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean),
  });
  return [...personal.map((r) => shape("personal_tasks", r)), ...tasks.map((r) => shape("application_tasks", r))];
}
