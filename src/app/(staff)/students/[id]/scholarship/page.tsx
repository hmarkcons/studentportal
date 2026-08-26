import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ScholarshipSection } from "../applications/[appId]/tracker/ScholarshipSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentScholarshipTab(props: PageProps<"/students/[id]/scholarship">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
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
        <p className="text-sm text-muted">No scholarship applicable — this student has no Italy application.</p>
      </Card>
    );
  }

  const { data: bodies } = await supabase.from("scholarship_bodies").select("id, name, region");

  return (
    <div className="flex flex-col gap-6">
      {await Promise.all(
        italyApps.map(async (a) => {
          const uni = one(a.university as never) as { name?: string } | null;
          const { data: scholarships } = await supabase
            .from("student_scholarships")
            .select("id, name, status, award_amount")
            .eq("application_id", a.id);

          return (
            <Card key={a.id}>
              <h3 className="mb-3 text-sm font-medium text-ink">{uni?.name ?? "University"}</h3>
              <ScholarshipSection
                studentId={id}
                applicationId={a.id}
                revalidateTo={`/students/${id}/scholarship`}
                bodies={bodies ?? []}
                scholarships={scholarships ?? []}
                preenrollmentFinalized={a.preenrollment_finalized}
                isSuperAdmin={isSuperAdmin}
              />
            </Card>
          );
        })
      )}
    </div>
  );
}
