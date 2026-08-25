import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { PersonalDetailsForm } from "./PersonalDetailsForm";
import { ProfileDetailsForm } from "./ProfileDetailsForm";

export default async function PortalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, full_name, email, contact_number, date_of_birth, address, home_phone, emergency_contact_name, emergency_contact_relation, emergency_contact_number"
    )
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();
  if (!student) return null;

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("passport_number, passport_expiry, cnic, financial_sponsor_name, financial_sponsor_relation")
    .eq("student_id", student.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Profile</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Personal details</h3>
        <p className="mb-4 text-xs text-muted">Your email and case status can only be changed by your counselor.</p>
        <PersonalDetailsForm studentId={student.id} student={student} />
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Passport & sponsor details</h3>
        <ProfileDetailsForm studentId={student.id} profile={profile} />
      </Card>
    </div>
  );
}
