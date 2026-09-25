"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { ensureCurrentCycleId } from "@/lib/ensureCycle";
import { uploadedFile } from "@/lib/stagedUpload";
import { validateDocumentFile, sanitizeFilename } from "@/lib/documentUpload";
import { karachiToday } from "@/lib/calendarDates";
import type { DashboardStageDef, DashboardStageValues } from "@/lib/dashboardPipeline";
import { admittedStage, canSetService, serviceOf, withAdmissionStagesDone } from "@/lib/serviceType";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * A visa-only student's admission stages, recorded as done in every country
 * they are going to (withAdmissionStagesDone). Anything already recorded is
 * left as it was. Run when a student is made visa-only, and again when their
 * admission is recorded, in case a country was added in between.
 */
export async function applyVisaOnlyStages(studentId: string): Promise<{ error?: string }> {
  const { supabase, staff } = await getStaffSession();
  if (!canSetService(staff)) return { error: "Only a Super Admin or the processing team can do this." };

  const { data: rows, error } = await supabase
    .from("lead_destinations")
    .select("destination_id, dashboard_stage_values, destination:destinations(dashboard_pipeline_stages)")
    .eq("lead_id", studentId);
  if (error) return { error: error.message };

  const today = karachiToday();
  for (const row of rows ?? []) {
    const stages = (one(row.destination as never) as { dashboard_pipeline_stages?: DashboardStageDef[] } | null)?.dashboard_pipeline_stages ?? [];
    const { values, changed } = withAdmissionStagesDone(stages, (row.dashboard_stage_values as DashboardStageValues | null) ?? {}, today);
    if (!changed) continue;
    const { error: updateError } = await supabase
      .from("lead_destinations")
      .update({ dashboard_stage_values: values })
      .eq("lead_id", studentId)
      .eq("destination_id", row.destination_id);
    if (updateError) return { error: updateError.message };
  }
  return {};
}

/**
 * Records the admission a visa-only client already holds, so the visa work
 * can start: an application to their university, placed at the stage that
 * counts as admitted (admittedStage) and finalized for the visa — which is
 * what the country's visa tracker keys off — with the admission letter filed
 * against it as approved, and the admission stages marked done.
 */
export async function recordExistingAdmission(studentId: string, _prev: unknown, formData: FormData) {
  const { supabase, staff } = await getStaffSession();
  if (!staff || !canSetService(staff)) return { error: "Only a Super Admin or the processing team can record an admission." };

  const { data: lead } = await supabase.from("leads").select("service_type").eq("id", studentId).maybeSingle();
  if (!lead) return { error: "That student no longer exists." };
  if (serviceOf(lead.service_type) !== "visa_only") {
    return { error: "This student is registered for the full service. Set them to the visa service only on their Registration card first." };
  }

  const university_id = String(formData.get("university_id") ?? "");
  const program_id = String(formData.get("program_id") ?? "") || null;
  const intake = String(formData.get("intake") ?? "").trim() || null;
  if (!university_id) return { error: "Choose the university they have been admitted to." };

  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Attach the admission letter." };
  const fileIssue = validateDocumentFile(file, "admission letter");
  if (fileIssue) return { error: fileIssue };

  // The university has to be in one of the countries they registered for —
  // the visa tracker is that country's, and a letter from anywhere else would
  // start visa work for a country nobody agreed to.
  const [{ data: university }, { data: destinations }] = await Promise.all([
    supabase
      .from("universities")
      .select("id, name, status, destination_id, destination:destinations(pipeline_stages)")
      .eq("id", university_id)
      .maybeSingle(),
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId),
  ]);
  if (!university) return { error: "That university no longer exists — reload the page." };
  if (!(destinations ?? []).some((d) => d.destination_id === university.destination_id)) {
    return { error: "That university is in a country this student is not registered for. Add the country on their Registration card first." };
  }
  if (program_id) {
    const { data: program } = await supabase.from("programs").select("university_id").eq("id", program_id).maybeSingle();
    if (program?.university_id !== university_id) return { error: "That programme isn't at the university chosen — reload the page and pick again." };
  }

  const pipeline = (one(university.destination as never) as { pipeline_stages?: string[] | null } | null)?.pipeline_stages ?? [];
  const current_stage = admittedStage(pipeline);
  const cycle_id = await ensureCurrentCycleId(studentId);

  const { data: app, error: appError } = await supabase
    .from("applications")
    .insert({ student_id: studentId, university_id, program_id, intake, cycle_id, ...(current_stage ? { current_stage } : {}) })
    .select("id")
    .single();
  if (appError || !app) {
    return {
      error:
        appError?.code === "23505"
          ? "This student already has an application for that programme in that intake. Open it from the Applications tab instead."
          : (appError?.message ?? "The admission couldn't be recorded."),
    };
  }

  // The letter, filed against the application and approved: the person
  // recording it is the one who checked it.
  const now = new Date().toISOString();
  const { data: doc, error: docError } = await supabase
    .from("student_documents")
    .insert({
      student_id: studentId,
      application_id: app.id,
      category: "admission",
      custom_name: "Admission letter",
      status: "verified",
      uploaded_by_role: "staff",
      uploaded_at: now,
      verified_by: staff.id,
      verified_at: now,
      cycle_id,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await supabase.from("applications").delete().eq("id", app.id);
    return { error: docError?.message ?? "The admission letter couldn't be filed." };
  }
  const path = `${studentId}/${doc.id}-${sanitizeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) {
    await supabase.from("student_documents").delete().eq("id", doc.id);
    await supabase.from("applications").delete().eq("id", app.id);
    return { error: uploadError.message };
  }
  await supabase.from("student_documents").update({ file_path: path }).eq("id", doc.id);

  // Finalized for the visa, unless another application already is — only one
  // may be, and moving that is a decision for the person, not for this form.
  await supabase.rpc("finalize_application", { p_application_id: app.id, p_student_id: studentId });

  await applyVisaOnlyStages(studentId);

  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/applications`);
  revalidatePath(`/students/${studentId}/documents`);
  redirect(`/students/${studentId}/applications/${app.id}`);
}
