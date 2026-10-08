"use server";

import { removeStorageFiles } from "@/lib/fileTrash";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { documentFilePath, parseSourceNames } from "@/lib/documentFileNames";
import { profileDerivedRequirements, reconcileDerived, templatesToSeed } from "@/lib/documentChecklist";
import { requirePermission } from "@/lib/auth/permissions";
import { categoryCarriesOver } from "@/lib/intakeCycle";
import { ensureCurrentCycle } from "@/lib/ensureCycle";
import { uploadedFile } from "@/lib/stagedUpload";
import { syncStagesForDocument, syncStudentStages } from "@/lib/autoStagesSync";

const MANAGE_DENIED = "Only Super Admin and the Processing team can add or remove document requirements.";

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
//
// Resolves to whether it added, renamed or removed anything, so a page that
// read the checklist beside it knows when that read is out of date.
export async function ensureStudentDocumentRequirements(studentId: string): Promise<boolean> {
  const supabase = createAdminClient();
  let changed = false;
  const [
    currentCycle,
    { data: student },
    { data: destRows },
    { data: templates },
    { data: existing },
    { data: exclusions },
    { data: qualifications },
    { data: testScores },
    { data: profile },
    { data: removals },
  ] = await Promise.all([
    // Beside the reads rather than after them. When it has to create the
    // student's first cycle it also stamps their existing rows with it, which
    // the `existing` read below may or may not see — and neither matters: a
    // first cycle is sequence 1, and on a first attempt every row counts
    // whatever its cycle says.
    ensureCurrentCycle(studentId),
    supabase.from("leads").select("level_applying_for, service_type").eq("id", studentId).maybeSingle(),
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId),
    supabase.from("document_templates").select("id, category, level, destination_id, name, sort_order, renew_each_intake, skip_for_visa_only"),
    supabase
      .from("student_documents")
      .select("id, template_id, derived_key, file_path, category, custom_name, cycle_id, status, template:document_templates(name)")
      .eq("student_id", studentId)
      .is("application_id", null),
    supabase.from("destination_document_exclusions").select("destination_id, template_id"),
    supabase
      .from("student_qualifications")
      .select("id, qualification_type, qualification_name, institution_name")
      .eq("student_id", studentId),
    supabase.from("student_test_scores").select("id, test_type, custom_test_name").eq("student_id", studentId),
    supabase.from("student_profiles").select("travel_history, visa_refusal_history").eq("student_id", studentId).maybeSingle(),
    // Requirements staff deleted for this student (0328): never added back.
    supabase.from("student_document_removals").select("template_id, derived_key").eq("student_id", studentId),
  ]);
  const removedTemplates = new Set((removals ?? []).map((r) => r.template_id as string | null).filter(Boolean));
  const removedKeys = new Set((removals ?? []).map((r) => r.derived_key as string | null).filter(Boolean));

  const destinationIds = new Set((destRows ?? []).map((d) => d.destination_id));
  const existingRows = existing ?? [];
  const level = student?.level_applying_for;

  // Which intake this student is working towards, and which requirements a
  // previous intake has already satisfied.
  //
  // A row from an earlier intake normally counts, which is exactly the
  // carry-over the office asked for: nobody re-uploads their degree. It does
  // NOT count when the requirement is marked to be renewed each intake, or
  // when it is one of the categories that deliberately does not follow a
  // student across — the visa and the scholarship. Those are asked for again.
  //
  // Taken from ensureCurrentCycle's return value, never re-read: Next.js
  // memoizes identical fetch GETs within a render, so re-querying
  // student_cycles here returned the pre-insert empty response and stamped
  // every document with no intake. See the note in ensureCycle.ts.
  const currentCycleId = currentCycle?.id ?? null;
  const isFirstAttempt = !currentCycle || currentCycle.sequence === 1;

  const renewTemplateIds = new Set(
    (templates ?? []).filter((t) => t.renew_each_intake).map((t) => t.id as string)
  );
  const satisfiedTemplateIds = new Set(
    existingRows
      .filter((r) => {
        if (!r.template_id) return false;
        // In this intake, any row counts — it is the row for this intake.
        if (isFirstAttempt || (r.cycle_id ?? null) === currentCycleId) return true;
        // From an earlier intake: only if it still counts.
        if (renewTemplateIds.has(r.template_id as string)) return false;
        if (!categoryCarriesOver(r.category)) return false;
        return r.status === "verified";
      })
      .map((r) => r.template_id)
  );
  const existingTemplateIds = satisfiedTemplateIds;

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

  // A visa-only client (0279) already has their admission, so the items that
  // exist only to win one are not asked of them (0280).
  const visaOnly = student?.service_type === "visa_only";
  const skippedForVisaOnly = new Set((templates ?? []).filter((t) => t.skip_for_visa_only).map((t) => t.id as string));

  const applicable = (templates ?? []).filter((t) => {
    if (existingTemplateIds.has(t.id)) return false;
    if (removedTemplates.has(t.id)) return false;
    if (visaOnly && skippedForVisaOnly.has(t.id as string)) return false;
    const levelMatches = t.level === "all" || t.level === level;
    const destMatches = t.destination_id === null || destinationIds.has(t.destination_id);
    if (!levelMatches || !destMatches) return false;
    if (t.destination_id === null && excludedEverywhere(t.id)) return false;
    return true;
  });

  // One document is one requirement, however many of the student's countries
  // ask for it — see templatesToSeed. Without this, a student pursuing Germany
  // and Italy gets two rows for the single HEC attestation they will hand in.
  const missing = templatesToSeed(
    applicable.map((t) => ({
      id: t.id,
      destination_id: t.destination_id,
      category: t.category,
      name: t.name,
      sort_order: t.sort_order ?? 0,
    })),
    // Only rows that actually satisfy a requirement for THIS intake. Passing
    // every row the student has ever had would silently suppress the
    // renew-each-intake requirements and the visa documents, which is the one
    // thing a new intake has to ask for again.
    existingRows
      .filter((r) =>
        r.template_id
          ? satisfiedTemplateIds.has(r.template_id)
          : isFirstAttempt || (r.cycle_id ?? null) === currentCycleId || categoryCarriesOver(r.category)
      )
      .map((r) => {
        // PostgREST returns an embedded row as an object or a single-element
        // array depending on the relationship it infers, so both are handled.
        const embedded = r.template as { name?: string } | { name?: string }[] | null;
        const templateName = (Array.isArray(embedded) ? embedded[0] : embedded)?.name ?? null;
        return { category: r.category, label: r.custom_name ?? templateName };
      })
  );

  if (missing.length > 0) {
    const { error } = await supabase.from("student_documents").insert(
      missing.map((t) => ({
        student_id: studentId,
        application_id: null,
        template_id: t.id,
        category: t.category,
        status: "missing",
        cycle_id: currentCycleId,
      }))
    );
    // 23505 = the partial unique index caught a concurrent duplicate insert
    // (two page loads racing) — safe to ignore, the row already exists.
    if (error && error.code !== "23505") throw error;
    changed = true;
  }

  const wanted = profileDerivedRequirements({
    qualifications: qualifications ?? [],
    testScores: testScores ?? [],
    travelHistoryCount: Array.isArray(profile?.travel_history) ? profile!.travel_history.length : 0,
    visaHistoryCount: Array.isArray(profile?.visa_refusal_history) ? profile!.visa_refusal_history.length : 0,
  });
  const reconciled = reconcileDerived(wanted, existingRows);
  const { toDeleteIds, toRename } = reconciled;
  const toInsert = reconciled.toInsert.filter((r) => !removedKeys.has(r.derivedKey));

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
        cycle_id: currentCycleId,
      }))
    );
    if (error && error.code !== "23505") throw error;
    changed = true;
  }

  // A school renamed or first named in the profile, so the requirement says
  // which institution it is for. Only the label moves — the uploaded file and
  // its review state are untouched.
  for (const row of toRename) {
    const { error } = await supabase.from("student_documents").update({ custom_name: row.name }).eq("id", row.id);
    if (error) throw error;
    changed = true;
  }

  // A student made visa-only after their checklist was built: the admission
  // items still waiting to be sent are no longer wanted. Only empty ones — a
  // document that has been sent in stays, whatever it is.
  if (visaOnly) {
    const unwanted = existingRows
      .filter((r) => r.template_id && skippedForVisaOnly.has(r.template_id as string) && !r.file_path && r.status === "missing")
      .map((r) => r.id as string);
    if (unwanted.length > 0) {
      const { error } = await supabase.from("student_documents").delete().in("id", unwanted);
      if (error) throw error;
      changed = true;
    }
  }

  // Only ever empty rows: reconcileDerived keeps anything with a file, so a
  // qualification corrected in the profile cannot delete the document the
  // student already sent in.
  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from("student_documents").delete().in("id", toDeleteIds);
    if (error) throw error;
    changed = true;
  }
  return changed;
}

export async function uploadDocument(
  documentId: string,
  studentId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const file = await uploadedFile(formData, "file");

  if (!file || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  // A file of its own beside any already there (0328): several chosen at once
  // arrive here joined into one, with the names they were joined from.
  const path = documentFilePath(studentId, documentId, sanitizeFilename(file.name), crypto.randomUUID().slice(0, 8));
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.rpc("add_student_document_file", {
    p_document_id: documentId,
    p_path: path,
    p_name: file.name,
    p_sources: parseSourceNames(formData.get("file_sources")),
    p_role: "staff",
    p_status: "submitted",
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    return { error: error.message === "not authorized" ? "Only the student's processing team can upload their documents." : error.message };
  }

  await syncStudentStages(studentId);
  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Approves one file of a requirement, or sends it back with a reason (0328).
 * The requirement is approved once every file of it is; a file sent back
 * sends the requirement back, with its reason, to the student.
 *
 * A file with no id is one on record from before files were kept one by one:
 * reviewed on the requirement itself, as it always was.
 */
export async function reviewDocumentFile(
  fileId: string | null,
  documentId: string,
  revalidateTo: string,
  status: "verified" | "rejected",
  reason?: string
) {
  const supabase = await createClient();
  const trimmed = reason?.trim() || null;
  if (status === "rejected" && !trimmed) {
    return { error: "Give a reason for sending it back — the student sees it and needs to know what to fix." };
  }
  let error: { message: string } | null = null;
  if (fileId) {
    ({ error } = await supabase.rpc("review_student_document_file", { p_file_id: fileId, p_status: status, p_reason: trimmed }));
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    ({ error } = await supabase
      .from("student_documents")
      .update({ status, verified_by: user?.id, verified_at: new Date().toISOString(), rejected_reason: status === "rejected" ? trimmed : null })
      .eq("id", documentId));
  }
  if (error) return { error: error.message === "not authorized" ? "Only the student's processing team can review their documents." : error.message };
  await syncStagesForDocument(documentId);
  revalidatePath(revalidateTo);
  return { success: true };
}

/** Takes one file off a requirement; the file itself is kept for 90 days (fileTrash). */
export async function removeDocumentFile(fileId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_student_document_file", { p_file_id: fileId });
  if (error) return { error: error.message === "not authorized" ? "Only the student's processing team can remove their files." : error.message };
  if (typeof path === "string" && path) await removeStorageFiles(supabase, "documents", [path]);
  await syncStudentStages(studentId);
  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Puts a requirement deleted for this student back on their checklist: the
 * mark that kept it off is removed, and the checklist is brought up to date.
 */
export async function restoreDocumentRequirement(removalId: string, studentId: string, revalidateTo: string) {
  const denied = await requirePermission("documents.manage_requirements", MANAGE_DENIED);
  if (denied) return { error: denied.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("student_document_removals").delete().eq("id", removalId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That requirement is already back, or is not yours to change." };
  await ensureStudentDocumentRequirements(studentId);
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteDocumentRequirement(documentId: string, revalidateTo: string) {
  const denied = await requirePermission("documents.manage_requirements", MANAGE_DENIED);
  if (denied) return { error: denied.error };

  const supabase = await createClient();

  const [{ data: doc }, { data: files }] = await Promise.all([
    supabase
      .from("student_documents")
      .select("file_path, student_id, application_id, template_id, derived_key, custom_name, category, template:document_templates(name)")
      .eq("id", documentId)
      .maybeSingle(),
    supabase.from("student_document_files").select("file_path").eq("document_id", documentId),
  ]);

  // Delete the DB row (the source of truth for what's shown as "on record")
  // before touching storage — if storage cleanup below fails, the worst
  // case is a harmless orphaned file with nothing left pointing at it. Doing
  // it in the other order risks the opposite: a row that still claims to
  // have a file on record after that file's already gone, 404ing on view
  // with no indication why.
  const { error } = await supabase.from("student_documents").delete().eq("id", documentId);
  if (error) return { error: error.message };

  // Every file of it, kept for 90 days (fileTrash) so a restore brings them back.
  const paths = [...new Set([doc?.file_path, ...(files ?? []).map((f) => f.file_path as string)].filter((p): p is string => Boolean(p)))];
  if (paths.length) await removeStorageFiles(supabase, "documents", paths);

  // Remembered, so the checklist does not add it straight back on the next
  // page load (0328): a template's requirement, or one from the profile.
  if (doc && !doc.application_id && (doc.template_id || doc.derived_key)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const template = (Array.isArray(doc.template) ? doc.template[0] : doc.template) as { name?: string } | null;
    await supabase.from("student_document_removals").insert({
      student_id: doc.student_id,
      template_id: doc.template_id ?? null,
      derived_key: doc.template_id ? null : (doc.derived_key ?? null),
      name: (doc.custom_name as string | null) ?? template?.name ?? (doc.category as string | null) ?? null,
      removed_by: user?.id ?? null,
    });
  }

  if (doc?.student_id) await syncStudentStages(doc.student_id as string);
  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Files a document the university sent — an acceptance or offer letter, an
 * admission or invitation letter, a CAS, an I-20 — on the application it
 * answers (0294).
 *
 * Kept as a student document under Acceptance Letters, so it is in the
 * Documents tab with everything else and on the student's own Documents page,
 * named after the university. Approved as it is filed: it came from the
 * university, and there is nothing for the student to send back. The stages
 * then catch up — a letter moves the application to its offer stage and the
 * country's Admission to Issued (autoStages.ts).
 *
 * The row is written before the file so the path can carry its id, and taken
 * back out if the file does not follow; a document on record with no file
 * behind it would say "approved" about nothing.
 */
export async function uploadApplicationDocument(
  studentId: string,
  applicationId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  // The card is shown to those who manage requirements; the action holds the
  // same line, since what it files is approved on arrival.
  const denied = await requirePermission("documents.manage_requirements", "Only Super Admin and the Processing team can file documents from the university.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Say what the document is — an acceptance letter, an offer letter, a CAS…" };
  if (name.length > 120) return { error: "Keep the document's name to 120 characters." };

  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  const validationError = validateDocumentFile(file);
  if (validationError) return { error: validationError };

  const { data: app } = await supabase.from("applications").select("id, student_id, cycle_id").eq("id", applicationId).maybeSingle();
  if (!app || app.student_id !== studentId) return { error: "That application isn't this student's." };
  const cycleId = (app.cycle_id as string | null) ?? (await ensureCurrentCycle(studentId))?.id ?? null;

  const now = new Date().toISOString();
  const { data: row, error: insertError } = await supabase
    .from("student_documents")
    .insert({
      student_id: studentId,
      application_id: applicationId,
      category: "acceptance_letters",
      custom_name: name,
      status: "verified",
      uploaded_by_role: "staff",
      uploaded_at: now,
      verified_by: user?.id ?? null,
      verified_at: now,
      cycle_id: cycleId,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    return { error: insertError?.message.includes("row-level security") ? "Only the processing team can file documents for this student." : (insertError?.message ?? "The document wasn't saved.") };
  }

  const path = documentFilePath(studentId, row.id as string, sanitizeFilename(file.name), crypto.randomUUID().slice(0, 8));
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (uploadError) {
    await supabase.from("student_documents").delete().eq("id", row.id);
    return { error: uploadError.message };
  }
  // Its file, approved as it is filed (0328); taken back out with the row if it cannot be attached.
  const { error: pathError } = await supabase.rpc("add_student_document_file", {
    p_document_id: row.id,
    p_path: path,
    p_name: file.name,
    p_sources: parseSourceNames(formData.get("file_sources")),
    p_role: "staff",
    p_status: "verified",
  });
  if (pathError) {
    await supabase.storage.from("documents").remove([path]);
    await supabase.from("student_documents").delete().eq("id", row.id);
    return { error: pathError.message === "not authorized" ? "Only the processing team can file documents for this student." : pathError.message };
  }

  await syncStudentStages(studentId);
  revalidatePath(revalidateTo);
  revalidatePath(`/students/${studentId}/documents`);
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function addDocumentRequirement(
  studentId: string,
  applicationId: string | null,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const denied = await requirePermission("documents.manage_requirements", MANAGE_DENIED);
  if (denied) return { error: denied.error };

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
