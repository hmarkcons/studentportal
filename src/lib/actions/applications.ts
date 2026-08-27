"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createApplication(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const university_id = String(formData.get("university_id") ?? "");
  const program_ids = formData.getAll("program_ids").map(String).filter(Boolean);
  const intake = String(formData.get("intake") ?? "").trim() || null;
  const deadline = String(formData.get("deadline") ?? "") || null;

  if (!university_id) return { error: "Choose a university." };

  const { data: university } = await supabase.from("universities").select("status, destination_id").eq("id", university_id).maybeSingle();
  if (!university || university.status !== "active") {
    return { error: "This university is inactive — applications can't be added for it." };
  }

  const rows = (program_ids.length > 0 ? program_ids : [null]).map((program_id) => ({
    student_id: studentId,
    university_id,
    program_id,
    intake,
    deadline,
  }));

  const { data, error } = await supabase.from("applications").insert(rows).select("id");
  if (error) return { error: error.message };

  // Auto-provision the standard document checklist so staff see "missing"
  // rows immediately instead of an empty Documents section.
  const { data: templates } = await supabase
    .from("document_templates")
    .select("id, category")
    .or(`destination_id.is.null,destination_id.eq.${university.destination_id}`);

  if (templates && templates.length > 0) {
    const docRows = data.flatMap((app) =>
      templates.map((t) => ({
        student_id: studentId,
        application_id: app.id,
        template_id: t.id,
        category: t.category,
        status: "missing" as const,
      }))
    );
    const { error: seedError } = await supabase.from("student_documents").insert(docRows);
    if (seedError) console.error("Failed to seed document checklist for new application:", seedError.message);
  }

  redirect(`/students/${studentId}/applications/${data[0].id}`);
}

export async function deleteApplication(applicationId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").delete().eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// Finalizing an application marks it as the one university the student is
// actually pursuing a visa for — the Visa tab only shows the finalized
// application (or a prompt to finalize one), not every university applied to.
export async function finalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();

  const { error: clearError } = await supabase.from("applications").update({ is_finalized: false }).eq("student_id", studentId);
  if (clearError) return { error: clearError.message };

  const { error } = await supabase.from("applications").update({ is_finalized: true }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  revalidatePath(`/students/${studentId}/visa`);
  return { success: true };
}

export async function unfinalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ is_finalized: false }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  revalidatePath(`/students/${studentId}/visa`);
  return { success: true };
}

export async function updateApplicationDetails(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const deadline = String(formData.get("deadline") ?? "") || null;
  const application_fee = formData.get("application_fee") ? Number(formData.get("application_fee")) : null;
  const special_requirements = String(formData.get("special_requirements") ?? "").trim() || null;

  const { error } = await supabase
    .from("applications")
    .update({ deadline, application_fee, special_requirements })
    .eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function updateApplicationStage(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const current_stage = String(formData.get("current_stage") ?? "");
  if (!current_stage) return { error: "Choose a stage." };

  const { error } = await supabase.from("applications").update({ current_stage }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}

export async function addApplicationTask(applicationId: string, studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get("description") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "") || null;
  const owner_id = String(formData.get("owner_id") ?? "") || null;
  const priority = String(formData.get("priority") ?? "medium");

  if (!description) return { error: "Description is required." };

  const { error } = await supabase
    .from("application_tasks")
    .insert({ application_id: applicationId, description, due_date, owner_id, priority });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function toggleApplicationTask(taskId: string, revalidateTo: string, done: boolean) {
  const supabase = await createClient();
  await supabase.from("application_tasks").update({ status: done ? "done" : "pending" }).eq("id", taskId);
  revalidatePath(revalidateTo);
}

export async function updateApplicationTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get("description") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "") || null;
  const priority = String(formData.get("priority") ?? "medium");

  if (!description) return { error: "Description is required." };

  const { error } = await supabase.from("application_tasks").update({ description, due_date, priority }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deleteApplicationTask(taskId: string, revalidateTo: string) {
  const supabase = await createClient();
  await supabase.from("application_tasks").delete().eq("id", taskId);
  revalidatePath(revalidateTo);
}

export async function updateVisaRecord(applicationId: string, studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const outcome = String(formData.get("outcome") ?? "pending");
  const outcome_reason = String(formData.get("outcome_reason") ?? "").trim() || null;
  const biometric_appointment = String(formData.get("biometric_appointment") ?? "") || null;
  const interview_appointment = String(formData.get("interview_appointment") ?? "") || null;
  const medical_appointment = String(formData.get("medical_appointment") ?? "") || null;

  const { error } = await supabase.from("visa_records").upsert(
    { application_id: applicationId, outcome, outcome_reason, biometric_appointment, interview_appointment, medical_appointment },
    { onConflict: "application_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}/applications/${applicationId}`);
  return { success: true };
}
