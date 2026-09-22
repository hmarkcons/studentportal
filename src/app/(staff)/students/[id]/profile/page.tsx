import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { uploadStudentPhoto, deleteStudentPhoto } from "@/lib/actions/studentProfileExtras";
import { TestScoresSection } from "@/components/TestScoresSection";
import { TravelVisaHistorySection } from "@/components/TravelVisaHistorySection";
import { RegisteredStudentProfileForm } from "../RegisteredStudentProfileForm";

export default async function StudentProfileTab(props: PageProps<"/students/[id]/profile">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [
    { data: student },
    { data: profile },
    { data: qualifications },
    { data: testScores },
    { data: courseInterestOptions },
    { data: registeredFor },
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "full_name, contact_number, email, platform_source, current_qualification, level_applying_for, course_of_interest, interest_field_groups, interest_core_fields, date_of_birth, address, home_phone"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", id),
    supabase.from("student_test_scores").select("id, test_type, score, test_date, custom_test_name").eq("student_id", id).order("test_date", { ascending: false }),
    // One RPC rather than lead_destinations -> universities -> programs read
    // back and reduced here: Germany alone has 421 programmes, so a student
    // with three countries would fetch about a thousand rows to derive a few
    // dozen labels. See 0244.
    supabase.rpc("course_interest_options", { lead: id }),
    // Only for naming the countries in the message below. The picker itself
    // never needs them — the RPC has already resolved what they teach.
    supabase.from("lead_destinations").select("destination:destinations(display_name)").eq("lead_id", id),
  ]);

  const revalidateTo = `/students/${id}/profile`;

  // An empty picker has two very different causes now that the list narrows by
  // level as well as by country (migration 0259), and they need different
  // people to do different things. Hungary teaches nothing at PhD: that is a
  // student registered for a country that cannot take them, not a catalogue
  // with a hole in it, and saying "no programmes on file" would send somebody
  // off to add programmes that do not exist.
  //
  // Deliberately NOT solved by falling back to every level. That would quietly
  // re-offer exactly the wrong-level subjects 0259 exists to stop, and hide the
  // mismatch instead of putting it in front of the person who can fix it.
  const LEVEL_LABELS: Record<string, string> = { bachelors: "bachelors", masters: "masters", phd: "PhD" };
  const registeredCountries = (registeredFor ?? [])
    .map((row) => {
      const d = Array.isArray(row.destination) ? row.destination[0] : row.destination;
      return (d as { display_name?: string } | null)?.display_name ?? null;
    })
    .filter((name): name is string => Boolean(name));
  const level = student?.level_applying_for ?? null;
  const courseInterestEmptyReason =
    (courseInterestOptions ?? []).length === 0 && level && registeredCountries.length > 0
      ? `No ${LEVEL_LABELS[level] ?? level} programmes are on file for ${registeredCountries.join(", ")}, so there is nothing to choose from. Either “Applying for” is wrong for this student, or that country genuinely does not teach at this level and they need a different one — this is not fixed by adding programmes.`
      : null;

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
              onDelete={deleteStudentPhoto.bind(null, id, `/students/${id}`)}
              deleteLabel={`${student?.full_name ?? "this student"}'s photo`}
            />
          </div>
        </div>

        {student && (
          <RegisteredStudentProfileForm
            studentId={id}
            revalidateTo={revalidateTo}
            lead={student}
            profile={profile}
            courseInterestOptions={courseInterestOptions ?? []}
            courseInterestEmptyReason={courseInterestEmptyReason}
          />
        )}
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
