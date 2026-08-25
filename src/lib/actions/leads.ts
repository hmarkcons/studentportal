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
  const country_of_interest = String(formData.get("country_of_interest") ?? "").trim() || null;
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

  redirect(`/leads/${data.id}`);
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

export async function registerLead(leadId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status: "registered" }).eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/students");
  redirect(`/students/${leadId}`);
}
