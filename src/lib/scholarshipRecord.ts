import type { SupabaseClient } from "@supabase/supabase-js";

// Not a server action module: resolveScholarship takes a client, and every
// export of a "use server" file is an endpoint anyone can call.

/**
 * Which scholarship a change is for: one on record, or the one a finalised
 * university's body stands for, which is recorded by the first change.
 *
 * The Scholarship tab offers its dropdowns and its upload the moment a
 * university is finalised, before anyone has recorded anything — a panel that
 * appeared only after an "Add" step nobody knew to take was the tab looking
 * broken. Nothing is written until somebody actually sets a status or
 * attaches a file, so the student sees nothing until then either.
 */
export type ScholarshipRef = { id: string } | { applicationId: string; bodyId: string };

/**
 * The scholarship's id, recording it first if it is not on file yet.
 *
 * Found by application and body before inserting, so two tabs — or two quick
 * changes — cannot record the same scholarship twice. The application has to
 * be this student's and finalised: that is what opens the tab, and what lets
 * the student read the record (0149).
 */
export async function resolveScholarship(
  supabase: SupabaseClient,
  ref: ScholarshipRef,
  studentId: string
): Promise<{ id: string; created: boolean } | { error: string }> {
  if ("id" in ref) return { id: ref.id, created: false };

  const { data: app } = await supabase
    .from("applications")
    .select("id, student_id, is_finalized")
    .eq("id", ref.applicationId)
    .maybeSingle();
  if (!app || app.student_id !== studentId) return { error: "That application isn't this student's." };
  if (!app.is_finalized) return { error: "Finalise the university on the Applications tab first — the scholarship follows it." };

  const { data: body } = await supabase.from("scholarship_bodies").select("id, name").eq("id", ref.bodyId).maybeSingle();
  if (!body) return { error: "Choose which scholarship body this is with." };

  const { data: existing } = await supabase
    .from("student_scholarships")
    .select("id")
    .eq("application_id", ref.applicationId)
    .eq("scholarship_body_id", ref.bodyId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing?.[0]) return { id: existing[0].id as string, created: false };

  const { data: made, error } = await supabase
    .from("student_scholarships")
    .insert({
      student_id: studentId,
      application_id: ref.applicationId,
      scholarship_body_id: ref.bodyId,
      // Named after the body so the record reads as something on its own in
      // the student's portal.
      name: body.name,
      // Not submitted yet: recording it is the office taking it on.
      status: "pending",
    })
    .select("id")
    .single();
  // Recorded a moment ago by another tab: 0299 refuses the second, so use the first.
  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("student_scholarships")
      .select("id")
      .eq("application_id", ref.applicationId)
      .eq("scholarship_body_id", ref.bodyId)
      .limit(1);
    if (raced?.[0]) return { id: raced[0].id as string, created: false };
  }
  if (error || !made) {
    return {
      error: error?.message.includes("row-level security")
        ? "Only Processing and Super Admin can record a student's scholarship."
        : (error?.message ?? "The scholarship wasn't recorded."),
    };
  }
  return { id: made.id as string, created: true };
}
