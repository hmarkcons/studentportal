"use server";

import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { whatsappLink } from "@/lib/reengagement";
import {
  PORTAL_LOGIN,
  SECTION_PRESETS,
  credentialLabel,
  credentialsEmailHtml,
  credentialsEmailSubject,
  credentialsEmailText,
  credentialsNote,
  credentialsWhatsapp,
  hasSomething,
  inCredentialsSection,
  loginLabels,
  type CredentialsMessageInput,
  type StudentLogin,
} from "@/lib/studentCredentials";

type Session = Awaited<ReturnType<typeof getStaffSession>>;

/**
 * What is being sent:
 *
 *   "portal"   this portal's own login, from Registration & Portal Access;
 *   "section"  the logins ticked in Portal credentials — only ones that
 *              section holds, never this portal's own.
 */
export type CredentialScope = "portal" | "section";

/**
 * The student, and the logins asked for, read through the viewer's own
 * session.
 *
 * read_credential and list_credential_types let through only staff who can
 * see the student (staff_can_view_student) — exactly who may already press
 * Reveal — so anyone else reads nothing, and has nothing to send.
 */
async function load(supabase: Session["supabase"], studentId: string) {
  const [{ data: student }, { data: stored, error }] = await Promise.all([
    supabase.from("leads").select("id, full_name, email, contact_number, student_code").eq("id", studentId).maybeSingle(),
    supabase.rpc("list_credential_types", { p_owner_type: "student", p_owner_id: studentId }),
  ]);
  if (!student || error) return null;
  return { student, stored: (stored as string[] | null) ?? [] };
}

async function readLogins(supabase: Session["supabase"], studentId: string, types: readonly string[]): Promise<StudentLogin[]> {
  const logins = await Promise.all(
    types.map(async (credentialType) => {
      const { data, error } = await supabase.rpc("read_credential", {
        p_owner_type: "student",
        p_owner_id: studentId,
        p_credential_type: credentialType,
      });
      if (error || !data) return null;
      let parsed: { username?: string; password?: string };
      try {
        parsed = JSON.parse(data as string);
      } catch {
        parsed = { username: String(data), password: "" };
      }
      return { credentialType, username: parsed.username ?? "", password: parsed.password ?? "" };
    })
  );
  return logins.filter((l): l is StudentLogin => l !== null && hasSomething(l));
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

/**
 * The logins a send covers, after checking the request asks only for what its
 * place may send: this portal's own from Registration & Portal Access, and
 * from Portal credentials only logins that section holds and that are saved.
 */
async function resolve(scope: CredentialScope, studentId: string, types: readonly string[] | undefined) {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." } as const;
  const read = await load(supabase, studentId);
  if (!read) return { error: "That student is not one you can see." } as const;

  let wanted: string[];
  if (scope === "portal") {
    if (!read.stored.includes(PORTAL_LOGIN)) return { error: "This student has no portal login yet — create one first." } as const;
    wanted = [PORTAL_LOGIN];
  } else {
    wanted = [...new Set(types ?? [])].filter((t) => inCredentialsSection(t) && read.stored.includes(t));
    if (wanted.length === 0) return { error: "Tick at least one login to send." } as const;
  }

  const logins = await readLogins(supabase, studentId, wanted);
  if (logins.length === 0) return { error: "Nothing is saved for the logins ticked." } as const;
  const input: CredentialsMessageInput = {
    studentName: read.student.full_name ?? "",
    signInUrl: `${getSiteUrl()}/login`,
    studentCode: (read.student.student_code as string | null) ?? null,
    logins,
  };
  return { supabase, staff, student: read.student, input, labels: loginLabels(logins) } as const;
}

export type SectionLogin = { credentialType: string; label: string; saved: boolean };

/**
 * What Portal credentials can send: the logins it always offers and every
 * other one saved there, each saying whether anything is saved — never what.
 */
export async function sectionLogins(studentId: string): Promise<{ logins: SectionLogin[]; email: string | null } | { error: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };
  const read = await load(supabase, studentId);
  if (!read) return { error: "That student is not one you can see." };
  const types = [...new Set([...SECTION_PRESETS, ...read.stored.filter(inCredentialsSection)])];
  const saved = new Set((await readLogins(supabase, studentId, types.filter((t) => read.stored.includes(t)))).map((l) => l.credentialType));
  const order = loginLabels(types.map((t) => ({ credentialType: t, username: "x", password: "" })));
  const logins = types
    .map((t) => ({ credentialType: t, label: credentialLabel(t), saved: saved.has(t) }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return { logins, email: (read.student.email as string | null) ?? null };
}

/** Emails the student the logins this place sends, to the address on their record. */
export async function emailStudentLogins(
  scope: CredentialScope,
  studentId: string,
  types?: string[]
): Promise<{ success: true; to: string; labels: string[] } | { error: string }> {
  const r = await resolve(scope, studentId, types);
  if ("error" in r) return { error: r.error! };
  const to = ((r.student.email as string | null) ?? "").trim();
  if (!to) return { error: "There is no email on this student's record — add one, or copy it as a message instead." };

  const sent = await sendEmail({
    to,
    subject: credentialsEmailSubject(r.input.logins),
    text: credentialsEmailText(r.input),
    html: credentialsEmailHtml(r.input),
  });
  // Said plainly rather than noted as sent: a mail that did not go, recorded
  // as sent, is worse than a failure on screen.
  if ("error" in sent) return { error: `The email did not go: ${sent.error}` };

  await note(r.supabase, studentId, r.staff.id, credentialsNote("email", r.labels, to));
  return { success: true, to, labels: r.labels };
}

/**
 * The same logins as one message, to paste into WhatsApp — and a link that
 * opens WhatsApp on the student's number with it typed in, when the number is
 * one wa.me can use. Noted on the timeline: whoever takes a copy has the
 * passwords, sent or not.
 */
export async function copyStudentLogins(
  scope: CredentialScope,
  studentId: string,
  types?: string[]
): Promise<{ text: string; labels: string[]; whatsapp: string | null } | { error: string }> {
  const r = await resolve(scope, studentId, types);
  if ("error" in r) return { error: r.error! };
  const text = credentialsWhatsapp(r.input);
  await note(r.supabase, studentId, r.staff.id, credentialsNote("copy", r.labels));
  return { text, labels: r.labels, whatsapp: whatsappLink(r.student.contact_number as string | null, text) };
}
