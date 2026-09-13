"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { isScholarshipStatus, scholarshipIdentityError, SCHOLARSHIP_STATUSES } from "@/lib/scholarships";

// Everything here needs scholarships.manage, which now defaults to Super Admin
// and Processing — matching what the directory page has always claimed.
//
// Three of these had no check at all: creating a scholarship body (so any
// active staff member could add a row to the directory that only Super Admin
// could then remove), adding a scholarship to a student, and ticking
// pre-enrolment finalised. Editing and deleting were gated from the start,
// which is what made the gap easy to miss.
const DENIED = "Only Super Admin and the Processing team can manage scholarships.";

async function gate() {
  const denied = await requirePermission("scholarships.manage", DENIED);
  return denied ? denied.error : null;
}

function readBodyFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    region: String(formData.get("region") ?? "").trim() || null,
    academic_year: String(formData.get("academic_year") ?? "").trim(),
    covers: String(formData.get("covers") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    stipend_amount: String(formData.get("stipend_amount") ?? "").trim() || null,
    source_url: String(formData.get("source_url") ?? "").trim() || null,
    apply_url: String(formData.get("apply_url") ?? "").trim() || null,
    application_deadline: String(formData.get("application_deadline") ?? "").trim() || null,
    isee_threshold: String(formData.get("isee_threshold") ?? "").trim() || null,
    ispe_threshold: String(formData.get("ispe_threshold") ?? "").trim() || null,
    benefits: String(formData.get("benefits") ?? "").trim() || null,
    call_pdf_url: String(formData.get("call_pdf_url") ?? "").trim() || null,
    call_notes: String(formData.get("call_notes") ?? "").trim() || null,
  };
}

/**
 * The guide, which arrives as one JSON field.
 *
 * Client-supplied, so it is rebuilt here rather than trusted: only a title and
 * a body survive, both trimmed and capped, and anything that is not an object
 * with both is dropped. A malformed value returns an error instead of writing
 * something the table's own CHECK would reject with a constraint name.
 */
function readGuideSections(formData: FormData): { sections: { title: string; body: string }[] } | { error: string } {
  const raw = formData.get("guide_sections");
  if (raw == null || String(raw).trim() === "") return { sections: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { error: "The guide did not submit cleanly — reload the page and try again." };
  }
  if (!Array.isArray(parsed)) return { error: "The guide did not submit cleanly — reload the page and try again." };
  if (parsed.length > 40) return { error: "That is more than 40 sections — split the guide or shorten it." };

  const sections: { title: string; body: string }[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const title = String((item as { title?: unknown }).title ?? "").trim().slice(0, 120);
    const body = String((item as { body?: unknown }).body ?? "").trim().slice(0, 8000);
    if (!title || !body) continue;
    sections.push({ title, body });
  }
  return { sections };
}

/** 'published' or 'awaiting', and a date that only means anything for the latter. */
function readCallStatus(formData: FormData) {
  const status = String(formData.get("call_status") ?? "published");
  if (!["published", "awaiting"].includes(status)) {
    return { error: "Choose whether this year's call is published or not out yet." };
  }
  const expected = String(formData.get("call_expected_on") ?? "").trim() || null;
  return {
    // A date on a published call is left over from when it was awaited, and
    // would read as a second deadline.
    call_status: status,
    call_expected_on: status === "awaiting" ? expected : null,
  };
}

/** The countries this body serves, as ticked on the form. */
function readDestinationIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("destination_ids").map(String).filter(Boolean))];
}

/**
 * Replaces a body's countries with exactly the ones given.
 *
 * Deleting what is no longer ticked and inserting what is new, rather than
 * clearing and re-inserting: the rows carry a created_at, and a country that
 * stayed ticked did not just get added.
 */
async function setBodyDestinations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bodyId: string,
  destinationIds: string[]
) {
  const { data: existing } = await supabase
    .from("scholarship_body_destinations")
    .select("destination_id")
    .eq("scholarship_body_id", bodyId);

  const before = new Set((existing ?? []).map((r) => r.destination_id as string));
  const after = new Set(destinationIds);

  const removed = [...before].filter((id) => !after.has(id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("scholarship_body_destinations")
      .delete()
      .eq("scholarship_body_id", bodyId)
      .in("destination_id", removed);
    if (error) return error.message;
  }

  const added = [...after].filter((id) => !before.has(id));
  if (added.length > 0) {
    const { error } = await supabase
      .from("scholarship_body_destinations")
      .insert(added.map((destination_id) => ({ scholarship_body_id: bodyId, destination_id })));
    if (error) return error.message;
  }

  return null;
}

export async function createScholarshipBody(_prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readBodyFields(formData);
  if (!fields.name || !fields.academic_year) return { error: "Name and academic year are required." };

  // A body nobody can find is a body nobody can award. The directory is read
  // by country everywhere it is used, so one is the minimum.
  const destinationIds = readDestinationIds(formData);
  if (destinationIds.length === 0) return { error: "Choose at least one country this scholarship body serves." };

  const guide = readGuideSections(formData);
  if ("error" in guide) return { error: guide.error };
  const call = readCallStatus(formData);
  if ("error" in call) return { error: call.error };

  const { data: created, error: insertError } = await supabase
    .from("scholarship_bodies")
    .insert({ ...fields, ...call, guide_sections: guide.sections, guide_updated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };

  const linkError = await setBodyDestinations(supabase, created.id, destinationIds);
  if (linkError) {
    // Without its countries the row is invisible in the directory, so it is
    // not left behind half-made for somebody to find later.
    await supabase.from("scholarship_bodies").delete().eq("id", created.id);
    return { error: linkError };
  }

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

export async function updateScholarshipBody(bodyId: string, _prevState: unknown, formData: FormData) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readBodyFields(formData);
  if (!fields.name || !fields.academic_year) return { error: "Name and academic year are required." };

  const destinationIds = readDestinationIds(formData);
  if (destinationIds.length === 0) return { error: "Choose at least one country this scholarship body serves." };

  const guide = readGuideSections(formData);
  if ("error" in guide) return { error: guide.error };
  const call = readCallStatus(formData);
  if ("error" in call) return { error: call.error };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: updateError } = await supabase
    .from("scholarship_bodies")
    .update({
      ...fields,
      ...call,
      guide_sections: guide.sections,
      // Stamped on every save: this is what says a guide has been looked at
      // for the current year, which is the whole point of tracking staleness.
      guide_updated_at: new Date().toISOString(),
      guide_updated_by: user?.id ?? null,
    })
    .eq("id", bodyId);
  if (updateError) return { error: updateError.message };

  const linkError = await setBodyDestinations(supabase, bodyId, destinationIds);
  if (linkError) return { error: linkError };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

export async function deleteScholarshipBody(bodyId: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  // A body a student is already recorded against cannot just vanish: the
  // student_scholarships row would keep an id pointing at nothing and the
  // record would lose the only thing naming it.
  const { count } = await supabase
    .from("student_scholarships")
    .select("id", { count: "exact", head: true })
    .eq("scholarship_body_id", bodyId);
  if ((count ?? 0) > 0) {
    return {
      error: `${count} student scholarship record(s) name this body. Remove or repoint those first.`,
    };
  }

  const { error: deleteError } = await supabase.from("scholarship_bodies").delete().eq("id", bodyId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/setup/scholarship-bodies");
  return { success: true };
}

function readScholarshipFields(formData: FormData) {
  const status = String(formData.get("status") ?? "submitted");
  return {
    scholarship_body_id: String(formData.get("scholarship_body_id") ?? "") || null,
    name: String(formData.get("name") ?? "").trim() || null,
    award_amount: formData.get("award_amount") ? Number(formData.get("award_amount")) : null,
    application_deadline: String(formData.get("application_deadline") ?? "").trim() || null,
    status,
  };
}

function validateScholarship(fields: ReturnType<typeof readScholarshipFields>) {
  // Checked here rather than left to the CHECK constraint, which surfaces as a
  // database error nobody can act on.
  if (!isScholarshipStatus(fields.status)) {
    return `Choose one of: ${SCHOLARSHIP_STATUSES.join(", ")}.`;
  }
  const identity = scholarshipIdentityError(fields.name, fields.scholarship_body_id);
  if (identity) return identity;
  if (fields.award_amount !== null && (!Number.isFinite(fields.award_amount) || fields.award_amount < 0)) {
    return "The award amount cannot be negative.";
  }
  return null;
}

export async function addStudentScholarship(
  studentId: string,
  applicationId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readScholarshipFields(formData);
  const invalid = validateScholarship(fields);
  if (invalid) return { error: invalid };

  const { error: insertError } = await supabase
    .from("student_scholarships")
    .insert({ student_id: studentId, application_id: applicationId, ...fields });
  if (insertError) return { error: insertError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateStudentScholarship(
  scholarshipId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const fields = readScholarshipFields(formData);
  const invalid = validateScholarship(fields);
  if (invalid) return { error: invalid };

  // The body and the deadline are written too. This used to update only the
  // name, amount and status, so a scholarship recorded against the wrong
  // regional body could never be corrected — the dropdown was offered when
  // adding and then had no effect for the rest of the record's life.
  const { error: updateError } = await supabase.from("student_scholarships").update(fields).eq("id", scholarshipId);
  if (updateError) return { error: updateError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteStudentScholarship(scholarshipId: string, revalidateTo: string) {
  const error = await gate();
  if (error) return { error };
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("student_scholarships").delete().eq("id", scholarshipId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// markPreenrollmentFinalized lived here. Finalising the university in
// Applications is what opens a student's scholarship now, and 0173 keeps
// applications.preenrollment_finalized equal to is_finalized — so a second
// writer could only ever put the two out of step.
