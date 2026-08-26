"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsvWithHeader } from "@/lib/csv";

export async function createUniversity(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const destination_id = String(formData.get("destination_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");

  if (!destination_id || !name || !city || !["public", "private"].includes(type)) {
    return { error: "Fill in all required fields — city is mandatory." };
  }

  const { data, error } = await supabase.from("universities").insert({ destination_id, name, city, region, type }).select("id").single();
  if (error) return { error: error.message };

  redirect(`/setup/universities/${data.id}`);
}

export async function updateUniversity(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "active");

  if (!name || !["public", "private"].includes(type)) {
    return { error: "Name and type are required." };
  }

  const { error } = await supabase.from("universities").update({ name, city, region, type, status }).eq("id", universityId);
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  revalidatePath("/setup/universities");
  return { success: true };
}

export async function deleteUniversity(universityId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("universities").delete().eq("id", universityId);
  if (error) return { error: error.message };
  redirect("/setup/universities");
}

export async function updateProgram(programId: string, universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;
  const duration = String(formData.get("duration") ?? "").trim() || null;
  const language_requirement = String(formData.get("language_requirement") ?? "").trim() || null;
  const application_deadline = String(formData.get("application_deadline") ?? "").trim() || null;

  if (!level || !name) return { error: "Level and name are required." };

  const { error } = await supabase
    .from("programs")
    .update({ level, name, core_field, sub_field, tuition_fee, duration, language_requirement, application_deadline })
    .eq("id", programId);
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

export async function deleteProgram(programId: string, universityId: string) {
  const supabase = await createClient();
  await supabase.from("programs").delete().eq("id", programId);
  revalidatePath(`/setup/universities/${universityId}`);
}

export async function addProgram(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const level = String(formData.get("level") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const core_field = String(formData.get("core_field") ?? "").trim() || null;
  const sub_field = String(formData.get("sub_field") ?? "").trim() || null;
  const tuition_fee = formData.get("tuition_fee") ? Number(formData.get("tuition_fee")) : null;

  if (!level || !name) return { error: "Level and name are required." };

  const { error } = await supabase.from("programs").insert({ university_id: universityId, level, name, core_field, sub_field, tuition_fee });
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true };
}

function splitList(v: string | undefined): string[] {
  return (v ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(v: string | undefined): boolean {
  return ["yes", "true", "1", "y"].includes((v ?? "").trim().toLowerCase());
}

// University bulk import — one destination per file. Expected CSV columns
// (header row required): name, city, region, type, levels_offered,
// fields_offered — the last two are semicolon-separated within the cell
// (e.g. "bachelors;masters"), since commas are the CSV delimiter. Only
// `name` is required; anything else left blank keeps the column's DB
// default. `type` defaults to "public" when blank.
export async function importUniversities(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const destinationId = String(formData.get("destination_id") ?? "");
  if (!destinationId) return { error: "Choose a destination first." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.name && r.city)
    .map((r) => ({
      destination_id: destinationId,
      name: r.name,
      city: r.city,
      region: r.region || null,
      type: r.type === "private" ? "private" : "public",
      levels_offered: splitList(r.levels_offered),
      fields_offered: splitList(r.fields_offered),
    }));

  if (records.length === 0) return { error: "No valid rows — 'name' and 'city' columns are both required." };

  const { error } = await supabase.from("universities").insert(records);
  if (error) return { error: error.message };

  revalidatePath("/setup/universities");
  return { success: true, count: records.length };
}

// Program bulk import — one university per file. Expected CSV columns
// (header row required): level, name, core_field, sub_field, page_link,
// interview_required, interview_details, admission_test_required,
// admission_test_type, application_portal_name, application_portal_link,
// intake_dates (semicolon-separated), application_deadline (YYYY-MM-DD),
// tuition_fee, duration, language_requirement. Only `level` and `name` are
// required; `level` must be bachelors/masters/phd.
export async function importPrograms(universityId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.name && ["bachelors", "masters", "phd"].includes(r.level))
    .map((r) => ({
      university_id: universityId,
      level: r.level,
      name: r.name,
      core_field: r.core_field || null,
      sub_field: r.sub_field || null,
      page_link: r.page_link || null,
      interview_required: parseBool(r.interview_required),
      interview_details: r.interview_details || null,
      admission_test_required: parseBool(r.admission_test_required),
      admission_test_type: r.admission_test_type || null,
      application_portal_name: r.application_portal_name || null,
      application_portal_link: r.application_portal_link || null,
      intake_dates: splitList(r.intake_dates),
      application_deadline: r.application_deadline || null,
      tuition_fee: r.tuition_fee ? Number(r.tuition_fee) : null,
      duration: r.duration || null,
      language_requirement: r.language_requirement || null,
    }));

  if (records.length === 0) return { error: "No rows had valid 'name' and 'level' (bachelors/masters/phd) columns." };

  const { error } = await supabase.from("programs").insert(records);
  if (error) return { error: error.message };

  revalidatePath(`/setup/universities/${universityId}`);
  return { success: true, count: records.length };
}
