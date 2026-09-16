import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { bodiesForUniversity } from "@/lib/scholarshipMatch";
import { scholarshipGate, scholarshipGateMessage } from "@/lib/scholarshipGate";
import { scholarshipPortals } from "@/lib/scholarshipPortal";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { listScholarshipProofs } from "@/lib/actions/scholarshipProofs";
import { ScholarshipProofs } from "./ScholarshipProofs";
import { AddScholarships } from "./AddScholarships";
import { ScholarshipPortals } from "./ScholarshipPortals";
import { guideFreshness } from "@/lib/academicYear";
import { ScholarshipGuide } from "@/components/ScholarshipGuide";
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
      "id, is_finalized, preenrollment_finalized, university:universities(name, destination:destinations(id, country, display_name, scholarship_access, currency))"
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

  // Nothing at all until a university is finalised for pre-enrolment.
  //
  // This page used to show every open application's possible body while none
  // was finalised, which read as several live scholarships when there were
  // none: the body, its deadlines and its income thresholds all follow the
  // region the chosen university sits in, so there is nothing to apply for
  // until one is chosen.
  // Whether the office has said it is pursuing a scholarship here, read from
  // each application's own tracker. Italy carries no such field and arrives
  // as undefined, which the gate treats as "not declined" — exactly as before.
  const { data: intentRows } = await supabase
    .from("application_country_extra")
    .select("application_id, field_value")
    .eq("field_key", "scholarship_intent")
    .in("application_id", withDestination.map((w) => w.app.id));
  const intentByApp = new Map((intentRows ?? []).map((r) => [r.application_id, r.field_value]));

  const gate = scholarshipGate(
    withDestination.map((w) => ({
      applicationId: w.app.id,
      destinationId: w.destinationId,
      // What the office calls finalising to pre-enrol. Kept in step with
      // is_finalized by the trigger in migration 0173.
      preenrollmentFinalized: Boolean(w.app.preenrollment_finalized || w.app.is_finalized),
      hasBody: Boolean(w.destinationId && destinationsWithBodies.has(w.destinationId)),
      intent: intentByApp.get(w.app.id) ?? null,
    }))
  );

  if (gate.reason) {
    return (
      <Card>
        <EmptyState>{scholarshipGateMessage(gate.reason)}</EmptyState>
      </Card>
    );
  }

  const visibleIds = new Set(gate.visible.map((v) => v.applicationId));
  const candidates = withDestination.filter((w) => visibleIds.has(w.app.id));

  const appIds = candidates.map((w) => w.app.id);
  const [{ data: bodies }, { data: allScholarships }] = await Promise.all([
    supabase
      .from("scholarship_bodies")
      // covers is what maps a university to its body — without it the matcher
      // has nothing to match on and silently finds nothing.
      .select(
        "id, name, region, covers, academic_year, application_deadline, apply_url, isee_threshold, ispe_threshold, call_status, call_expected_on, call_pdf_url, call_pdf_path, call_pdf_language, call_page_url, source_url, guide_sections, destinations:scholarship_body_destinations(destination_id)"
      )
      .order("region")
      .order("name"),
    supabase
      .from("student_scholarships")
      .select("id, name, status, award_amount, application_id, scholarship_body_id, application_deadline")
      .in("application_id", appIds),
  ]);

  // Proof files per scholarship, and the student's portal logins. Both read
  // here so the client components are handed what they need rather than
  // signing URLs or decrypting anything themselves.
  const [proofsByScholarship, credentialTypes] = await Promise.all([
    listScholarshipProofs((allScholarships ?? []).map((sc) => sc.id)),
    listCredentialTypesAction("student", id),
  ]);
  const portals = scholarshipPortals(credentialTypes);

  // Signed here rather than in the guide component, which runs on the client
  // and cannot sign anything.
  const signedCalls = new Map<string, string>();
  await Promise.all(
    (bodies ?? [])
      .filter((b) => b.call_pdf_path)
      .map(async (b) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(b.call_pdf_path!, 3600);
        if (data?.signedUrl) signedCalls.set(b.id, data.signedUrl);
      })
  );

  return (
    <div className="flex flex-col gap-6">
      {candidates.map((w) => {
        const scholarships = (allScholarships ?? []).filter((s) => s.application_id === w.app.id);
        const countryBodies = (bodies ?? []).filter((b) =>
          ((b.destinations ?? []) as { destination_id: string }[]).some((d) => d.destination_id === w.destinationId)
        );

        // The body that actually pays for this university. Offering all
        // twenty-one Italian agencies when the student is going to Pisa is
        // how the wrong one gets picked; DSU Toscana is the only answer.
        // Only narrowed once the university is settled — before that the whole
        // list is still the honest answer.
        const designated = w.app.is_finalized ? bodiesForUniversity(w.universityName, countryBodies) : [];
        const offeredBodies = designated.length > 0 ? designated : countryBodies;

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
            {w.app.is_finalized && (
              <p className="mb-3 rounded-md border border-success bg-success-bg px-3 py-2 text-xs text-success">
                <span className="font-medium">{w.universityName}</span> is finalised in Applications, so the scholarship
                is open to this student.{" "}
                {designated.length > 0 ? (
                  <>
                    {designated.length === 1 ? "Its scholarship body is" : "Its scholarship bodies are"}{" "}
                    <span className="font-medium">{designated.map((b) => b.name).join(", ")}</span> — the only one
                    offered below.
                  </>
                ) : (
                  <>
                    No body in the directory lists this university, so all of {w.country}&rsquo;s are offered below. Add
                    it to a body&rsquo;s &ldquo;covers&rdquo; in Setup &rsaquo; Scholarship bodies to narrow this.
                  </>
                )}
              </p>
            )}
            {!w.app.is_finalized && w.access === "universal" && (
              <p className="mb-3 text-xs text-muted">
                No university finalised for {w.country} yet, so every body is offered. Finalise one in Applications and
                only its own body will be shown.
              </p>
            )}
            {w.access !== "universal" && scholarships.length === 0 && (
              <p className="mb-3 text-xs text-muted">
                {w.country}&rsquo;s scholarships are awarded on merit to a small number of students, so this is not
                offered to everyone. Add one below if this student is being put forward for it.
              </p>
            )}
            {offeredBodies.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {offeredBodies.map((b) => (
                  <ScholarshipGuide
                    key={b.id}
                    body={{
                      id: b.id,
                      name: b.name,
                      region: b.region,
                      academic_year: b.academic_year ?? null,
                      application_deadline: b.application_deadline ?? null,
                      apply_url: b.apply_url ?? null,
                      isee_threshold: b.isee_threshold ?? null,
                      ispe_threshold: b.ispe_threshold ?? null,
                      call_status: b.call_status ?? "published",
                      call_expected_on: b.call_expected_on ?? null,
                      call_pdf_url: b.call_pdf_url ?? null,
                      call_pdf_signed_url: signedCalls.get(b.id) ?? null,
                      call_pdf_language: b.call_pdf_language ?? null,
                      call_page_url: b.call_page_url ?? null,
                      source_url: b.source_url ?? null,
                      guide_sections: Array.isArray(b.guide_sections)
                        ? (b.guide_sections as { title: string; body: string }[])
                        : [],
                      staleFor: (() => {
                        const f = guideFreshness(b.academic_year);
                        return f.state === "stale" ? f.expected : null;
                      })(),
                    }}
                  />
                ))}
              </div>
            )}
            {/* Outside Italy, a scholarship is a decision somebody takes on
                the Dashboard tracker. Until they answer Yes, the list of
                bodies is reference material, not a thing to fill in — and
                offering the picker would be answering the question for them. */}
            {canManage && intentByApp.get(w.app.id) === "Yes" && (
              <div className="mb-3">
                <AddScholarships
                  studentId={id}
                  applicationId={w.app.id}
                  revalidateTo={`/students/${id}/scholarship`}
                  countryName={w.country ?? "this country"}
                  bodies={offeredBodies.map((b) => ({
                    id: b.id,
                    name: b.name,
                    region: b.region,
                    alreadyAdded: scholarships.some((s) => s.scholarship_body_id === b.id),
                  }))}
                />
              </div>
            )}
            {canManage && intentByApp.get(w.app.id) === "Not decided" && (
              <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                Nobody has decided yet whether this student is applying for a {w.country ?? ""} scholarship. Answer
                &ldquo;Applying for a scholarship?&rdquo; on the{" "}
                <Link href={`/students/${id}`} className="text-primary hover:underline">
                  Dashboard tracker
                </Link>
                , and the ones to choose from appear here.
              </p>
            )}

            <ScholarshipSection
              studentId={id}
              applicationId={w.app.id}
              revalidateTo={`/students/${id}/scholarship`}
              bodies={offeredBodies.map((b) => ({ id: b.id, name: b.name, region: b.region }))}
              scholarships={scholarships}
              preenrollmentFinalized={w.app.preenrollment_finalized}
              canManage={canManage}
              currencySymbol={w.currencySymbol}
            />
            {/* The evidence each application was actually submitted, kept with
                the application it belongs to rather than in one pile. */}
            {scholarships.map((sc) => (
              <ScholarshipProofs
                key={sc.id}
                scholarshipId={sc.id}
                studentId={id}
                proofs={proofsByScholarship[sc.id] ?? []}
                canManage={canManage}
              />
            ))}
          </Card>
        );
      })}

      {/* Once for the student, not once per country: these are their own
          accounts and the portal's name says which region it belongs to. */}
      <ScholarshipPortals
        studentId={id}
        portals={portals}
        canManage={canManage}
        revalidateTo={`/students/${id}/scholarship`}
      />
    </div>
  );
}
