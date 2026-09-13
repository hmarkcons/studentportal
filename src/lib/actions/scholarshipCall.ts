"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { fetchCallPdf } from "@/lib/scholarshipCallPdf";

const PAGE = "/setup/scholarship-bodies";
const BUCKET = "documents";
/** Everything under here is readable by any signed-in user and writable by the scholarship roles (0175). */
const PREFIX = "scholarship-calls";

async function gate() {
  const denied = await requirePermission("scholarships.manage", "Only Super Admin and the Processing team can manage scholarships.");
  return denied ? denied.error : null;
}

/**
 * Downloads a body's official call and keeps a copy against it.
 *
 * The guide in this system is HMARK's summary; the call is the document that
 * governs, and each region takes last year's PDF down the week the new one
 * appears. A copy means the paper a student was advised from still exists in
 * March, and that staff and student are reading the same one.
 *
 * The URL may be given, or taken from what is already on the body — the
 * research run records one when it finds it, and staff can paste one in.
 */
export async function downloadScholarshipCall(bodyId: string, url?: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { data: body } = await supabase
    .from("scholarship_bodies")
    .select("id, name, academic_year, call_pdf_url, call_pdf_path")
    .eq("id", bodyId)
    .maybeSingle();
  if (!body) return { error: "That scholarship body no longer exists." };

  const target = (url ?? body.call_pdf_url ?? "").trim();
  if (!target) return { error: "There is no call link on this body yet — add one first." };

  const fetched = await fetchCallPdf(target, body.name, body.academic_year);
  if (!fetched.ok) return { error: fetched.error };

  // Keyed by body id so one body's calls stay together, and stamped so last
  // year's copy is not overwritten by this year's — the whole point is that
  // the paper a student was advised from is still there.
  const path = `${PREFIX}/${body.id}/${Date.now()}-${fetched.filename}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, fetched.bytes, {
    contentType: fetched.contentType,
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .from("scholarship_bodies")
    .update({
      call_pdf_path: path,
      call_pdf_url: target,
      call_pdf_language: fetched.language,
      call_pdf_fetched_at: new Date().toISOString(),
    })
    .eq("id", bodyId);
  if (updateError) {
    // The row is the record; a file nothing points at is litter.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: updateError.message };
  }

  revalidatePath(PAGE);
  return {
    success: true,
    language: fetched.language,
    bytes: fetched.bytes.length,
    // Said plainly: a forty-page Italian bando is worth flagging before
    // somebody sends it to a student.
    note:
      fetched.language === "it"
        ? "Saved. This call is in Italian — most regions publish no English version."
        : fetched.language === "en"
          ? "Saved. This looks like the English version."
          : "Saved. The language could not be told from the address — open it to check.",
  };
}

/** A link that works for an hour, for whoever is looking at the row. */
export async function scholarshipCallUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Removes the stored copy, leaving the link. */
export async function removeScholarshipCall(bodyId: string) {
  const error = await gate();
  if (error) return { error };

  const supabase = await createClient();
  const { data: body } = await supabase.from("scholarship_bodies").select("call_pdf_path").eq("id", bodyId).maybeSingle();
  if (!body?.call_pdf_path) return { error: "There is no stored call to remove." };

  await supabase.storage.from(BUCKET).remove([body.call_pdf_path]);
  const { error: updateError } = await supabase
    .from("scholarship_bodies")
    .update({ call_pdf_path: null, call_pdf_language: null, call_pdf_fetched_at: null })
    .eq("id", bodyId);
  if (updateError) return { error: updateError.message };

  revalidatePath(PAGE);
  return { success: true };
}
