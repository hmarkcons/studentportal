import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { TestScoresSection } from "@/components/TestScoresSection";
import { TravelHistorySection } from "@/components/TravelHistorySection";
import { VisaRefusalHistorySection } from "@/components/VisaRefusalHistorySection";
import { LeadEditForm } from "@/components/LeadEditForm";
import { StudentProfileForm } from "../StudentProfileForm";

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

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Personal details</h3>

        <div className="mb-4">
          <PhotoUpload studentId={id} revalidateTo={revalidateTo} photoUrl={photoUrl} />
        </div>

        <div className="mb-4 flex justify-end">
          {student && <LeadEditForm lead={{ id, ...student }} revalidateTo={revalidateTo} showRegistrationFields />}
        </div>
        <StudentProfileForm studentId={id} profile={profile} />

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Test scores</h4>
          <TestScoresSection studentId={id} revalidateTo={revalidateTo} scores={testScores ?? []} />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Travel history</h4>
          <TravelHistorySection studentId={id} revalidateTo={revalidateTo} records={(profile?.travel_history ?? []) as never} />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Visa refusal / deportation history</h4>
          <VisaRefusalHistorySection studentId={id} revalidateTo={revalidateTo} records={(profile?.visa_refusal_history ?? []) as never} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Academics</h3>
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
