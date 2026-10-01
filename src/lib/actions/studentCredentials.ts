"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { whatsappLink } from "@/lib/reengagement";
import {
  credentialsEmailHtml,
  credentialsEmailSubject,
  credentialsEmailText,
  credentialsNote,
  credentialsWhatsapp,
  loginLabels,
  type CredentialsMessageInput,
  type StudentLogin,
} from "@/lib/studentCredentials";

type Session = Awaited<ReturnType<typeof getStaffSession>>;

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Every login on file for a student — their own, and the ones kept against
 * each of their applications — read through the viewer's own session.
 *
 * read_credential lets through only staff who can see the student
 * (staff_can_view_student: a counsellor their own students, Processing,
 * Management and Super Admin all of them), which is exactly who may already
 * press Reveal; anyone else gets nothing, and so has nothing to send.
 */
async function studentLogins(supabase: Session["supabase"], studentId: string) {
  const [{ data: student }, { data: applications }, { data: ownTypes }] = await Promise.all([
    supabase.from("leads").select("id, full_name, email, contact_number, student_code").eq("id", studentId).maybeSingle(),
    supabase.from("applications").select("id, university:universities(name)").eq("student_id", studentId),
    supabase.rpc("list_credential_types", { p_owner_type: "student", p_owner_id: studentId }),
  ]);
  if (!student) return null;

  const appTypes = await Promise.all(
    (applications ?? []).map(async (a) => {
      const { data } = await supabase.rpc("list_credential_types", { p_owner_type: "application", p_owner_id: a.id });
      const university = (one(a.university as never) as { name?: string } | null)?.name ?? null;
      return ((data as string[] | null) ?? []).map((t) => ({ ownerType: "application" as const, ownerId: a.id as string, credentialType: t, university }));
    })
  );
  const wanted = [
    ...((ownTypes as string[] | null) ?? []).map((t) => ({ ownerType: "student" as const, ownerId: studentId, credentialType: t, university: null })),
    ...appTypes.flat(),
  ];

  const logins: StudentLogin[] = [];
  await Promise.all(
    wanted.map(async (w) => {
      const { data, error } = await supabase.rpc("read_credential", {
        p_owner_type: w.ownerType,
        p_owner_id: w.ownerId,
        p_credential_type: w.credentialType,
      });
      if (error || !data) return;
      let parsed: { username?: string; password?: string };
      try {
        parsed = JSON.parse(data as string);
      } catch {
        parsed = { username: String(data), password: "" };
      }
      logins.push({ credentialType: w.credentialType, university: w.university, username: parsed.username ?? "", password: parsed.password ?? "" });
    })
  );

  const input: CredentialsMessageInput = {
    studentName: student.full_name ?? "",
    signInUrl: `${getSiteUrl()}/login`,
    studentCode: (student.student_code as string | null) ?? null,
    logins,
  };
  return { student, input, labels: loginLabels(logins) };
}

/** A line on the student's timeline, for the office only — what went, never a password. */
async function note(supabase: Session["supabase"], studentId: string, staffId: string, body: string) {
  await supabase.from("messages").insert({
    entity_type: "student",
    entity_id: studentId,
    channel: "internal_note",
    direction: "outbound",
    body,
    sent_by: staffId,
    delivery_status: "sent",
  });
  revalidatePath(`/students/${studentId}/communication`);
}

/** What the email would carry, and where it would go — for the confirmation before it is sent. */
export async function previewStudentCredentials(studentId: string): Promise<{ labels: string[]; email: string | null } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const read = await studentLogins(supabase, studentId);
  if (!read) return { error: "That student is not one you can see." };
  return { labels: read.labels, email: (read.student.email as string | null) ?? null };
}

/** Emails the student every login on file, to the address on their record. */
export async function emailStudentCredentials(studentId: string): Promise<{ success: true; to: string; labels: string[] } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const read = await studentLogins(supabase, studentId);
  if (!read) return { error: "That student is not one you can see." };
  const to = ((read.student.email as string | null) ?? "").trim();
  if (!to) return { error: "There is no email on this student's record — add one, or copy the logins as a message instead." };
  if (read.labels.length === 0) return { error: "No logins are saved for this student yet." };

  const sent = await sendEmail({
    to,
    subject: credentialsEmailSubject(),
    text: credentialsEmailText(read.input),
    html: credentialsEmailHtml(read.input),
  });
  // Said plainly rather than noted as sent: a mail that did not go, recorded
  // as sent, is worse than a failure on screen.
  if ("error" in sent) return { error: `The email did not go: ${sent.error}` };

  await note(supabase, studentId, staff.id, credentialsNote("email", read.labels, to));
  return { success: true, to, labels: read.labels };
}

/**
 * Every login on file as one message, to paste into WhatsApp — and a link
 * that opens WhatsApp on the student's number with it typed in, when the
 * number is one wa.me can use. Noted on the timeline: whoever takes a copy has
 * the passwords, sent or not.
 */
export async function copyStudentCredentials(
  studentId: string
): Promise<{ text: string; labels: string[]; whatsapp: string | null } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const read = await studentLogins(supabase, studentId);
  if (!read) return { error: "That student is not one you can see." };
  if (read.labels.length === 0) return { error: "No logins are saved for this student yet." };

  const text = credentialsWhatsapp(read.input);
  await note(supabase, studentId, staff.id, credentialsNote("copy", read.labels));
  return { text, labels: read.labels, whatsapp: whatsappLink(read.student.contact_number as string | null, text) };
}
