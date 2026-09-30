import { createClient } from "@/lib/supabase/server";
import { Camera, Globe, GraduationCap, IdCard, NotebookPen, UserRound, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AcademicsSection } from "@/components/AcademicsSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { TestScoresSection } from "@/components/TestScoresSection";
import { TravelVisaHistorySection } from "@/components/TravelVisaHistorySection";
import { ProfileForm } from "./ProfileForm";
import { ProfileCompleteness } from "@/components/ProfileCompleteness";
import { uploadStudentPhoto, deleteStudentPhoto } from "@/lib/actions/studentProfileExtras";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { getCurrentUser } from "@/lib/auth/currentUser";

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-ink">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {children}
    </h3>
  );
}

export default async function PortalProfilePage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, email, contact_number, date_of_birth, address, home_phone, level_applying_for, student_code")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();
  if (!student) return null;

  const [{ data: profile }, { data: qualifications }, { data: testScores }] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("student_id", student.id).maybeSingle(),
    supabase.from("student_qualifications").select("*").eq("student_id", student.id),
    supabase.from("student_test_scores").select("id, test_type, score, test_date, custom_test_name").eq("student_id", student.id).order("test_date", { ascending: false }),
  ]);

  const revalidateTo = "/portal/profile";

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={UserRound}
        title="Profile"
        description="Your personal, passport and sponsor details, your test scores and your academics — what your visa and applications are built from."
        aside={
          // Their own number. Quoted back at them by the office, so they should
          // not have to ring up and ask what it is.
          student.student_code ? (
            <span className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted">
              Student ID <span className="ml-1 font-mono text-sm font-semibold tracking-wide text-ink">{student.student_code}</span>
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle icon={IdCard}>Personal details</SectionTitle>
          <p className="-mt-1 mb-4 text-xs text-muted">Your email and case status can only be changed by your counsellor.</p>
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
        </Card>

        <div className="flex flex-col gap-6 xl:sticky xl:top-20">
          {/* What is still outstanding, beside the form itself — a student
              should not have to audit eleven fields to find the two they
              skipped. */}
          <ProfileCompleteness
            input={{
              contact_number: student.contact_number,
              date_of_birth: student.date_of_birth,
              address: student.address,
              emergency_contact_name: profile?.emergency_contact_name ?? null,
              emergency_contact_number: profile?.emergency_contact_number ?? null,
              passport_number: profile?.passport_number ?? null,
              passport_expiry: profile?.passport_expiry ?? null,
              cnic: profile?.cnic ?? null,
              financial_sponsor_name: profile?.financial_sponsor_name ?? null,
              financial_sponsor_relation: profile?.financial_sponsor_relation ?? null,
              financial_details: profile?.financial_details ?? null,
            }}
          />

          <Card>
            <SectionTitle icon={Camera}>Your photo</SectionTitle>
            {/* The student's own photo is theirs to change and theirs to
                remove — student_profiles_write is staff-or-self, so the same
                rule covers both sides of this. */}
            <PhotoUpload
              action={uploadStudentPhoto.bind(null, student.id, revalidateTo)}
              photoUrl={photoUrl}
              onDelete={deleteStudentPhoto.bind(null, student.id, revalidateTo)}
              deleteLabel="your photo"
            />
          </Card>
        </div>
      </div>

      {/* The two short lists side by side on a wide screen. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={NotebookPen}>Test scores</SectionTitle>
          <TestScoresSection studentId={student.id} revalidateTo={revalidateTo} scores={testScores ?? []} />
        </Card>

        <Card>
          <SectionTitle icon={Globe}>Travel &amp; visa history</SectionTitle>
          <TravelVisaHistorySection
            studentId={student.id}
            revalidateTo={revalidateTo}
            travel={(profile?.travel_history ?? []) as never}
            refusals={(profile?.visa_refusal_history ?? []) as never}
          />
        </Card>
      </div>

      <Card>
        <SectionTitle icon={GraduationCap}>Academics</SectionTitle>
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
