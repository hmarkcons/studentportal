"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { sendEmail, accountsFrom } from "@/lib/email";
import { messageBodyError } from "@/lib/messages";
import { buildReengagementDraft, type ReengagementDraft, type ReengagementTemplates } from "@/lib/reengagement";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type ReengagementContext = {
  draft: ReengagementDraft | null;
  studentEmail: string | null;
  contactNumber: string | null;
  /** Null when the wording row has been deleted, so the screen can say so. */
  templatesMissing: boolean;
};

/**
 * The draft for this student, if they have stopped.
 *
 * Read on the server so the wording, the student's name and their counsellor's
 * name are resolved once — the same text the counsellor reads is the text that
 * gets sent, rather than the browser filling placeholders a second time.
 */
export async function loadReengagementContext(studentId: string): Promise<ReengagementContext> {
  const supabase = await createClient();

  const [{ data: student }, { data: templates }] = await Promise.all([
    supabase
      .from("leads")
      .select("full_name, email, contact_number, registration_status, counsellor:staff!leads_assigned_counselor_id_fkey(full_name)")
      .eq("id", studentId)
      .maybeSingle(),
    supabase
      .from("reengagement_messages")
      .select("ghost_subject, ghost_body, withdrawn_subject, withdrawn_body")
      .eq("id", true)
      .maybeSingle(),
  ]);

  if (!student) return { draft: null, studentEmail: null, contactNumber: null, templatesMissing: false };

  const counsellor = one(student.counsellor as never) as { full_name?: string } | null;
  const draft = buildReengagementDraft(
    student.registration_status,
    { full_name: student.full_name },
    counsellor?.full_name ?? null,
    (templates as ReengagementTemplates | null) ?? null
  );

  return {
    draft,
    studentEmail: student.email ?? null,
    contactNumber: student.contact_number ?? null,
    // Only worth saying when there is a student who would have had one.
    templatesMissing: !templates && Boolean(student.registration_status),
  };
}

/**
 * Sends the re-engagement message, and records that it went.
 *
 * One row in `messages`, and its channel is whichever way it actually left:
 * 'email' when an email was sent, 'inapp' when it only went to the portal.
 * The thread must never claim a channel that was not used — the same reason
 * sendMessage refuses anything but in-app and internal notes.
 *
 * No new permission. Any staff member who can see the student can message
 * them, which is what the messages policies already say; the wording itself is
 * what is gated, in Setup.
 */
export async function sendReengagementMessage(studentId: string, _prevState: unknown, formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const alsoEmail = formData.get("also_email") === "on";

  const bodyInvalid = messageBodyError(formData.get("body"));
  if (bodyInvalid) return { error: bodyInvalid };
  if (alsoEmail && !subject) return { error: "An email needs a subject." };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  const { data: student } = await supabase.from("leads").select("full_name, email").eq("id", studentId).maybeSingle();
  if (!student) return { error: "That student no longer exists." };

  let emailed = false;
  if (alsoEmail) {
    if (!student.email) return { error: "This student has no email address on file — send it to their portal instead." };
    try {
      await sendEmail({
        to: student.email,
        subject,
        text: body,
        from: accountsFrom(),
      });
      emailed = true;
    } catch (e) {
      // Said plainly rather than recorded as sent. A message the student never
      // received, logged as delivered, is worse than a failure on screen.
      return { error: `The email did not go: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const { error } = await supabase.from("messages").insert({
    entity_type: "student",
    entity_id: studentId,
    channel: emailed ? "email" : "inapp",
    direction: "outbound",
    body: emailed ? `${subject}\n\n${body}` : body,
    sent_by: staff.id,
    delivery_status: "sent",
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/portal/messages");
  return { success: true, emailed };
}

/**
 * Records a message the counsellor sent by hand on WhatsApp.
 *
 * The app has no WhatsApp gateway, so copying the text is all it can do. This
 * is how the fact of it having been sent gets onto the student's thread —
 * offered only after the text has been copied, because logging something
 * nobody sent would make the record worse than no record.
 */
export async function logWhatsappReengagement(studentId: string, _prevState: unknown, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const bodyInvalid = messageBodyError(formData.get("body"));
  if (bodyInvalid) return { error: bodyInvalid };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  const { error } = await supabase.from("messages").insert({
    entity_type: "student",
    entity_id: studentId,
    channel: "whatsapp",
    direction: "outbound",
    body,
    sent_by: staff.id,
    delivery_status: "sent",
  });
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

/** Saves the office's wording. */
export async function updateReengagementMessages(_prevState: unknown, formData: FormData) {
  const denied = await requirePermission(
    "settings.reengagement_messages",
    "Only Management and Super Admin can change the re-engagement messages."
  );
  if (denied) return { error: denied.error };

  const read = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);
  const fields = {
    ghost_subject: read("ghost_subject", 300),
    ghost_body: read("ghost_body", 6000),
    withdrawn_subject: read("withdrawn_subject", 300),
    withdrawn_body: read("withdrawn_body", 6000),
  };

  for (const [label, value] of [
    ["subject for a student who has gone quiet", fields.ghost_subject],
    ["message for a student who has gone quiet", fields.ghost_body],
    ["subject for a student who has withdrawn", fields.withdrawn_subject],
    ["message for a student who has withdrawn", fields.withdrawn_body],
  ] as const) {
    if (!value) return { error: `The ${label} cannot be empty.` };
  }

  // A placeholder nobody spelled correctly reaches a student as literal text.
  const stray = Object.values(fields)
    .join(" ")
    .match(/\{[^}]*\}/g)
    ?.filter((m) => m !== "{name}" && m !== "{counsellor}");
  if (stray?.length) {
    return {
      error: `${stray[0]} is not something that can be filled in — only {name} and {counsellor} are, and the student would read it exactly as written.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("reengagement_messages")
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That change was refused — you may not have permission for it." };

  revalidatePath("/setup/reengagement-messages");
  return { success: true };
}
