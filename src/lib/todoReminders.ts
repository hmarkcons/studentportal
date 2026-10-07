// Reminders, by email, of what is still to do — the daily run
// (/api/cron/todo-reminders).
//
// The alerts of things that happened are emailed as they happen
// (notificationDelivery). What is left undone gets a reminder of its own: one
// email about one kind of thing — "You still have 3 documents to upload" —
// never a digest of everything, and each kind at most once per spell
// (notification_reminders), so nobody is reminded of the same thing daily
// unless it is daily work (a follow-up due today).
//
// Kinds already chased by a mail of their own are left to it: overdue
// instalments (overdue-invoices), application deadlines and tasks
// (deadline-reminders, calendar-reminders).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/siteUrl";
import { sendEmail } from "@/lib/email";
import { notificationEmail, reminderDue, type Audience } from "@/lib/notificationText";
import { passportStatus } from "@/lib/profileCompleteness";
import { holdsPermission } from "@/lib/permissionResolve";
import { staffRoles } from "@/lib/auth/roles";
import { karachiToday } from "@/lib/calendarDates";

/** A day's emails at most, so the office mailbox's allowance is never at risk. */
const MAX_EMAILS = 120;

export type Reminder = {
  userId: string;
  name: string | null;
  email: string | null;
  audience: Audience;
  /** Its kind, and how often it may be sent: "student:documents" weekly. */
  key: string;
  everyDays: number;
  title: string;
  body: string;
  path: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Every reminder due today, before the throttle. */
export async function gatherReminders(admin: SupabaseClient): Promise<Reminder[]> {
  const today = karachiToday();
  const now = Date.now();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  // Sign-in addresses, for students and partners.
  const authEmail = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) authEmail.set(u.id, u.email);
    if (!data || data.users.length < 1000) break;
  }

  const [students, docs, agreements, staff, followUps, inbound, markers, waitingDocs, leave, definition, roleOverrides, staffOverrides, partners] =
    await Promise.all([
      admin.from("leads").select("id, full_name, auth_user_id, passport_expiry").eq("portal_active", true).not("student_code", "is", null).not("auth_user_id", "is", null),
      admin.from("student_documents").select("student_id").in("status", ["missing", "rejected"]),
      admin.from("agreements").select("student_id").eq("status", "pending_signature"),
      admin.from("staff").select("id, full_name, email_official, role, roles").eq("status", "active"),
      admin.from("reminders").select("student_id, lead:leads(assigned_counselor_id)").eq("type", "follow_up").eq("resolved", false).not("due_date", "is", null).lte("due_date", today),
      admin.from("messages").select("entity_id, sent_at").eq("entity_type", "student").eq("direction", "inbound").neq("channel", "internal_note").order("sent_at", { ascending: false }).limit(1000),
      admin.from("message_read_markers").select("student_id, read_at").eq("side", "staff"),
      admin.from("student_documents").select("student_id, uploaded_at, lead:leads(processing_officer_id, assigned_counselor_id)").in("status", ["submitted", "under_review"]).lt("uploaded_at", threeDaysAgo),
      admin.from("leave_requests").select("staff_id").eq("status", "pending").lt("created_at", dayAgo),
      admin.from("permission_definitions").select("key, default_roles").eq("key", "leave.approve").maybeSingle(),
      admin.from("role_permission_overrides").select("role, permission_key, allowed").eq("permission_key", "leave.approve"),
      admin.from("staff_permission_overrides").select("staff_id, permission_key, allowed").eq("permission_key", "leave.approve"),
      admin.from("partner_university_accounts").select("id, staff_name, university_id").eq("status", "active"),
    ]);

  const out: Reminder[] = [];
  const staffRows = staff.data ?? [];
  const staffById = new Map(staffRows.map((s) => [s.id as string, s]));
  const staffMail = (id: string) => {
    const s = staffById.get(id);
    return (s?.email_official as string | null)?.trim() || authEmail.get(id) || null;
  };
  const count = (ids: (string | null | undefined)[]) => {
    const m = new Map<string, number>();
    for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };

  // ---------------------------------------------------------------- students
  const docCounts = count((docs.data ?? []).map((d) => d.student_id as string));
  const unsigned = new Set((agreements.data ?? []).map((a) => a.student_id as string));
  for (const s of students.data ?? []) {
    const userId = s.auth_user_id as string;
    const base = { userId, name: s.full_name as string, email: authEmail.get(userId) ?? null, audience: "student" as const };
    const n = docCounts.get(s.id as string) ?? 0;
    if (n > 0) {
      out.push({
        ...base,
        key: "student:documents",
        everyDays: 7,
        title: `You still have ${plural(n, "document")} to upload`,
        body: "Upload them from your portal's Documents page, so your applications can go ahead.",
        path: "/portal/documents",
      });
    }
    if (unsigned.has(s.id as string)) {
      out.push({
        ...base,
        key: "student:agreement",
        everyDays: 3,
        title: "Your agreement is still waiting for your signature",
        body: "Sign it in your portal to open the rest of it.",
        path: "/portal/agreement",
      });
    }
    const passport = passportStatus(s.passport_expiry as string | null);
    if (passport.state === "expired" || passport.state === "expiring") {
      out.push({
        ...base,
        key: "student:passport",
        everyDays: 30,
        title: passport.state === "expired" ? "Your passport has expired" : `Your passport expires in ${plural(passport.daysLeft ?? 0, "day")}`,
        body: "A visa cannot be filed on a passport with less than six months left. Renew it, then update the date on your profile.",
        path: "/portal/profile",
      });
    }
  }

  // ------------------------------------------------------------------- staff
  const staffReminder = (id: string, r: Omit<Reminder, "userId" | "name" | "email" | "audience">) => {
    const s = staffById.get(id);
    if (!s) return;
    out.push({ userId: id, name: s.full_name as string, email: staffMail(id), audience: "staff", ...r });
  };

  // Follow-ups due: the lead's counsellor's, daily while any are.
  for (const [id, n] of count((followUps.data ?? []).map((f) => (one(f.lead as never) as { assigned_counselor_id?: string } | null)?.assigned_counselor_id))) {
    staffReminder(id, {
      key: "staff:followups",
      everyDays: 1,
      title: `You have ${plural(n, "follow-up")} due`,
      body: "Call or message them, then tick each one off on the lead.",
      path: "/waiting?kind=followup",
    });
  }

  // Students who wrote over a day ago and have had no reply: their counsellor and processing officer.
  const seen = new Map((markers.data ?? []).map((m) => [m.student_id as string, m.read_at as string]));
  const newest = new Map<string, string>();
  for (const m of inbound.data ?? []) if (!newest.has(m.entity_id as string)) newest.set(m.entity_id as string, m.sent_at as string);
  const waiting = [...newest.entries()].filter(([sid, at]) => at < dayAgo && (!seen.get(sid) || at > seen.get(sid)!)).map(([sid]) => sid);
  if (waiting.length) {
    const { data: who } = await admin.from("leads").select("id, assigned_counselor_id, processing_officer_id").in("id", waiting);
    const perStaff = count((who ?? []).flatMap((l) => [...new Set([l.assigned_counselor_id as string | null, l.processing_officer_id as string | null])]));
    for (const [id, n] of perStaff) {
      staffReminder(id, {
        key: "staff:messages",
        everyDays: 2,
        title: `${plural(n, "student")} ${n === 1 ? "has" : "have"} been waiting over a day for a reply`,
        body: "Their messages are on the dashboard under Waiting on you.",
        path: "/waiting?kind=message",
      });
    }
  }

  // Documents waiting over three days for review: whoever works the student's file.
  const handler = (lead: unknown) => {
    const l = one(lead as never) as { processing_officer_id?: string | null; assigned_counselor_id?: string | null } | null;
    return (l?.processing_officer_id && staffById.has(l.processing_officer_id) ? l.processing_officer_id : null) ?? l?.assigned_counselor_id ?? null;
  };
  for (const [id, n] of count((waitingDocs.data ?? []).map((d) => handler(d.lead)))) {
    staffReminder(id, {
      key: "staff:documents",
      everyDays: 3,
      title: `${plural(n, "document")} ${n === 1 ? "has" : "have"} waited over three days for your review`,
      body: "Approve each one, or send it back with a reason.",
      path: "/waiting?kind=document",
    });
  }

  // Leave waiting over a day: everyone who approves it, bar the person asking.
  const pendingLeave = (leave.data ?? []).map((l) => l.staff_id as string);
  if (pendingLeave.length) {
    const tables = { definition: definition.data, roleOverrides: roleOverrides.data ?? [], staffOverrides: staffOverrides.data ?? [] };
    for (const s of staffRows) {
      if (!holdsPermission({ id: s.id as string, roles: staffRoles(s) }, "leave.approve", tables)) continue;
      const n = pendingLeave.filter((sid) => sid !== s.id).length;
      if (n === 0) continue;
      staffReminder(s.id as string, {
        key: "staff:leave",
        everyDays: 2,
        title: `${plural(n, "leave request")} ${n === 1 ? "is" : "are"} waiting for your decision`,
        body: "Approve or decline them on the Leave page.",
        path: "/admin/leave",
      });
    }
  }

  // ---------------------------------------------------------------- partners
  const partnerRows = partners.data ?? [];
  if (partnerRows.length) {
    const { data: awaiting } = await admin
      .from("applications")
      .select("university_id")
      .in("university_id", [...new Set(partnerRows.map((p) => p.university_id as string))])
      .in("current_stage", ["application_submitted", "under_review"])
      .lt("updated_at", weekAgo);
    const perUniversity = count((awaiting ?? []).map((a) => a.university_id as string));
    for (const p of partnerRows) {
      const n = perUniversity.get(p.university_id as string) ?? 0;
      if (n === 0) continue;
      out.push({
        userId: p.id as string,
        name: p.staff_name as string,
        email: authEmail.get(p.id as string) ?? null,
        audience: "partner",
        key: "partner:decisions",
        everyDays: 7,
        title: `${plural(n, "application")} ${n === 1 ? "has" : "have"} waited over a week for your decision`,
        body: "Each one is listed on your partner dashboard.",
        path: "/partner",
      });
    }
  }

  return out;
}

/**
 * Sends the reminders due — each kind to each person at most once per its
 * spell — and records them. A dry run sends nothing and says what it would.
 */
export async function sendReminders(admin: SupabaseClient, { dryRun = false }: { dryRun?: boolean } = {}) {
  const now = Date.now();
  const all = await gatherReminders(admin);
  const { data: log } = await admin.from("notification_reminders").select("user_id, reminder, sent_at");
  const last = new Map((log ?? []).map((l) => [`${l.user_id}|${l.reminder}`, l.sent_at as string]));
  const due = all.filter((r) => r.email && reminderDue(last.get(`${r.userId}|${r.key}`), r.everyDays, now)).slice(0, MAX_EMAILS);

  if (dryRun) return { due: due.length, wouldSend: due.map((r) => ({ to: r.audience, key: r.key, title: r.title })) };

  let sent = 0;
  const failures: string[] = [];
  for (const r of due) {
    const mail = notificationEmail({ recipientName: r.name, title: r.title, body: r.body, url: `${getSiteUrl()}${r.path}`, audience: r.audience });
    const result = await sendEmail({ to: r.email!, ...mail });
    if ("success" in result) {
      sent++;
      await admin.from("notification_reminders").upsert({ user_id: r.userId, reminder: r.key, sent_at: new Date().toISOString() });
    } else {
      failures.push(`${r.key}: ${result.error}`);
    }
  }
  return { due: due.length, sent, failures };
}
