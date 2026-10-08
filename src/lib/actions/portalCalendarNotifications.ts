"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { karachiClock, shiftDate } from "@/lib/calendarLayout";
import { upcomingNotifications, type DueNotification } from "@/lib/calendarRecurrence";
import { deadlineItem, documentItem, instalmentItem, interviewItem, popupSources, type AutoItem } from "@/lib/calendarAuto";
import { loadInstalments, loadInterviews, loadPartnerApplications, partnerDeadlines } from "@/lib/calendarAutoLoad";

// The pop-ups of the student and partner portals (src/components/
// CalendarNotifier.tsx): what is on their calendar soon, the day before and an
// hour before anything with a time. Each reads under the person's own
// row-level security, so it can only ever find their own.

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** A student's: their interviews, instalments due and documents to upload by a date. */
export async function loadStudentCalendarNotifications(): Promise<DueNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const now = Date.now();
  const today = karachiClock(now).date;
  const until = shiftDate(today, 2);

  const { data: student } = await supabase.from("leads").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!student) return [];

  const [interviews, instalments, { data: docs }] = await Promise.all([
    loadInterviews(supabase, today, until).catch(() => []),
    loadInstalments(supabase, today, until).catch(() => []),
    supabase
      .from("student_documents")
      .select("id, deadline, status, custom_name, category, template:document_templates(name)")
      .eq("student_id", student.id)
      .in("status", ["missing", "rejected"])
      .gte("deadline", today)
      .lte("deadline", until),
  ]);

  const items: AutoItem[] = [];
  for (const r of interviews) {
    if (r.studentId !== student.id) continue;
    const item = interviewItem(r, "student");
    if (item) items.push(item);
  }
  for (const r of instalments) {
    if (r.studentId !== student.id) continue;
    const item = instalmentItem(r, "student", today);
    if (item) items.push(item);
  }
  for (const d of docs ?? []) {
    const template = one(d.template as never) as { name?: string } | null;
    const item = documentItem({ id: d.id, deadline: d.deadline, status: d.status, name: d.custom_name ?? template?.name ?? d.category ?? null });
    if (item) items.push(item);
  }
  return upcomingNotifications(items.flatMap(popupSources), now);
}

/** A university's: its applicants' interviews, and its applications' deadlines. */
export async function loadPartnerCalendarNotifications(): Promise<DueNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const now = Date.now();
  const today = karachiClock(now).date;
  const until = shiftDate(today, 2);

  const [{ data: account }, apps, interviews] = await Promise.all([
    supabase.from("partner_university_accounts").select("status, university:universities(name)").eq("id", user.id).maybeSingle(),
    loadPartnerApplications(supabase),
    loadInterviews(supabase, today, until).catch(() => []),
  ]);
  if (!account || account.status !== "active") return [];
  const university = (one(account.university as never) as { name?: string } | null)?.name ?? null;
  const nameOf = new Map(apps.map((a) => [a.applicationId, a.studentName]));

  const items: AutoItem[] = [];
  for (const r of interviews) {
    const item = interviewItem({ ...r, studentName: r.studentName ?? nameOf.get(r.applicationId) ?? null, studentId: null }, "partner");
    if (item) items.push(item);
  }
  // Deadlines falling in the next two days, one pop-up per programme and round
  // and day rather than one per applicant.
  const deadlines = new Map<string, AutoItem>();
  for (const d of partnerDeadlines(apps, university)) {
    if (!d.date || d.date < today || d.date > until) continue;
    const item = deadlineItem(d, "partner");
    if (!item) continue;
    const group = `${d.date}|${d.program ?? ""}|${d.roundLabel ?? ""}`;
    const held = deadlines.get(group);
    deadlines.set(
      group,
      held
        ? { ...held, key: `${held.key}+`, title: `${d.program ?? "Application"}${d.roundLabel ? ` (${d.roundLabel})` : ""} deadline — several applicants` }
        : item
    );
  }
  items.push(...deadlines.values());
  return upcomingNotifications(items.flatMap(popupSources), now);
}
