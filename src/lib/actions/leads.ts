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

  // Insert without .select() — chaining .select() makes PostgREST append a
  // RETURNING clause, and Postgres additionally requires the returned row to
  // satisfy the table's SELECT policy. leads_select falls back to
  // staff_can_view_student(), which does its own nested lookup against
  // `leads` — a lookup that can't yet see a row inserted earlier in the same
  // command, so it always evaluates false and the whole insert is rejected
  // for any role that isn't covered by a direct, tuple-local leads_select
  // clause (i.e. every role except the assigned counselor). Generating the
  // id ourselves sidesteps RETURNING entirely.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("leads").insert({
    id,
    full_name,
    contact_number,
    email,
    platform_source,
    current_qualification,
    level_applying_for,
    course_of_interest,
    country_of_interest,
    assigned_counselor_id,
  });

  if (error) return { error: error.message };

  if (destination_ids.length > 0) {
    await supabase.from("lead_destinations").insert(destination_ids.map((destination_id) => ({ lead_id: id, destination_id })));
  }

  redirect(`/leads/${id}`);
}

export async function updateLead(leadId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const contact_number = String(formData.get("contact_number") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const platform_source = String(formData.get("platform_source") ?? "").trim() || null;
  const current_qualification = String(formData.get("current_qualification") ?? "").trim() || null;
  const level_applying_for = String(formData.get("level_applying_for") ?? "") || null;
  const course_of_interest = String(formData.get("course_of_interest") ?? "").trim() || null;
  const date_of_birth = String(formData.get("date_of_birth") ?? "") || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const home_phone = String(formData.get("home_phone") ?? "").trim() || null;

  const { error } = await supabase
    .from("leads")
    .update({
      full_name,
      contact_number,
      email,
      platform_source,
      current_qualification,
      level_applying_for,
      course_of_interest,
      date_of_birth,
      address,
      home_phone,
    })
    .eq("id", leadId);

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
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
      // See registerStudentManually's comment — handle_lead_registration()
      // only stamps this on UPDATE, not INSERT, so it must be set explicitly
      // or these rows would never satisfy the students view's filter.
      registered_at: new Date().toISOString(),
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

  // See createLead's comment above — inserting without .select() avoids the
  // RETURNING+RLS interaction that otherwise rejects this insert for any
  // role not directly covered by leads_select's tuple-local clauses.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("leads").insert({
    id,
    full_name,
    contact_number,
    email,
    current_qualification,
    level_applying_for,
    course_of_interest,
    country_of_interest: destination_names.join(", ") || null,
    assigned_counselor_id,
    status: "registered",
    // handle_lead_registration() only stamps this on UPDATE (status
    // transitioning into 'registered'), not on INSERT — without it here,
    // this row would never satisfy the students view's `registered_at is
    // not null` filter and would silently never appear as a student.
    registered_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };

  if (destination_ids.length > 0) {
    await supabase.from("lead_destinations").insert(destination_ids.map((destination_id) => ({ lead_id: id, destination_id })));
  }

  revalidatePath("/students");
  redirect(`/students/${id}`);
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

export async function updateRegistrationDetails(studentId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const destination_ids = formData.getAll("destination_ids").map(String).filter(Boolean);
  const destination_names = formData.getAll("destination_names").map(String).filter(Boolean);
  const assigned_counselor_id = String(formData.get("assigned_counselor_id") ?? "") || null;
  const discount_amount = formData.get("discount_amount") ? Number(formData.get("discount_amount")) : null;
  const discount_reason = String(formData.get("discount_reason") ?? "").trim() || null;

  // Older records may predate lead_destinations and only carry the legacy
  // country_of_interest text — the checkbox list then starts with nothing
  // checked. Only touch destinations/country_of_interest when the form
  // actually has a destination selection, or this student already had real
  // lead_destinations rows (an explicit "uncheck everything" submit) — never
  // silently wipe the legacy text field just because the widget started empty.
  const { data: existingDestinations } = await supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentId);
  const hadExistingDestinations = (existingDestinations?.length ?? 0) > 0;

  if (destination_ids.length > 0 || hadExistingDestinations) {
    const { error: delErr } = await supabase.from("lead_destinations").delete().eq("lead_id", studentId);
    if (delErr) return { error: delErr.message };
    if (destination_ids.length > 0) {
      const { error: destErr } = await supabase
        .from("lead_destinations")
        .insert(destination_ids.map((destination_id) => ({ lead_id: studentId, destination_id })));
      if (destErr) return { error: destErr.message };
    }
  }

  const patch: Record<string, unknown> = { assigned_counselor_id, discount_amount, discount_reason };
  if (destination_ids.length > 0 || hadExistingDestinations) {
    patch.country_of_interest = destination_names.join(", ") || null;
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  revalidatePath("/students");
  return { success: true };
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (staffRow?.role !== "super_admin" && staffRow?.role !== "processing")
    return { error: "Only Super Admin or Processing can delete a lead/student record." };

  const { data: lead } = await supabase.from("leads").select("auth_user_id").eq("id", studentId).maybeSingle();
  const { data: apps } = await supabase.from("applications").select("id").eq("student_id", studentId);
  const appIds = (apps ?? []).map((a) => a.id);

  // partner_document_exchange.student_id has no cascade/FK ON DELETE — detach
  // rather than block the delete, since these files belong to the partner,
  // not the student record being removed.
  await supabase.from("partner_document_exchange").update({ student_id: null }).eq("student_id", studentId);

  // encrypted_credentials has no FK at all (owner_id is generic) — clean up
  // explicitly so deleting the lead doesn't leave orphaned encrypted rows.
  await supabase.from("encrypted_credentials").delete().eq("owner_type", "student").eq("owner_id", studentId);
  if (appIds.length > 0) {
    await supabase.from("encrypted_credentials").delete().eq("owner_type", "application").in("owner_id", appIds);
  }

  const { error } = await supabase.from("leads").delete().eq("id", studentId);
  if (error) return { error: error.message };

  if (lead?.auth_user_id) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(lead.auth_user_id).catch(() => {});
  }

  revalidatePath("/students");
  revalidatePath("/leads");
  return { success: true };
}

export async function registerLead(leadId: string, _formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("leads").update({ status: "registered" }).eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/students");
  redirect(`/students/${leadId}`);
}
