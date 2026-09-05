import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { TestScoresSection } from "@/components/TestScoresSection";
import { TravelHistorySection } from "@/components/TravelHistorySection";
import { VisaRefusalHistorySection } from "@/components/VisaRefusalHistorySection";
import { ProfileForm } from "./ProfileForm";
import { uploadStudentPhoto } from "@/lib/actions/studentProfileExtras";

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

  const [{ data: profile }, { data: qualifications }, { data: testScores }] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("student_id", student.id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", student.id),
    supabase.from("student_test_scores").select("id, test_type, score, test_date").eq("student_id", student.id).order("test_date", { ascending: false }),
  ]);

  const revalidateTo = "/portal/profile";

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Profile</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Personal details</h3>
        <p className="mb-4 text-xs text-muted">Your email and case status can only be changed by your counselor.</p>

        <div className="mb-4">
          <PhotoUpload action={uploadStudentPhoto.bind(null, student.id, revalidateTo)} photoUrl={photoUrl} />
        </div>

        <ProfileForm
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
          profile={profile}
        />

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Test scores</h4>
          <TestScoresSection studentId={student.id} revalidateTo={revalidateTo} scores={testScores ?? []} />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Travel history</h4>
          <TravelHistorySection studentId={student.id} revalidateTo={revalidateTo} records={(profile?.travel_history ?? []) as never} />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Visa refusal / deportation history</h4>
          <VisaRefusalHistorySection studentId={student.id} revalidateTo={revalidateTo} records={(profile?.visa_refusal_history ?? []) as never} />
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
