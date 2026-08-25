"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Personal-detail fields a student may edit on their own `leads` row — the
// `restrict_student_lead_self_update` trigger (0022) blocks case/
// registration fields at the DB level regardless of what's sent here, but
// keeping this list explicit avoids relying on that as the only guardrail.
export async function updatePersonalDetails(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const { error } = await supabase
    .from("leads")
    .update({
      full_name,
      contact_number: String(formData.get("contact_number") ?? "").trim() || null,
      date_of_birth: String(formData.get("date_of_birth") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      home_phone: String(formData.get("home_phone") ?? "").trim() || null,
      emergency_contact_name: String(formData.get("emergency_contact_name") ?? "").trim() || null,
      emergency_contact_relation: String(formData.get("emergency_contact_relation") ?? "").trim() || null,
      emergency_contact_number: String(formData.get("emergency_contact_number") ?? "").trim() || null,
    })
    .eq("id", studentId);

  if (error) return { error: error.message };
  revalidatePath("/portal/profile");
  return { success: true };
}

export async function updateProfileDetails(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const passport_number = String(formData.get("passport_number") ?? "").trim() || null;
  const passport_expiry = String(formData.get("passport_expiry") ?? "").trim() || null;
  const cnic = String(formData.get("cnic") ?? "").trim() || null;
  const financial_sponsor_name = String(formData.get("financial_sponsor_name") ?? "").trim() || null;
  const financial_sponsor_relation = String(formData.get("financial_sponsor_relation") ?? "").trim() || null;

  const { error } = await supabase.from("student_profiles").upsert({
    student_id: studentId,
    passport_number,
    passport_expiry,
    cnic,
    financial_sponsor_name,
    financial_sponsor_relation,
  });

  if (error) return { error: error.message };
  revalidatePath("/portal/profile");
  return { success: true };
}
