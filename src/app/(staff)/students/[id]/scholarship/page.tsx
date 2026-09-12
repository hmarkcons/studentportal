import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { SCHOLARSHIP_CURRENCY_SYMBOL } from "@/lib/scholarships";
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
    .select(
      "id, preenrollment_finalized, university:universities(name, destination:destinations(id, country, display_name, scholarship_access, currency))"
    )
    .eq("student_id", id);

  // Which applications this page has anything to say about. Two different
  // situations, and collapsing them was the old hard-coded "IT":
  //
  //   * Italy's DSU is a right — every registered student there is offered
  //     one, so the section opens on its own (scholarship_access 'universal').
  //
  //   * everywhere else a scholarship is merit-based with a small quota —
  //     France's Eiffel takes thirty master's students in the world — so the
  //     section is opened for one student at a time. It appears once staff
  //     record a scholarship, and until then the country is offered as
  //     something they may open rather than promised to the student.
  const withDestination = (applications ?? []).map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as {
          id?: string;
          country?: string;
          display_name?: string;
          scholarship_access?: string;
          currency?: string;
        } | null)
      : null;
    return {
      app: a,
      universityName: uni?.name ?? "University",
      destinationId: dest?.id ?? null,
      country: dest?.country ?? null,
      access: dest?.scholarship_access ?? "selective",
      // The destination's own currency, so a UK award is not labelled €.
      currencySymbol: CURRENCY_SYMBOLS[dest?.currency ?? ""] ?? dest?.currency ?? SCHOLARSHIP_CURRENCY_SYMBOL,
    };
  });

  // A country with no body on file has nothing to award, whatever its access.
  const { data: bodyLinks } = await supabase.from("scholarship_body_destinations").select("destination_id");
  const destinationsWithBodies = new Set((bodyLinks ?? []).map((l) => l.destination_id as string));

  const candidates = withDestination.filter((w) => w.destinationId && destinationsWithBodies.has(w.destinationId));

  if (candidates.length === 0) {
    return (
      <Card>
        <EmptyState>
          No scholarship applicable — none of this student&rsquo;s countries has a scholarship body on file. Add one in
          Setup &rsaquo; Scholarship bodies to track scholarships for a country.
        </EmptyState>
      </Card>
    );
  }

  const appIds = candidates.map((w) => w.app.id);
  const [{ data: bodies }, { data: allScholarships }] = await Promise.all([
    supabase
      .from("scholarship_bodies")
      .select("id, name, region, destinations:scholarship_body_destinations(destination_id)")
      .order("region")
      .order("name"),
    supabase
      .from("student_scholarships")
      .select("id, name, status, award_amount, application_id, scholarship_body_id, application_deadline")
      .in("application_id", appIds),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {candidates.map((w) => {
        const scholarships = (allScholarships ?? []).filter((s) => s.application_id === w.app.id);
        const countryBodies = (bodies ?? []).filter((b) =>
          ((b.destinations ?? []) as { destination_id: string }[]).some((d) => d.destination_id === w.destinationId)
        );

        return (
          <Card key={w.app.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">
                {w.universityName}
                {w.country && <span className="ml-2 font-normal text-muted">{w.country}</span>}
              </h3>
              {w.access === "universal" ? (
                <Badge tone="success">Every student is offered this</Badge>
              ) : (
                <Badge tone="info">Merit-based · limited places</Badge>
              )}
            </div>
            {w.access !== "universal" && scholarships.length === 0 && (
              <p className="mb-3 text-xs text-muted">
                {w.country}&rsquo;s scholarships are awarded on merit to a small number of students, so this is not
                offered to everyone. Add one below if this student is being put forward for it.
              </p>
            )}
            <ScholarshipSection
              studentId={id}
              applicationId={w.app.id}
              revalidateTo={`/students/${id}/scholarship`}
              bodies={countryBodies.map((b) => ({ id: b.id, name: b.name, region: b.region }))}
              scholarships={scholarships}
              preenrollmentFinalized={w.app.preenrollment_finalized}
              canManage={canManage}
              currencySymbol={w.currencySymbol}
            />
          </Card>
        );
      })}
    </div>
  );
}
