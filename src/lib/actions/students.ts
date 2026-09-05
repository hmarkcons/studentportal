"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Saves the entire "Personal details" card on a registered student's profile
// tab in one submit — the core lead fields (name, contact, registration
// fields) and the student_profiles fields (passport/ID, emergency contact,
// financial & sponsor) used to be two separate forms/buttons; staff kept
// losing edits to whichever one they didn't click.
export async function updateRegisteredStudentProfile(
  studentId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const date_of_birth = String(formData.get("date_of_birth") ?? "") || null;
  if (!date_of_birth) return { error: "Date of birth is required." };

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      full_name,
      contact_number: String(formData.get("contact_number") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      platform_source: String(formData.get("platform_source") ?? "").trim() || null,
      current_qualification: String(formData.get("current_qualification") ?? "").trim() || null,
      level_applying_for: String(formData.get("level_applying_for") ?? "") || null,
      course_of_interest: String(formData.get("course_of_interest") ?? "").trim() || null,
      date_of_birth,
      address: String(formData.get("address") ?? "").trim() || null,
      home_phone: String(formData.get("home_phone") ?? "").trim() || null,
    })
    .eq("id", studentId);
  if (leadError) return { error: leadError.message };

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
      passport_number: String(formData.get("passport_number") ?? "").trim() || null,
      passport_expiry: String(formData.get("passport_expiry") ?? "") || null,
      passport_issue_date: String(formData.get("passport_issue_date") ?? "") || null,
      cnic: String(formData.get("cnic") ?? "").trim() || null,
      postal_code: String(formData.get("postal_code") ?? "").trim() || null,
      emergency_contact_name: String(formData.get("emergency_contact_name") ?? "").trim() || null,
      emergency_contact_number: String(formData.get("emergency_contact_number") ?? "").trim() || null,
      emergency_contact_relation: String(formData.get("emergency_contact_relation") ?? "").trim() || null,
      qualification_grade: String(formData.get("qualification_grade") ?? "").trim() || null,
      financial_sponsor_name: String(formData.get("financial_sponsor_name") ?? "").trim() || null,
      financial_sponsor_relation: String(formData.get("financial_sponsor_relation") ?? "").trim() || null,
      financial_details,
    },
    { onConflict: "student_id" }
  );
  if (profileError) return { error: profileError.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
