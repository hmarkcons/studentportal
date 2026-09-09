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

  // Deliberately seeds nothing.
  //
  // This used to copy the destination's whole document checklist onto every
  // new application, on top of the student-level copy ensureStudentDocumentRequirements
  // already maintains. The same passport and the same transcript were asked
  // for again per university, each row labelled with that university's name,
  // so a student with three applications showed the same document four times
  // over — once properly and three times as university-suffixed noise, in the
  // application checklist and again in the Documents tab.
  //
  // A document is a property of the student, not of the application. The
  // application checklist now carries only what someone deliberately adds to
  // it: a genuine extra that one university asks for, via addDocumentRequirement.
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
// actually pursuing a visa for. Country trackers key their visa fields off it
// (UK's CAS, the US I-20), and it is what the "Finalized for visa" badge
// reports.
export async function finalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();

  // Single security-definer RPC — clearing every application's flag and
  // setting the target one commit or fail together (see migration 0091),
  // rather than as two separate writes that could leave every application
  // unfinalized if the second one failed.
  //
  // It also enforces "only one finalized at a time" (0116) and surfaces that
  // as the error message below, so the rule can't be sidestepped by calling
  // the RPC directly.
  const { error } = await supabase.rpc("finalize_application", { p_application_id: applicationId, p_student_id: studentId });
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function unfinalizeApplication(applicationId: string, studentId: string, revalidateTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("applications").update({ is_finalized: false }).eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
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

// The course, requirements and portal links live on the program, and the
// contact address on the university — i.e. in the catalogue, not on this
// application. Editing them here is deliberate (a broken link is noticed while
// working a case, not while browsing Setup) but it is a catalogue edit, and the
// form says so, because the correction lands for every student on that program.
export async function updateApplicationLinks(
  applicationId: string,
  studentId: string,
  programId: string | null,
  universityId: string | null,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const clean = (key: string) => String(formData.get(key) ?? "").trim() || null;
  const page_link = clean("page_link");
  const requirements_link = clean("requirements_link");
  const application_portal_link = clean("application_portal_link");
  const contact_email = clean("contact_email");

  // Typing "university.edu/course" and getting a link that resolves against our
  // own domain is worse than no link at all, so require a real scheme.
  for (const [label, value] of [
    ["Course page", page_link],
    ["Requirements", requirements_link],
    ["Application portal", application_portal_link],
  ] as const) {
    if (value && !/^https?:\/\//i.test(value)) return { error: `${label} link must start with http:// or https://` };
  }
  if (contact_email && !contact_email.includes("@")) return { error: "University email doesn't look like an email address." };

  // .select() on each update so a row blocked by RLS comes back as zero rows
  // rather than as a silent success — otherwise a role without catalogue write
  // access is told "Saved." and the old link is still there on reload.
  if (programId) {
    const { data, error } = await supabase
      .from("programs")
      .update({ page_link, requirements_link, application_portal_link })
      .eq("id", programId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "You don't have permission to edit this program's links." };
  }

  if (universityId) {
    const { data, error } = await supabase
      .from("universities")
      .update({ contact_email })
      .eq("id", universityId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "You don't have permission to edit this university's contact email." };
  }

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
  const { error } = await supabase.from("application_tasks").update({ status: done ? "done" : "pending" }).eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
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
  const { error } = await supabase.from("application_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath(revalidateTo);
  return { success: true };
}
