import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScholarshipSection } from "../applications/[appId]/tracker/ScholarshipSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentScholarshipTab(props: PageProps<"/students/[id]/scholarship">) {
  const { id } = await props.params;
  const { supabase, staff: staffRow } = await getStaffSession();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: applications } = await supabase
    .from("applications")
    .select("id, preenrollment_finalized, university:universities(name, destination:destinations(country_code))")
    .eq("student_id", id);

  const italyApps = (applications ?? []).filter((a) => {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string } | null) : null;
    return dest?.country_code === "IT";
  });

  if (italyApps.length === 0) {
    return (
      <Card>
        <EmptyState>No scholarship applicable — this student has no Italy application.</EmptyState>
      </Card>
    );
  }

  const italyAppIds = italyApps.map((a) => a.id);
  const [{ data: bodies }, { data: allScholarships }] = await Promise.all([
    supabase.from("scholarship_bodies").select("id, name, region"),
    supabase.from("student_scholarships").select("id, name, status, award_amount, application_id").in("application_id", italyAppIds),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {italyApps.map((a) => {
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
              isSuperAdmin={isSuperAdmin}
            />
          </Card>
        );
      })}
    </div>
  );
}
