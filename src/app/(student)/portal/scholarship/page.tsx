import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import { formatDateOnly } from "@/lib/formatDate";
import { scholarshipPortals } from "@/lib/scholarshipPortal";
import { callLink, callAbsenceNote } from "@/lib/scholarshipCallLink";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { VisaCredentials } from "../visa/VisaCredentials";
import { ScholarshipGuide } from "@/components/ScholarshipGuide";
import { bodiesForUniversity } from "@/lib/scholarshipMatch";
import { guideFreshness } from "@/lib/academicYear";
import {
  SCHOLARSHIP_CURRENCY_SYMBOL,
  SCHOLARSHIP_STATUS_TONE,
  scholarshipStatusLabel,
  type ScholarshipStatus,
} from "@/lib/scholarships";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Body = {
  name: string;
  region: string | null;
  academic_year: string | null;
  application_deadline: string | null;
  document_upload_deadline: string | null;
  courier_deadline: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  stipend_amount: string | null;
  benefits: string | null;
  source_url: string | null;
  call_status: string | null;
  call_expected_on: string | null;
  call_pdf_path: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_pdf_language: string | null;
};

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-xs text-muted sm:w-44">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

/**
 * The region's call for applications, as the student sees it.
 *
 * Given its own block rather than a link in the row of links, because it is
 * not one more reference: it is the rule the whole card summarises, and the
 * one document a student is expected to have read before they ring the office
 * about a threshold.
 *
 * The language is said out loud. Most regions publish the bando in Italian
 * only, and a student who opens forty pages of Italian expecting English
 * assumes the portal sent them to the wrong place.
 */
function CallForApplications({ body, signed }: { body: Body; signed: Map<string, string> }) {
  const call = callLink({
    ...body,
    call_pdf_signed_url: body.call_pdf_path ? signed.get(body.call_pdf_path) ?? null : null,
  });

  if (!call) {
    return (
      <p className="mt-3 rounded-lg border border-border bg-bg/60 px-3 py-2 text-xs text-muted">
        {callAbsenceNote(body)}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3.5 py-2.5">
      <a
        href={call.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {call.kind === "page" ? "🔗" : "📄"} {call.label}
        {call.kind === "stored" ? "" : " →"}
      </a>
      <p className="mt-1 text-xs text-muted">
        {call.kind === "page"
          ? `The call, its annexes and the forms are published on ${body.name}'s own site. Everything on this card is a summary of it.`
          : `Published by ${body.name}. Everything on this card is a summary of it — the call is what decides.`}
        {call.language === "it" && " It is in Italian; ask your counsellor if anything in it is unclear."}
      </p>
    </div>
  );
}

// The student's own view of their DSU scholarship.
//
// student_scholarships_select has always granted a student their own rows once
// the application's pre-enrolment on Universitaly is finalised — the policy was
// written for this page, which did not exist, so the tick on the staff side
// gated a view nobody could reach. Row-level security is what decides here:
// this page queries the student's scholarships and gets back only what that
// policy allows, so an application still awaiting pre-enrolment simply returns
// nothing rather than needing a second check in the app.
export default async function PortalScholarshipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("leads").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();

  // Their own logins for the agency portals. Listed here and decrypted only
  // when they press Show — read_credential has always allowed a student to
  // read their own, the same as the visa appointment login.
  const portals = student ? scholarshipPortals(await listCredentialTypesAction("student", student.id)) : [];
  if (!student) return null;

  // What each of the student's countries offers — the menu shows this page
  // for a country with a scholarship body on file, so the page says what that
  // is, country by country, rather than assuming Italy.
  const [{ data: registered }, { data: applied }] = await Promise.all([
    supabase.from("lead_destinations").select("destination:destinations(id, display_name, scholarship_access)").eq("lead_id", student.id),
    supabase
      .from("applications")
      .select("id, is_finalized, university:universities(name, dsu_body_id, dsu_body:scholarship_bodies(name), destination:destinations(id, display_name, scholarship_access))")
      .eq("student_id", student.id),
  ]);
  type Dest = { id: string; display_name: string; scholarship_access: string | null };
  const countries = new Map<string, Dest & { bodies: string[]; chosen: { university: string; body: string }[] }>();
  const addCountry = (d: Dest | null) => {
    if (d?.id && !countries.has(d.id)) countries.set(d.id, { ...d, bodies: [], chosen: [] });
  };
  for (const r of registered ?? []) addCountry(one(r.destination as never) as Dest | null);
  for (const a of applied ?? []) {
    const uni = one(a.university as never) as { name?: string; dsu_body?: unknown; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as Dest | null) : null;
    addCountry(dest);
    const body = uni?.dsu_body ? (one(uni.dsu_body as never) as { name?: string } | null) : null;
    if (dest?.id && body?.name && uni?.name) countries.get(dest.id)!.chosen.push({ university: uni.name, body: body.name });
  }
  const { data: bodyLinks } = countries.size
    ? await supabase
        .from("scholarship_body_destinations")
        .select(
          "destination_id, body:scholarship_bodies(id, name, region, covers, academic_year, application_deadline, apply_url, isee_threshold, ispe_threshold, call_status, call_expected_on, call_pdf_url, call_pdf_path, call_pdf_language, call_page_url, source_url, guide_sections)"
        )
        .in("destination_id", [...countries.keys()])
    : { data: [] };
  type GuideRow = {
    id: string;
    name: string;
    region: string | null;
    covers: string[] | null;
    academic_year: string | null;
    application_deadline: string | null;
    apply_url: string | null;
    isee_threshold: string | null;
    ispe_threshold: string | null;
    call_status: string | null;
    call_expected_on: string | null;
    call_pdf_url: string | null;
    call_pdf_path: string | null;
    call_pdf_language: string | null;
    call_page_url: string | null;
    source_url: string | null;
    guide_sections: unknown;
  };
  const bodiesByCountry = new Map<string, GuideRow[]>();
  for (const link of bodyLinks ?? []) {
    const body = one(link.body as never) as GuideRow | null;
    if (!body?.name) continue;
    countries.get(link.destination_id as string)?.bodies.push(body.name);
    bodiesByCountry.set(link.destination_id as string, [...(bodiesByCountry.get(link.destination_id as string) ?? []), body]);
  }

  // A university finalised for the visa settles which body pays for it: the
  // one set on the university in Setup, or else the one the directory's covers
  // name (scholarshipMatch.ts). The student sees that body's guide from then
  // on, exactly as their counsellor does on the staff Scholarship tab. It used
  // to wait until a scholarship was recorded, which left the student with
  // nothing while the office was already reading the deadlines.
  const finalized = (applied ?? []).flatMap((a) => {
    if (!a.is_finalized) return [];
    const uni = one(a.university as never) as { name?: string; dsu_body_id?: string | null; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as Dest | null) : null;
    const countryBodies = dest?.id ? (bodiesByCountry.get(dest.id) ?? []) : [];
    if (!dest || !uni?.name || countryBodies.length === 0) return [];
    const chosen = uni.dsu_body_id ? countryBodies.filter((b) => b.id === uni.dsu_body_id) : [];
    const bodies = chosen.length > 0 ? chosen : bodiesForUniversity(uni.name, countryBodies);
    return [{ appId: a.id as string, university: uni.name, country: dest.display_name, access: dest.scholarship_access, bodies }];
  });
  const offering = [...countries.values()].filter((c) => c.bodies.length > 0);
  const universal = offering.some((c) => c.scholarship_access === "universal");

  const { data: scholarships } = await supabase
    .from("student_scholarships")
    .select(
      "id, name, status, award_amount, application_deadline, body:scholarship_bodies(name, region, academic_year, application_deadline, document_upload_deadline, courier_deadline, isee_threshold, ispe_threshold, stipend_amount, benefits, source_url, call_status, call_expected_on, call_pdf_path, call_pdf_url, call_page_url, call_pdf_language)"
    )
    .eq("student_id", student.id);

  // The copy HMARK holds of each call, signed for this student. Any signed-in
  // user may read scholarship-calls (0175), so this is the student's own link
  // to the same paper their counsellor is reading — and it keeps answering
  // after the region takes the original down, which they do every year.
  //
  // Signed once per path: two scholarships in the same region share a body.
  const callPaths = [
    ...new Set(
      [
        ...(scholarships ?? []).map((s) => (one(s.body as never) as Body | null)?.call_pdf_path),
        ...finalized.flatMap((f) => f.bodies.map((b) => b.call_pdf_path)),
      ].filter((p): p is string => Boolean(p))
    ),
  ];
  const signedCalls = new Map<string, string>();
  await Promise.all(
    callPaths.map(async (path) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (data?.signedUrl) signedCalls.set(path, data.signedUrl);
    })
  );

  const recorded = (scholarships ?? []).length;
  const awarded = (scholarships ?? []).filter((s) => s.status === "accepted").length;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon="🎓"
        title="Scholarship"
        description="The scholarships open to you in the countries you are applying to, and — once one is recorded for you — where your application stands."
      >
        {(offering.length > 0 || recorded > 0) && (
          <PortalStats className="xl:grid-cols-3">
            <PortalStat icon="🌍" value={offering.length} label={`countr${offering.length === 1 ? "y offers" : "ies offer"} one`} tone="info" />
            <PortalStat icon="📨" value={recorded} label={`application${recorded === 1 ? "" : "s"} recorded`} />
            <PortalStat icon="🏅" value={awarded} label="awarded" tone={awarded > 0 ? "success" : "default"} />
          </PortalStats>
        )}
      </PortalPageHeader>

      {offering.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3" data-scholarship-countries>
          {offering.map((c) => (
            <Card key={c.id} className="relative overflow-hidden">
              <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/10" />
              <div className="relative mb-2 flex flex-wrap items-center justify-between gap-2" data-scholarship-country={c.display_name}>
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <span aria-hidden>🎓</span>
                  {c.display_name}
                </h3>
                {c.scholarship_access === "universal" ? (
                  <Badge tone="success">Every student can apply</Badge>
                ) : (
                  <Badge tone="info">Merit-based · limited places</Badge>
                )}
              </div>
              <p className="text-xs text-muted">
                {c.scholarship_access === "universal"
                  ? "Regional scholarships (DSU) are awarded by the region your university sits in, on the basis of your family’s ISEE and ISPE assessment."
                  : "Awarded to a few students on merit. Your counsellor will tell you whether you are being put forward."}
              </p>
              {c.chosen.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                  {c.chosen.map((u) => (
                    <li key={u.university} className="text-ink">
                      <span className="text-muted">{u.university}:</span> {u.body}
                    </li>
                  ))}
                </ul>
              )}
              {(() => {
                const others = c.bodies.filter((b) => !c.chosen.some((u) => u.body === b));
                // Folded: Italy alone has over twenty regional bodies, and the
                // one that matters is the one above, when it is set.
                return others.length > 0 ? (
                  <details className="mt-2 text-[11px] text-muted">
                    <summary className="cursor-pointer">
                      {others.length} {c.chosen.length > 0 ? "other " : ""}bod{others.length === 1 ? "y" : "ies"} in {c.display_name}
                    </summary>
                    <p className="mt-1">{others.join(", ")}</p>
                  </details>
                ) : null;
              })()}
            </Card>
          ))}
        </div>
      )}

      {finalized.length > 0 && (
        <section className="flex flex-col gap-3" data-finalized-scholarship>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <span aria-hidden>🏛️</span> Your university&rsquo;s scholarship
          </h3>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {finalized.map((f) => (
              <Card key={f.appId} className="relative overflow-hidden">
                <span aria-hidden className="bg-hero absolute inset-x-0 top-0 h-1.5" />
                <div className="flex flex-col gap-3" data-finalized-for={f.university}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-ink">{f.university}</h4>
                      <p className="text-xs text-muted">{f.country}</p>
                    </div>
                    <Badge tone="success">Finalised for your visa</Badge>
                  </div>
                  <p className="text-sm text-ink">
                    {f.bodies.length === 0
                      ? `Your counsellor will confirm which scholarship body handles ${f.university}.`
                      : f.access === "universal"
                        ? `As a student at ${f.university}, you apply to ${f.bodies.map((b) => b.name).join(" or ")} for your scholarship. What it asks for, and when:`
                        : `${f.bodies.map((b) => b.name).join(" or ")} awards scholarships here on merit. Your counsellor will tell you whether you are being put forward.`}
                  </p>
                  {f.bodies.map((b) => (
                    <ScholarshipGuide
                      key={b.id}
                      audience="student"
                      body={{
                        id: b.id,
                        name: b.name,
                        region: b.region,
                        academic_year: b.academic_year,
                        application_deadline: b.application_deadline,
                        apply_url: b.apply_url,
                        isee_threshold: b.isee_threshold,
                        ispe_threshold: b.ispe_threshold,
                        call_status: b.call_status ?? "published",
                        call_expected_on: b.call_expected_on,
                        call_pdf_url: b.call_pdf_url,
                        call_pdf_signed_url: b.call_pdf_path ? (signedCalls.get(b.call_pdf_path) ?? null) : null,
                        call_pdf_language: b.call_pdf_language,
                        call_page_url: b.call_page_url,
                        source_url: b.source_url,
                        guide_sections: Array.isArray(b.guide_sections) ? (b.guide_sections as { title: string; body: string }[]) : [],
                        staleFor: (() => {
                          const fresh = guideFreshness(b.academic_year);
                          return fresh.state === "stale" ? fresh.expected : null;
                        })(),
                      }}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {(scholarships ?? []).length === 0 ? (
        <Card>
          <PortalEmpty icon="🏅">
            {finalized.some((f) => f.bodies.length > 0)
              ? `Your application to ${finalized.find((f) => f.bodies.length > 0)!.bodies.map((b) => b.name).join(" or ")} has not been recorded yet. Your counsellor adds it here once it is submitted, with its status and anything still to send.`
              : universal
              ? "Nothing to show yet. Your scholarship appears here once your pre-enrollment on Universitaly.it has been finalized and we have recorded your application with the regional body. Your counsellor can tell you where it has got to in the meantime."
              : "Nothing recorded yet. If your counsellor puts you forward for a scholarship, it appears here with its deadlines and what to send."}
          </PortalEmpty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          {(scholarships ?? []).map((s) => {
            const body = one(s.body as never) as Body | null;
            return (
              <Card key={s.id} className="relative overflow-hidden">
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${s.status === "accepted" ? "bg-success" : s.status === "rejected" ? "bg-danger" : "bg-hero"}`} />
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                      <span aria-hidden>{s.status === "accepted" ? "🏆" : "🏅"}</span>
                      {s.name ?? body?.name ?? "Scholarship"}
                    </h3>
                    <p className="text-xs text-muted">
                      {[s.name && body ? body.name : null, body?.region, body?.academic_year]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge tone={SCHOLARSHIP_STATUS_TONE[s.status as ScholarshipStatus] ?? "neutral"}>
                    {scholarshipStatusLabel(s.status)}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <Detail
                    label="Award"
                    value={
                      s.award_amount != null
                        ? `${SCHOLARSHIP_CURRENCY_SYMBOL}${Number(s.award_amount).toLocaleString("en-US")}`
                        : null
                    }
                  />
                  <Detail
                    label="Your deadline"
                    value={s.application_deadline ? formatDateOnly(s.application_deadline, { day: "numeric", month: "short", year: "numeric" }) : null}
                  />
                  <Detail label="Application window" value={body?.application_deadline ?? null} />
                  <Detail label="Document upload by" value={body?.document_upload_deadline ?? null} />
                  <Detail label="Courier by" value={body?.courier_deadline ?? null} />
                  <Detail label="ISEE threshold" value={body?.isee_threshold ?? null} />
                  <Detail label="ISPE threshold" value={body?.ispe_threshold ?? null} />
                  <Detail label="Stipend" value={body?.stipend_amount ?? null} />
                  <Detail label="Also covers" value={body?.benefits ?? null} />
                </div>

                {/* The call is the document that actually governs: every
                    deadline, threshold and required paper on this card is a
                    summary of it. A student who is asked for an ISEE nobody
                    explained needs to be able to read the rule themselves. */}
                {body && <CallForApplications body={body} signed={signedCalls} />}

                {body?.source_url && (
                  <a
                    href={body.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {body.name} &mdash; official site &rarr;
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* So a student never has to ring the office for their own password. */}
      {student && portals.length > 0 && (
        <Card>
          <h3 className="mb-1 flex items-center gap-2.5 text-base font-semibold text-ink">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-base">🔐</span>
            Your scholarship portal logins
          </h3>
          <p className="mb-3 text-xs text-muted">
            Your own accounts on the scholarship portals. Nothing is shown until you ask for it.
          </p>
          <div className="flex flex-col gap-3">
            {portals.map((portal) => (
              <VisaCredentials
                key={portal.credentialType}
                studentId={student.id}
                credentialType={portal.credentialType}
                label={portal.label}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
