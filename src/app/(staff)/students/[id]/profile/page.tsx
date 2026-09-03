import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { LeadEditForm } from "@/components/LeadEditForm";
import { StudentProfileForm } from "../StudentProfileForm";

export default async function StudentProfileTab(props: PageProps<"/students/[id]/profile">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: student }, { data: profile }, { data: qualifications }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "full_name, contact_number, email, platform_source, current_qualification, level_applying_for, course_of_interest, date_of_birth, address, home_phone"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", id),
  ]);

  const revalidateTo = `/students/${id}/profile`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Personal details</h3>
        <div className="mb-4 flex justify-end">
          {student && <LeadEditForm lead={{ id, ...student }} revalidateTo={revalidateTo} showRegistrationFields />}
        </div>
        <StudentProfileForm studentId={id} profile={profile} />
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
