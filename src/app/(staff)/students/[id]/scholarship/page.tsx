import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SCHOLARSHIP_COUNTRY_CODE } from "@/lib/scholarships";
import { ScholarshipSection } from "../applications/[appId]/tracker/ScholarshipSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentScholarshipTab(props: PageProps<"/students/[id]/scholarship">) {
  const { id } = await props.params;
  const { supabase, staff } = await getStaffSession();
  if (!staff) return null;

  // Gated on the permission, not on role === "super_admin". Editing was
  // hardcoded to Super Admin, so granting Processing scholarships.manage in
  // Admin > Role Permissions changed what the server would accept and nothing
  // about what the page offered.
  const canManage = await hasPermission("scholarships.manage");

  const { data: applications } = await supabase
    .from("applications")
    .select("id, preenrollment_finalized, university:universities(name, destination:destinations(country_code))")
    .eq("student_id", id);

  // Italy only, deliberately: every body in the directory is an Italian
  // regional DSU agency and the surrounding fields (ISEE/ISPE thresholds,
  // Universitaly pre-enrolment) belong to that system. See
  // SCHOLARSHIP_COUNTRY_CODE.
  const scholarshipApps = (applications ?? []).filter((a) => {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string } | null) : null;
    return dest?.country_code === SCHOLARSHIP_COUNTRY_CODE;
  });

  if (scholarshipApps.length === 0) {
    return (
      <Card>
        <EmptyState>
          No scholarship applicable — this student has no Italy application. The scholarships tracked here are Italy&rsquo;s
          regional DSU awards.
        </EmptyState>
      </Card>
    );
  }

  const appIds = scholarshipApps.map((a) => a.id);
  const [{ data: bodies }, { data: allScholarships }] = await Promise.all([
    supabase.from("scholarship_bodies").select("id, name, region").order("region").order("name"),
    supabase
      .from("student_scholarships")
      .select("id, name, status, award_amount, application_id, scholarship_body_id, application_deadline")
      .in("application_id", appIds),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {scholarshipApps.map((a) => {
        const uni = one(a.university as never) as { name?: string } | null;
        const scholarships = (allScholarships ?? []).filter((s) => s.application_id === a.id);

        return (
          <Card key={a.id}>
            <h3 className="mb-3 text-sm font-medium text-ink">{uni?.name ?? "University"}</h3>
            <ScholarshipSection
              studentId={id}
              applicationId={a.id}
              revalidateTo={`/students/${id}/scholarship`}
              bodies={bodies ?? []}
              scholarships={scholarships}
              preenrollmentFinalized={a.preenrollment_finalized}
              canManage={canManage}
            />
          </Card>
        );
      })}
    </div>
  );
}
