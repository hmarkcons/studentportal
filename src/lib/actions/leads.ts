"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/constants";

export async function createLead(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const platform_source = String(formData.get("platform_source") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);
  const country_of_interest = destination_names.join(", ") || null;
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;

  if (!full_name) {
    return { error: "Name is required." };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      full_name,
      contact_number,
      email,
      platform_source,
      current_qualification,
      level_applying_for,
      course_of_interest,
      country_of_interest,
      assigned_counselor_id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (destination_ids.length > 0) {
    await supabase.from("lead_destinations").insert(destination_ids.map((destination_id) => ({ lead_id: data.id, destination_id })));
  }

  redirect(`/leads/${data.id}`);
}

export async function updateLeadDestinations(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);

  await supabase.from("lead_destinations").delete().eq("lead_id", leadId);
  if (destination_ids.length > 0) {
    const { error } = await supabase
      .from("lead_destinations")
      .insert(destination_ids.map((destination_id) => ({ lead_id: leadId, destination_id })));
    if (error) return { error: error.message };
  }

  const { error } = await supabase
    .from("leads")
    .update({ country_of_interest: destination_names.join(", ") || null })
    .eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/students/${leadId}`);
  return { success: true };
}

// Bulk import — CSV columns (header row required): full_name (required),
// contact_number, email, platform_source, current_qualification,
// level_applying_for (bachelors/masters/phd), course_of_interest,
// country_of_interest.
export async function importLeads(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const { parseCsvWithHeader } = await import("@/lib/csv");
  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.full_name)
    .map((r) => ({
      full_name: r.full_name,
      contact_number: r.contact_number || null,
      email: r.email || null,
      platform_source: r.platform_source || null,
      current_qualification: r.current_qualification || null,
      level_applying_for: ["bachelors", "masters", "phd"].includes(r.level_applying_for) ? r.level_applying_for : null,
      course_of_interest: r.course_of_interest || null,
      country_of_interest: r.country_of_interest || null,
    }));

  if (records.length === 0) {
    return { error: "No valid rows found — the full_name column is required." };
  }

  const { error } = await supabase.from("leads").insert(records);
  if (error) return { error: error.message };

  revalidatePath("/leads");
  return { success: true, count: records.length };
}

// Bulk import for already-registered students — same columns as leads, plus
// date_of_birth, address, home_phone. Inserted with status='registered' so
// the DB trigger stamps registered_at immediately.
export async function importRegisteredStudents(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };

  const { parseCsvWithHeader } = await import("@/lib/csv");
  const text = await file.text();
  const rows = parseCsvWithHeader(text);
  if (rows.length === 0) return { error: "The file has no data rows." };

  const records = rows
    .filter((r) => r.full_name)
    .map((r) => ({
      full_name: r.full_name,
      contact_number: r.contact_number || null,
      email: r.email || null,
      current_qualification: r.current_qualification || null,
      level_applying_for: ["bachelors", "masters", "phd"].includes(r.level_applying_for) ? r.level_applying_for : null,
      course_of_interest: r.course_of_interest || null,
      country_of_interest: r.country_of_interest || null,
      date_of_birth: r.date_of_birth || null,
      address: r.address || null,
      home_phone: r.home_phone || null,
      status: "registered" as const,
    }));

  if (records.length === 0) {
    return { error: "No valid rows found — the full_name column is required." };
  }

  const { error } = await supabase.from("leads").insert(records);
  if (error) return { error: error.message };

  revalidatePath("/students");
  return { success: true, count: records.length };
}

export async function registerStudentManually(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const discount_amount = formData.get("discount_amount") ? Number(formData.get("discount_amount")) : null;
  const discount_reason = String(formData.get("discount_reason") ?? "").trim() || null;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      full_name,
      contact_number,
      email,
      current_qualification,
      level_applying_for,
      course_of_interest,
      country_of_interest: destination_names.join(", ") || null,
      assigned_counselor_id,
      discount_amount,
      discount_reason,
      status: "registered",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (destination_ids.length > 0) {
    await supabase.from("lead_destinations").insert(destination_ids.map((destination_id) => ({ lead_id: data.id, destination_id })));
  }

  revalidatePath("/students");
  redirect(`/students/${data.id}`);
}

export async function updateRegistrationStatus(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const registration_status = String(formData.get("registration_status") ?? "");
  if (!["registered", "withdrawn", "ghost"].includes(registration_status)) {
    return { error: "Choose a valid registration status." };
  }

  const { error } = await supabase.from("leads").update({ registration_status }).eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  return { success: true };
}

export async function updateLeadStatus(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const status = String(formData.get("status") ?? "");
  const remark = String(formData.get("remark") ?? "").trim();

  if (!LEAD_STATUSES.includes(status as never)) {
    return { error: "Choose a valid status." };
  }
  if (!remark) {
    return { error: "A remark is required for every status update (call log)." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: logError } = await supabase.from("lead_call_logs").insert({
    lead_id: leadId,
    counselor_id: user?.id,
    status_at_time: status,
    remark,
  });
  if (logError) return { error: logError.message };

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function reassignLead(leadId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;

  const { error } = await supabase.from("leads").update({ assigned_counselor_id }).eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { success: true };
}

export async function registerLead(leadId: string, formData: FormData) {
  const supabase = await createClient();
  const discount_amount = formData.get("discount_amount") ? Number(formData.get("discount_amount")) : null;
  const discount_reason = String(formData.get("discount_reason") ?? "").trim() || null;

  const { error } = await supabase
    .from("leads")
    .update({ status: "registered", discount_amount, discount_reason })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/students");
  redirect(`/students/${leadId}`);
}
