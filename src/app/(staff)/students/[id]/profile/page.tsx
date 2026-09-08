import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { uploadStudentPhoto } from "@/lib/actions/studentProfileExtras";
import { TestScoresSection } from "@/components/TestScoresSection";
import { TravelVisaHistorySection } from "@/components/TravelVisaHistorySection";
import { RegisteredStudentProfileForm } from "../RegisteredStudentProfileForm";

export default async function StudentProfileTab(props: PageProps<"/students/[id]/profile">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: student }, { data: profile }, { data: qualifications }, { data: testScores }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "full_name, contact_number, email, platform_source, current_qualification, level_applying_for, course_of_interest, date_of_birth, address, home_phone"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", id),
    supabase.from("student_test_scores").select("id, test_type, score, test_date").eq("student_id", id).order("test_date", { ascending: false }),
  ]);

  const revalidateTo = `/students/${id}/profile`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">Personal details</h3>

        {/* Controls only — the photo itself is shown in the page header
            above, which this revalidates ("layout") after an upload. */}
        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Photo</span>
          <div className="mt-1">
            <PhotoUpload
              action={uploadStudentPhoto.bind(null, id, `/students/${id}`)}
              photoUrl={null}
              hidePreview
              hasPhoto={Boolean(profile?.photo_path)}
            />
          </div>
        </div>

        {student && <RegisteredStudentProfileForm studentId={id} revalidateTo={revalidateTo} lead={student} profile={profile} />}
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">Test scores</h3>
        <TestScoresSection studentId={id} revalidateTo={revalidateTo} scores={testScores ?? []} />
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">Travel &amp; visa history</h3>
        <TravelVisaHistorySection
          studentId={id}
          revalidateTo={revalidateTo}
          travel={(profile?.travel_history ?? []) as never}
          refusals={(profile?.visa_refusal_history ?? []) as never}
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">Academics</h3>
        <AcademicsSection
          studentId={id}
          revalidateTo={revalidateTo}
          levelApplyingFor={student?.level_applying_for ?? null}
          qualifications={qualifications ?? []}
        />
      </Card>
    </div>
  );
}
