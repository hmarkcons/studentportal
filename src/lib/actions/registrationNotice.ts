"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { formatDateOnly } from "@/lib/formatDate";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { buildRegistrationNotice, type NoticeRole } from "@/lib/registrationNotice";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** How many requirements to name before saying "and N more". */
const LISTED_ACTIONS = 5;

/**
 * Tells the people responsible for a student that they are responsible.
 *
 * Called after every route that can make somebody responsible — registration,
 * assignment, reassignment — rather than from one of them, because a student
 * becomes registered from several places and a notice that only some of them
 * send is worse than none.
 *
 * Safe to call as often as you like: student_assignment_notices has one row
 * per (student, staff member), so re-running a registration cannot send a
 * second copy, while a genuinely new counselor is a new row and does get told.
 *
 * Runs on the admin client on purpose. It reads staff emails and writes the
 * notice record, and the caller may be a counselor with no business reading
 * another counselor's row — the decision about who is notified is made here,
 * not by whoever happened to press the button.
 */
export async function notifyAssignedStaff(studentId: string) {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("leads")
    .select(
      "id, full_name, student_code, contact_number, email, intake, registration_status, registered_at, assigned_counselor_id, processing_officer_id, country_of_interest"
    )
    .eq("id", studentId)
    .maybeSingle();

  // Only a registered student has anybody responsible for them yet.
  if (!student || student.registration_status !== "registered" || !student.registered_at) return { skipped: "not registered" };

  // Who is owed a copy: the two people with the work, plus management for the
  // record. Deduplicated by id, so one person holding two roles gets one mail.
  const targets = new Map<string, NoticeRole>();
  if (student.assigned_counselor_id) targets.set(student.assigned_counselor_id, "counselor");
  if (student.processing_officer_id && !targets.has(student.processing_officer_id)) {
    targets.set(student.processing_officer_id, "processing");
  }
  const { data: managers } = await admin
    .from("staff")
    .select("id, full_name, email, role")
    .in("role", ["management", "super_admin"])
    .eq("status", "active");
  for (const m of managers ?? []) if (!targets.has(m.id)) targets.set(m.id, "management");

  if (targets.size === 0) return { skipped: "nobody to notify" };

  // Already told, and about to be told. One query, not one per person.
  const { data: already } = await admin
    .from("student_assignment_notices")
    .select("staff_id")
    .eq("student_id", studentId);
  const told = new Set((already ?? []).map((r) => r.staff_id));
  const toTell = [...targets].filter(([id]) => !told.has(id));
  if (toTell.length === 0) return { sent: 0 };

  // The checklist, raised now if it has not been. Doing it here rather than
  // waiting for somebody to open the student page means the mail can say what
  // is actually owed instead of "see the portal".
  await ensureStudentDocumentRequirements(studentId).catch(() => {
    // A checklist that cannot be built is not a reason to withhold the mail.
  });

  const { data: docs } = await admin
    .from("student_documents")
    .select("status, deadline, custom_name, template:document_templates(name)")
    .eq("student_id", studentId)
    .neq("status", "verified");

  // Dated requirements first and soonest first, because that is the order the
  // work has to happen in; undated ones after, in the order they were raised.
  const outstanding = (docs ?? [])
    .map((d) => ({
      label: (one(d.template as never) as { name?: string } | null)?.name ?? d.custom_name ?? "Document",
      due: d.deadline ? formatDateOnly(d.deadline, { day: "numeric", month: "short", year: "numeric" }) : null,
      sortKey: d.deadline ?? "9999-99-99",
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.label.localeCompare(b.label));

  const firstActions = outstanding.slice(0, LISTED_ACTIONS).map(({ label, due }) => ({ label, due }));
  const moreActions = Math.max(0, outstanding.length - firstActions.length);

  const staffIds = [...targets.keys()];
  const { data: staffRows } = await admin.from("staff").select("id, full_name, email").in("id", staffIds);
  const byId = new Map((staffRows ?? []).map((s) => [s.id, s]));

  const counselorName = student.assigned_counselor_id ? byId.get(student.assigned_counselor_id)?.full_name ?? null : null;
  const processingOfficerName = student.processing_officer_id
    ? byId.get(student.processing_officer_id)?.full_name ?? null
    : null;

  const studentUrl = `${getSiteUrl()}/students/${studentId}`;
  let sent = 0;

  for (const [staffId, role] of toTell) {
    const person = byId.get(staffId);
    if (!person?.email) continue;

    // A counselor being told about a student who registered days ago was
    // moved to them, not newly registered — say the right thing.
    const registeredToday =
      new Date(student.registered_at).toDateString() === new Date().toDateString();

    const mail = buildRegistrationNotice({
      recipientName: person.full_name ?? "there",
      role,
      reassigned: role !== "management" && !registeredToday,
      studentName: student.full_name,
      studentCode: student.student_code,
      country: student.country_of_interest,
      intake: student.intake,
      studentPhone: student.contact_number,
      studentEmail: student.email,
      counselorName,
      processingOfficerName,
      firstActions,
      moreActions,
      studentUrl,
    });

    const result = await sendEmail({ to: person.email, subject: mail.subject, text: mail.text, html: mail.html });
    // Recorded only on a send that worked, so a mail server outage is retried
    // by the next assignment rather than silently marked as delivered.
    if (!result?.error) {
      await admin.from("student_assignment_notices").insert({ student_id: studentId, staff_id: staffId, role });
      sent++;
    }
  }

  return { sent };
}
