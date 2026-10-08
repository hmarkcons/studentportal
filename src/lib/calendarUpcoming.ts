import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { isUndeliverableAddress } from "@/lib/emailRecipients";
import { deliversEmail } from "@/lib/notificationDelivery";
import { getSiteUrl } from "@/lib/siteUrl";
import { readAll } from "@/lib/catalogueReads";
import { karachiClock, shiftDate } from "@/lib/calendarLayout";
import { applicationDeadline } from "@/lib/applicationDeadline";
import { staffRoles } from "@/lib/auth/roles";
import {
  deadlineItem,
  documentItem,
  dueForReminder,
  followUpItem,
  guestOccurrences,
  instalmentItem,
  interviewItem,
  reminderEmail,
  type Audience,
  type AutoItem,
  type ReminderMode,
} from "@/lib/calendarAuto";
import { loadFollowUps, loadInstalments, loadInterviews, loadInvitedEvents } from "@/lib/calendarAutoLoad";

// Emails before what is on people's calendars: "tomorrow" — everything on
// tomorrow's date, from the daily run — and "soon" — what starts within the
// hour, from the ten-minute run (src/lib/calendarAuto.ts says what counts).
//
//   staff      their students' interviews (counsellor and processing officer),
//              instalments due (counsellor, and everyone in finance), their
//              follow-ups
//   students   their interviews, instalments due, documents to upload by a date
//   partners   their applicants' interviews, their applications' deadlines
//   guests     the events they were invited to
//
// Each person gets one email per run listing their items, and each item is
// sent to each person once per kind of reminder (calendar_reminder_log, 0324).
// Only a deployment sends: a local server shares the live database.

const PAGE_SPAN_DAYS = 1;
/** One run's emails at most, so the office mailbox's allowance is never at risk. */
const MAX_EMAILS = 200;

const CALENDAR_PATH: Record<Audience, string | null> = {
  staff: "/calendar",
  student: "/portal/calendar",
  partner: "/partner/calendar",
  guest: null,
};

type Bucket = { email: string; name: string | null; audience: Audience; items: AutoItem[] };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export type UpcomingResult = {
  mode: ReminderMode;
  dryRun: boolean;
  recipients: { to: string; audience: Audience; items: string[] }[];
  sent: number;
  skipped: number;
  failed: number;
  note?: string;
};

export async function sendCalendarReminders(mode: ReminderMode, opts: { dryRun?: boolean; nowMs?: number } = {}): Promise<UpcomingResult> {
  const dryRun = opts.dryRun === true;
  const result: UpcomingResult = { mode, dryRun, recipients: [], sent: 0, skipped: 0, failed: 0 };
  if (!dryRun && !deliversEmail()) return { ...result, note: "not a deployment: calendar reminders are emailed only from Vercel" };
  if (!dryRun && !isEmailConfigured()) return { ...result, note: "email is not configured" };

  const admin = createAdminClient();
  const now = opts.nowMs ?? Date.now();
  const today = karachiClock(now).date;
  const to = shiftDate(today, PAGE_SPAN_DAYS);
  const due = (item: AutoItem | null): item is AutoItem => item !== null && dueForReminder(item, mode, now);

  const [interviews, instalments, followUps, invited, docs, apps] = await Promise.all([
    loadInterviews(admin, today, to),
    // Due on a day, never at a time: nothing to say within the hour.
    mode === "tomorrow" ? loadInstalments(admin, today, to) : Promise.resolve([]),
    loadFollowUps(admin, today, to),
    loadInvitedEvents(admin, today, to),
    mode === "tomorrow"
      ? readAll<Record<string, unknown>>((a, b) =>
          admin
            .from("student_documents")
            .select("id, deadline, status, custom_name, category, template:document_templates(name), student:leads(id, full_name, email, auth_user_id)")
            .in("status", ["missing", "rejected"])
            .eq("deadline", to)
            .order("id")
            .range(a, b) as never
        )
      : Promise.resolve([]),
    mode === "tomorrow"
      ? readAll<Record<string, unknown>>((a, b) =>
          admin
            .from("applications")
            .select("id, deadline, university_id, program:programs(name, application_deadline), round:program_intake_rounds(label, application_deadline), student:leads(full_name), university:universities(name)")
            .order("id")
            .range(a, b) as never
        )
      : Promise.resolve([]),
  ]);

  // What is due in this run, before anyone is looked up.
  const dueInterviews = interviews.filter((r) => due(interviewItem(r, "staff")));
  const dueInstalments = instalments.filter((r) => due(instalmentItem(r, "staff", today)));
  const dueFollowUps = followUps.filter((r) => due(followUpItem(r)));
  const dueDocs = docs.filter((d) => {
    const template = one(d.template as never) as { name?: string } | null;
    return due(documentItem({ id: d.id as string, deadline: d.deadline as string, status: d.status as string, name: (d.custom_name as string) ?? template?.name ?? null }));
  });
  const dueDeadlines = apps
    .map((a) => {
      const program = one(a.program as never) as { name?: string; application_deadline?: string | null } | null;
      const round = one(a.round as never) as { label?: string; application_deadline?: string | null } | null;
      const date = applicationDeadline(a.deadline as string | null, round?.application_deadline, program?.application_deadline);
      return {
        universityId: a.university_id as string | null,
        record: {
          applicationId: a.id as string,
          date,
          studentName: (one(a.student as never) as { full_name?: string } | null)?.full_name ?? null,
          program: program?.name ?? null,
          roundLabel: round?.label ?? null,
          university: (one(a.university as never) as { name?: string } | null)?.name ?? null,
        },
      };
    })
    .filter((d) => due(deadlineItem(d.record, "partner")));
  const dueGuests = invited.flatMap((e) => guestOccurrences(e, today, to).filter((i) => due(i)).map((item) => ({ item, guests: e.guests })));

  if (!dueInterviews.length && !dueInstalments.length && !dueFollowUps.length && !dueDocs.length && !dueDeadlines.length && !dueGuests.length) {
    return result;
  }

  // Who they are: staff, partners and everyone's sign-in address.
  const [{ data: staffRows }, { data: partnerRows }] = await Promise.all([
    admin.from("staff").select("id, full_name, email_official, role, roles").eq("status", "active"),
    admin.from("partner_university_accounts").select("id, staff_name, university_id").eq("status", "active"),
  ]);
  // Sign-in addresses, only of the people this run concerns: one at a time
  // when they are few (the ten-minute run), every page when they are many.
  const wanted = new Set<string>();
  for (const r of dueInterviews) [r.counsellorId, r.processingOfficerId, r.studentUserId].forEach((id) => id && wanted.add(id));
  for (const r of dueInstalments) [r.counsellorId, r.studentUserId].forEach((id) => id && wanted.add(id));
  for (const r of dueFollowUps) if (r.ownerId) wanted.add(r.ownerId);
  for (const d of dueDocs) {
    const id = (one(d.student as never) as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (id) wanted.add(id);
  }
  if (dueInstalments.length) for (const s of staffRows ?? []) wanted.add(s.id as string);
  if (dueInterviews.length || dueDeadlines.length) for (const p of partnerRows ?? []) wanted.add(p.id as string);
  const authEmail = new Map<string, string>();
  if (wanted.size > 40) {
    for (let page = 1; page < 50; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data?.users ?? []) if (u.email) authEmail.set(u.id, u.email);
      if (!data || data.users.length < 1000) break;
    }
  } else {
    await Promise.all(
      [...wanted].map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.email) authEmail.set(id, data.user.email);
      })
    );
  }
  const staffById = new Map((staffRows ?? []).map((s) => [s.id as string, s]));
  const staffMail = (id: string | null) => {
    if (!id) return null;
    const s = staffById.get(id);
    if (!s) return null; // left, or inactive: nobody reads that mailbox for this
    return { email: (s.email_official as string | null)?.trim() || authEmail.get(id) || null, name: s.full_name as string };
  };
  const finance = (staffRows ?? []).filter((s) => staffRoles(s as never).includes("finance" as never)).map((s) => s.id as string);
  const partnersOf = (universityId: string | null) =>
    (partnerRows ?? []).filter((p) => universityId && p.university_id === universityId).map((p) => ({ email: authEmail.get(p.id as string) ?? null, name: p.staff_name as string }));
  const studentMail = (userId: string | null, email: string | null) => (userId ? authEmail.get(userId) : null) || email?.trim() || null;

  const buckets = new Map<string, Bucket>();
  const add = (email: string | null | undefined, name: string | null, audience: Audience, item: AutoItem | null) => {
    const addr = email?.trim().toLowerCase();
    if (!addr || !item) return;
    const bucket = buckets.get(addr) ?? { email: addr, name, audience, items: [] };
    if (!bucket.items.some((i) => i.key === item.key)) bucket.items.push(item);
    buckets.set(addr, bucket);
  };

  for (const r of dueInterviews) {
    for (const id of new Set([r.counsellorId, r.processingOfficerId])) {
      const s = staffMail(id);
      add(s?.email, s?.name ?? null, "staff", interviewItem(r, "staff"));
    }
    add(studentMail(r.studentUserId, r.studentEmail), r.studentName, "student", interviewItem(r, "student"));
    for (const p of partnersOf(r.universityId)) add(p.email, p.name, "partner", interviewItem(r, "partner"));
  }
  for (const r of dueInstalments) {
    for (const id of new Set([r.counsellorId, ...finance])) {
      const s = staffMail(id);
      add(s?.email, s?.name ?? null, "staff", instalmentItem(r, "staff", today));
    }
    add(studentMail(r.studentUserId, r.studentEmail), r.studentName, "student", instalmentItem(r, "student", today));
  }
  for (const r of dueFollowUps) {
    const s = staffMail(r.ownerId);
    add(s?.email, s?.name ?? null, "staff", followUpItem(r));
  }
  for (const d of dueDocs) {
    const student = one(d.student as never) as Record<string, string | null> | null;
    const template = one(d.template as never) as { name?: string } | null;
    add(
      studentMail(student?.auth_user_id ?? null, student?.email ?? null),
      student?.full_name ?? null,
      "student",
      documentItem({ id: d.id as string, deadline: d.deadline as string, status: d.status as string, name: (d.custom_name as string) ?? template?.name ?? null })
    );
  }
  for (const d of dueDeadlines) for (const p of partnersOf(d.universityId)) add(p.email, p.name, "partner", deadlineItem(d.record, "partner"));
  for (const g of dueGuests) for (const email of g.guests) add(email, null, "guest", g.item);

  // Whatever each person was already sent for this kind of reminder is left out.
  const keys = [...new Set([...buckets.values()].flatMap((b) => b.items.map((i) => i.key)))];
  const already = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("calendar_reminder_log").select("item_key, recipient").eq("mode", mode).in("item_key", keys.slice(i, i + 200));
    for (const r of data ?? []) already.add(`${r.item_key}|${r.recipient}`);
  }
  for (const b of buckets.values()) b.items = b.items.filter((i) => !already.has(`${i.key}|${b.email}`));
  const toSend = [...buckets.values()].filter((b) => b.items.length > 0);
  result.recipients = toSend.map((b) => ({ to: b.email, audience: b.audience, items: b.items.map((i) => i.title) }));
  if (dryRun) return result;

  const siteUrl = getSiteUrl();
  for (const b of toSend.slice(0, MAX_EMAILS)) {
    let ok = true;
    if (isUndeliverableAddress(b.email)) {
      result.skipped++;
    } else {
      const words = reminderEmail({ name: b.name, mode, items: b.items, siteUrl, calendarPath: CALENDAR_PATH[b.audience] });
      const sent = await sendEmail({ to: b.email, ...words });
      if ("error" in sent && sent.error) {
        ok = false;
        result.failed++;
        console.error(`[calendarUpcoming] ${mode} to ${b.email}:`, sent.error);
      } else result.sent++;
    }
    // A failure is tried again on the next run; anything else is done.
    if (ok) {
      await admin
        .from("calendar_reminder_log")
        .upsert(b.items.map((i) => ({ item_key: i.key, recipient: b.email, mode })), { onConflict: "item_key,recipient,mode", ignoreDuplicates: true });
    }
  }
  return result;
}
