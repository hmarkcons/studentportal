"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { profileDerivedRequirements, reconcileDerived } from "@/lib/documentChecklist";

// The static document_templates checklist (Passport copy, Academic
// transcripts, ...) previously had no auto-population anywhere — staff had
// to manually re-type every standard document on every single application.
// This makes each student's checklist come from that static list
// automatically, as student-level rows (application_id null) so the same
// document (e.g. passport) covers every application instead of needing a
// separate upload per university. Safe to call on every page load —
// existing template_ids are checked first and only the missing ones get
// inserted (not a DB-level upsert: some real students already have
// per-application rows sharing a template_id from before this fix existed,
// which a plain (student_id, template_id) unique constraint would collide
// with, and a partial index scoped to application_id is null can't be used
// as a Postgres/PostgREST upsert onConflict target without an explicit
// inference WHERE clause, which the JS client has no way to pass). Always
// runs as the admin client since a student has no INSERT grant on
// student_documents (only staff do, via student_documents_staff_write) —
// this is system bookkeeping, not user-submitted data, and every value it
// reads/writes is already visible to whichever caller (staff or the
// student themself) triggered it.
//
// Two sources feed the checklist now:
//
//   * document_templates, as before — the destination's own items plus the
//     shared ones, minus any shared item that destination has explicitly
//     dropped in the builder (destination_document_exclusions).
//   * the student's own profile — a requirement per qualification (certificate
//     and transcript, separately) and per test score they have entered, plus
//     one row each for travel history and prior refusals when they have any.
//     These carry a derived_key so this stays idempotent and so a requirement
//     whose profile entry has gone can be found again.
export async function ensureStudentDocumentRequirements(studentId: string) {
  const supabase = createAdminClient();
  const [
    { data: student },
    { data: destRows },
    { data: templates },
    { data: existing },
    { data: exclusions },
    { data: qualifications },
    { data: testScores },
    { data: profile },
  ] = await Promise.all([
    supabase.from("leads").select("level_applying_for").eq("id", studentId).maybeSingle(),
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId),
    supabase.from("document_templates").select("id, category, level, destination_id"),
    supabase
      .from("student_documents")
      .select("id, template_id, derived_key, file_path")
      .eq("student_id", studentId)
      .is("application_id", null),
    supabase.from("destination_document_exclusions").select("destination_id, template_id"),
    supabase.from("student_qualifications").select("id, qualification_type, qualification_name").eq("student_id", studentId),
    supabase.from("student_test_scores").select("id, test_type, custom_test_name").eq("student_id", studentId),
    supabase.from("student_profiles").select("travel_history, visa_refusal_history").eq("student_id", studentId).maybeSingle(),
  ]);

  const destinationIds = new Set((destRows ?? []).map((d) => d.destination_id));
  const existingRows = existing ?? [];
  const existingTemplateIds = new Set(existingRows.map((d) => d.template_id).filter(Boolean));
  const level = student?.level_applying_for;

  // A shared item is dropped for this student only if EVERY destination they
  // are pursuing has excluded it — one country not asking for a document is no
  // reason to stop collecting it for another the student is also applying to.
  const excludedByDestination = new Map<string, Set<string>>();
  for (const e of exclusions ?? []) {
    const set = excludedByDestination.get(e.destination_id) ?? new Set<string>();
    set.add(e.template_id);
    excludedByDestination.set(e.destination_id, set);
  }
  const excludedEverywhere = (templateId: string) =>
    destinationIds.size > 0 &&
    [...destinationIds].every((d) => excludedByDestination.get(d as string)?.has(templateId));

  const missing = (templates ?? []).filter((t) => {
    if (existingTemplateIds.has(t.id)) return false;
    const levelMatches = t.level === "all" || t.level === level;
    const destMatches = t.destination_id === null || destinationIds.has(t.destination_id);
    if (!levelMatches || !destMatches) return false;
    if (t.destination_id === null && excludedEverywhere(t.id)) return false;
    return true;
  });

  if (missing.length > 0) {
    const { error } = await supabase.from("student_documents").insert(
      missing.map((t) => ({
        student_id: studentId,
        application_id: null,
        template_id: t.id,
        category: t.category,
        status: "missing",
      }))
    );
    // 23505 = the partial unique index caught a concurrent duplicate insert
    // (two page loads racing) — safe to ignore, the row already exists.
    if (error && error.code !== "23505") throw error;
  }

  const wanted = profileDerivedRequirements({
    qualifications: qualifications ?? [],
    testScores: testScores ?? [],
    travelHistoryCount: Array.isArray(profile?.travel_history) ? profile!.travel_history.length : 0,
    visaHistoryCount: Array.isArray(profile?.visa_refusal_history) ? profile!.visa_refusal_history.length : 0,
  });
  const { toInsert, toDeleteIds } = reconcileDerived(wanted, existingRows);

  if (toInsert.length > 0) {
    const { error } = await supabase.from("student_documents").insert(
      toInsert.map((r) => ({
        student_id: studentId,
        application_id: null,
        template_id: null,
        derived_key: r.derivedKey,
        category: r.category,
        custom_name: r.name,
        status: "missing",
      }))
    );
    if (error && error.code !== "23505") throw error;
  }

  // Only ever empty rows: reconcileDerived keeps anything with a file, so a
  // qualification corrected in the profile cannot delete the document the
  // student already sent in.
  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from("student_documents").delete().in("id", toDeleteIds);
    if (error) throw error;
  }
}

export async function uploadDocument(
  documentId: string,
  studentId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  const path = `${studentId}/${documentId}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("student_documents")
    .update({
      file_path: path,
      status: "submitted",
      uploaded_at: new Date().toISOString(),
      uploaded_by_role: "staff",
    })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function reviewDocument(documentId: string, revalidateTo: string, status: "verified" | "rejected", reason?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const trimmedReason = reason?.trim() || null;
  const { error } = await supabase
    .from("student_documents")
    .update({
      status,
      verified_by: user?.id,
      verified_at: new Date().toISOString(),
      rejected_reason: status === "rejected" ? trimmedReason : null,
    })
    .eq("id", documentId);

  revalidatePath(revalidateTo);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteDocumentRequirement(documentId: string, revalidateTo: string) {
  const supabase = await createClient();

  const { data: doc } = await supabase.from("student_documents").select("file_path").eq("id", documentId).maybeSingle();

  // Delete the DB row (the source of truth for what's shown as "on record")
  // before touching storage — if storage cleanup below fails, the worst
  // case is a harmless orphaned file with nothing left pointing at it. Doing
  // it in the other order risks the opposite: a row that still claims to
  // have a file on record after that file's already gone, 404ing on view
  // with no indication why.
  const { error } = await supabase.from("student_documents").delete().eq("id", documentId);
  if (error) return { error: error.message };

  if (doc?.file_path) {
    await supabase.storage.from("documents").remove([doc.file_path]);
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function addDocumentRequirement(
  studentId: string,
  applicationId: string | null,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const category = String(formData.get("category") ?? "other");
  const name = String(formData.get("name") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "") || null;

  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("student_documents").insert({
    student_id: studentId,
    application_id: applicationId,
    category,
    custom_name: name,
    deadline,
    status: "missing",
  });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
