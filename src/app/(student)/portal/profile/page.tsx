import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PersonalDetailsForm } from "./PersonalDetailsForm";
import { ProfileDetailsForm } from "./ProfileDetailsForm";

export default async function PortalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, email, contact_number, date_of_birth, address, home_phone, level_applying_for")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();
  if (!student) return null;

  const [{ data: profile }, { data: qualifications }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("passport_number, passport_expiry, cnic, financial_sponsor_name, financial_sponsor_relation, emergency_contact_name, emergency_contact_relation, emergency_contact_number")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", student.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Profile</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Personal details</h3>
        <p className="mb-4 text-xs text-muted">Your email and case status can only be changed by your counselor.</p>
        <PersonalDetailsForm
          studentId={student.id}
          student={{
            full_name: student.full_name,
            contact_number: student.contact_number,
            date_of_birth: student.date_of_birth,
            address: student.address,
            home_phone: student.home_phone,
            emergency_contact_name: profile?.emergency_contact_name ?? null,
            emergency_contact_relation: profile?.emergency_contact_relation ?? null,
            emergency_contact_number: profile?.emergency_contact_number ?? null,
          }}
        />
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="mb-3 text-sm font-medium text-ink">Passport & sponsor details</h4>
          <ProfileDetailsForm studentId={student.id} profile={profile} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Academics</h3>
        <AcademicsSection
          studentId={student.id}
          revalidateTo="/portal/profile"
          levelApplyingFor={student.level_applying_for}
          qualifications={qualifications ?? []}
        />
      </Card>
    </div>
  );
}
