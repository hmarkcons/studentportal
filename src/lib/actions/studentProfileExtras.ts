"use server";

// Profile data the scope doc calls out under "Student / Applicant Profile
// Management" (beyond what's gathered at registration) that had schema but
// no UI at all: a profile photo, test scores, travel history, and any prior
// visa refusal/deportation record. RLS already covers both staff and the
// student's own self-service access for every table/column touched here
// (student_profiles_write, student_test_scores_write — both
// staff-or-self, migration 0009), so — like qualifications.ts — these
// actions are shared as-is by both the staff-side and portal-side Profile
// pages; no route-specific permission check needed.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TEST_TYPES, needsCustomName } from "@/lib/testScores";

// Was a third hand-written copy of this list, and it lacked GMAT and CEnT-S —
// so the two types just added to the picker would have been rejected here as
// invalid. One source now.

// Whole-section save: the section is edited as a table and committed with one
// Save, so a correction to an existing score is an edit rather than
// delete-and-retype. Rows arrive as parallel arrays — one entry per rendered
// row, in DOM order — with an empty id meaning "new".
export async function saveTestScores(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const ids = formData.getAll("score_id").map(String);
  const types = formData.getAll("score_type").map(String);
  const values = formData.getAll("score_value").map((v) => String(v).trim());
  const dates = formData.getAll("score_date").map((v) => String(v) || null);
  const customNames = formData.getAll("score_custom_name").map((v) => String(v).trim());

  if (types.length !== ids.length || values.length !== ids.length || dates.length !== ids.length || customNames.length !== ids.length) {
    return { error: "That didn't submit cleanly — reload the page and try again." };
  }

  const rows = ids.map((id, i) => ({
    id: id || null,
    test_type: types[i],
    score: values[i],
    test_date: dates[i],
    // Only kept for the type that needs it, so switching a row away from
    // Other does not leave a stale name behind on the record.
    custom_test_name: needsCustomName(types[i]) ? customNames[i] || null : null,
  }));
  for (const r of rows) {
    if (!(TEST_TYPES as readonly string[]).includes(r.test_type)) return { error: "Choose a valid test type for every row." };
    if (!r.score) return { error: "Every row needs a score — remove the row if the result isn't known yet." };
    // Without this the document requirement it generates would read
    // "Other test — scorecard", which names nothing for staff to chase.
    if (needsCustomName(r.test_type) && !r.custom_test_name) {
      return { error: "Name the test for every row set to Other." };
    }
  }

  // Ids to delete are worked out against what's actually on file rather than
  // sent up from the browser, so a stale form can't be used to delete rows it
  // was never shown.
  const { data: existing, error: readError } = await supabase
    .from("student_test_scores")
    .select("id")
    .eq("student_id", studentId);
  if (readError) return { error: readError.message };

  const kept = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const removed = (existing ?? []).map((r) => r.id).filter((id) => !kept.has(id));
  if (removed.length > 0) {
    const { error } = await supabase.from("student_test_scores").delete().in("id", removed);
    if (error) return { error: error.message };
  }

  for (const r of rows) {
    if (!r.id) continue;
    const { error } = await supabase
      .from("student_test_scores")
      .update({ test_type: r.test_type, score: r.score, test_date: r.test_date, custom_test_name: r.custom_test_name })
      .eq("id", r.id)
      .eq("student_id", studentId);
    if (error) return { error: error.message };
  }

  const added = rows
    .filter((r) => !r.id)
    .map((r) => ({
      student_id: studentId,
      test_type: r.test_type,
      score: r.score,
      test_date: r.test_date,
      custom_test_name: r.custom_test_name,
    }));
  if (added.length > 0) {
    const { error } = await supabase.from("student_test_scores").insert(added);
    if (error) return { error: error.message };
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function uploadStudentPhoto(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a photo to upload." };
  if (!file.type.startsWith("image/")) return { error: "Choose an image file." };

  const path = `${studentId}/photo-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("student_profiles").upsert({ student_id: studentId, photo_path: path }, { onConflict: "student_id" });
  if (error) return { error: error.message };

  // "layout" so the header photo (shown on every tab under students/[id])
  // updates immediately no matter which tab triggered the upload.
  revalidatePath(revalidateTo, "layout");
  return { success: true };
}

// Travel and any prior refusal/deportation are one story a visa officer reads
// together, so they are one section with one Save. Both live as JSON arrays on
// the same student_profiles row, which means the two lists commit or fail as a
// single write rather than leaving half the history updated.
export async function saveTravelAndVisaHistory(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const travelIds = formData.getAll("travel_id").map(String);
  const travelCountries = formData.getAll("travel_country").map((v) => String(v).trim());
  const travelPurposes = formData.getAll("travel_purpose").map((v) => String(v).trim() || null);
  const travelFrom = formData.getAll("travel_from").map((v) => String(v) || null);
  const travelTo = formData.getAll("travel_to").map((v) => String(v) || null);

  const visaIds = formData.getAll("visa_id").map(String);
  const visaCountries = formData.getAll("visa_country").map((v) => String(v).trim());
  const visaTypes = formData.getAll("visa_type").map(String);
  const visaDates = formData.getAll("visa_date").map((v) => String(v) || null);
  const visaReasons = formData.getAll("visa_reason").map((v) => String(v).trim() || null);

  if (
    [travelCountries, travelPurposes, travelFrom, travelTo].some((a) => a.length !== travelIds.length) ||
    [visaCountries, visaTypes, visaDates, visaReasons].some((a) => a.length !== visaIds.length)
  ) {
    return { error: "That didn't submit cleanly — reload the page and try again." };
  }

  const travel_history = travelIds.map((id, i) => ({
    id: id || crypto.randomUUID(),
    country: travelCountries[i],
    purpose: travelPurposes[i],
    from_date: travelFrom[i],
    to_date: travelTo[i],
  }));
  const visa_refusal_history = visaIds.map((id, i) => ({
    id: id || crypto.randomUUID(),
    country: visaCountries[i],
    type: visaTypes[i],
    date: visaDates[i],
    reason: visaReasons[i],
  }));

  if (travel_history.some((r) => !r.country)) return { error: "Every trip needs a country — remove the row if it was added by mistake." };
  if (visa_refusal_history.some((r) => !r.country)) return { error: "Every refusal or deportation needs a country." };
  if (visa_refusal_history.some((r) => !["refusal", "deportation"].includes(r.type))) {
    return { error: "Choose refusal or deportation for every row." };
  }

  const { error } = await supabase
    .from("student_profiles")
    .upsert({ student_id: studentId, travel_history, visa_refusal_history }, { onConflict: "student_id" });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

