"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Saves the entire Profile card in one submit — personal details and
// passport/sponsor details used to be two separate forms/buttons, and
// students kept losing edits to whichever one they didn't click.
//
// Personal-detail fields a student may edit on their own `leads` row — the
// `restrict_student_lead_self_update` trigger (0022) blocks case/
// registration fields at the DB level regardless of what's sent here, but
// keeping this list explicit avoids relying on that as the only guardrail.
export async function updateProfile(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      full_name,
      contact_number: String(formData.get("contact_number") ?? "").trim() || null,
      date_of_birth: String(formData.get("date_of_birth") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      home_phone: String(formData.get("home_phone") ?? "").trim() || null,
    })
    .eq("id", studentId);
  if (leadError) return { error: leadError.message };

  // Emergency contact is displayed in this same form for continuity, but it
  // lives in student_profiles, not leads — agreement generation (see
  // generateAgreementPdf) reads emergency_contact_name/relation/number
  // exclusively from student_profiles, the same table the staff-side
  // profile editor writes to. Saving it into leads instead would silently
  // never reach the agreement gate/PDF no matter how completely a student
  // filled this in.
  const financial_details = {
    sponsor_contact_number: String(formData.get("sponsor_contact_number") ?? "").trim() || null,
    sponsor_occupation: String(formData.get("sponsor_occupation") ?? "").trim() || null,
    sponsor_cnic: String(formData.get("sponsor_cnic") ?? "").trim() || null,
    monthly_income: String(formData.get("monthly_income") ?? "").trim() || null,
    income_currency: String(formData.get("income_currency") ?? "").trim() || null,
  };

  const { error: profileError } = await supabase.from("student_profiles").upsert(
    {
      student_id: studentId,
      emergency_contact_name: String(formData.get("emergency_contact_name") ?? "").trim() || null,
      emergency_contact_relation: String(formData.get("emergency_contact_relation") ?? "").trim() || null,
      emergency_contact_number: String(formData.get("emergency_contact_number") ?? "").trim() || null,
      passport_number: String(formData.get("passport_number") ?? "").trim() || null,
      passport_expiry: String(formData.get("passport_expiry") ?? "").trim() || null,
      cnic: String(formData.get("cnic") ?? "").trim() || null,
      financial_sponsor_name: String(formData.get("financial_sponsor_name") ?? "").trim() || null,
      financial_sponsor_relation: String(formData.get("financial_sponsor_relation") ?? "").trim() || null,
      financial_details,
    },
    { onConflict: "student_id" }
  );
  if (profileError) return { error: profileError.message };

  revalidatePath("/portal/profile");
  return { success: true };
}
