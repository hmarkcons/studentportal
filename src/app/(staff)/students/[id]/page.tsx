import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { categorizeApplicationStage } from "@/lib/applicationStage";
import type { DocRow } from "@/components/DocumentChecklist";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documentCategories";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { GenerateAgreementForm, UploadSignedAgreementForm } from "./GenerateAgreementForm";
import { GenerateAgreementPdfButton } from "./GenerateAgreementPdfButton";
import { AgreementActionsMenu } from "./AgreementActionsMenu";
import { GenerateInvoiceForm, InvoiceCard } from "./InvoicePanel";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { PortalCredentialsSection } from "./PortalCredentialsSection";
import { DashboardTaskList, type DashboardTaskRow } from "./DashboardTaskList";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { RegistrationEditForm } from "./RegistrationEditForm";
import { getCachedDestinations, getCachedCounselors, getCachedAgreementTemplates, getCachedFeeProducts } from "@/lib/cachedQueries";
import { getEffectivePermissions } from "@/lib/auth/permissions";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function slugForFilename(value: string) {
  return value.trim().replace(/\s+/g, "_");
}

// The download filename shown to whoever opens a generated agreement's PDF
// link — built from the destination's actual country/track columns (not the
// free-text display_name, which isn't guaranteed to follow "Country
// (Track)" for a hand-typed/test destination) so it's always predictable.
function generatedAgreementFilename(studentName: string | undefined | null, destination: { country?: string; track?: string } | null) {
  const country = destination?.country
    ? slugForFilename(`${destination.country} (${destination.track === "public" ? "Public" : "Private"})`)
    : "Destination";
  const student = studentName ? slugForFilename(studentName) : "Student";
  return `HMC-Student-Agreement-${country}-${student}.pdf`;
}

export default async function StudentDashboardPage(props: PageProps<"/students/[id]">) {
  const { id } = await props.params;
  const { supabase, staff: viewerStaff } = await getStaffSession();
  const isSuperAdminRole = viewerStaff?.role === "super_admin";
  const perms = await getEffectivePermissions();
  const isSuperAdmin = perms["agreements.edit_delete"] === true;
  const canModifyAgreement = perms["agreements.process"] === true;
  const canManageInvoice = perms["finance.invoices.manage"] === true;
  const canDeleteInvoice = perms["finance.invoices.delete"] === true;

  await ensureStudentDocumentRequirements(id);

  // ---- Level 1: every query below is independent of every other — fetch all
  // of them concurrently instead of one round trip at a time. ----
  const [
    [
      { data: student },
      { data: leadRegistration },
      { data: selectedDestinations },
      { data: agreements },
      { data: invoices },
      { data: applications },
      { data: rawDocs },
      existingCredentialTypes,
    ],
    allDestinations,
    counselors,
    templates,
    feeProducts,
  ] = await Promise.all([
    Promise.all([
      supabase
        .from("students")
        .select("auth_user_id, full_name, portal_active")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("leads").select("assigned_counselor_id, intake, discount_amount, discount_reason").eq("id", id).maybeSingle(),
      supabase
        .from("lead_destinations")
        .select("destination_id, dashboard_stage_values, destination:destinations(display_name, dashboard_pipeline_stages)")
        .eq("lead_id", id),
      supabase
        .from("agreements")
        .select(
          "id, status, signing_method, signed_file_path, pdf_path, email_verified, discount_amount, created_at, template_id, admin_charge_override, consultancy_fee_override, installment_count, template:agreement_templates(file_path, destination_id, destination:destinations(country, track))"
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select(
          "id, admin_charge, consultancy_fee, currency, sent_status, agreement_id, pdf_path, invoice_number, intake, terms, installment_plan, admin_fee_status, admin_fee_paid_date, admin_fee_payment_method"
        )
        .eq("student_id", id),
      supabase
        .from("applications")
        .select(
          `id, current_stage, intake, deadline,
           university:universities(name, destination:destinations(id, country_code, display_name, pipeline_stages, dashboard_pipeline_stages)),
           program:programs(name)`
        )
        .eq("student_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_documents")
        .select("id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .returns<(DocRow & { application_id: string | null; custom_name: string | null; template: { name: string } | { name: string }[] | null })[]>(),
      listCredentialTypesAction("student", id),
    ]),
    // Reference/lookup data — identical for every staff member, cached for 5
    // minutes and invalidated on demand from the Setup pages that edit it.
    getCachedDestinations(),
    getCachedCounselors(),
    getCachedAgreementTemplates(),
    getCachedFeeProducts(),
  ]);

  const signedAgreement = agreements?.find((a) => a.status === "signed");
  const latestAgreement = agreements?.[0];
  const signedAgreementTemplate = signedAgreement
    ? (one(signedAgreement.template as never) as { destination_id?: string } | null)
    : null;
  const signedAgreementDestination = signedAgreementTemplate?.destination_id
    ? allDestinations.find((d) => d.id === signedAgreementTemplate.destination_id)
    : null;
  const defaultInstallmentPlan = signedAgreementDestination?.installment_plan ?? null;
  // Pre-fill the invoice form with the SIGNED agreement's actual figures
  // (override if set, else the destination's default) so staff no longer
  // have to remember and retype them by hand — the consultancy fee already
  // has the agreement's discount subtracted, same as the agreement PDF's fee
  // table, so the invoice and the signed agreement always agree on what the
  // client actually owes.
  const defaultInvoiceAdminCharge = signedAgreement
    ? (signedAgreement.admin_charge_override ?? signedAgreementDestination?.admin_charge ?? null)
    : null;
  const defaultInvoiceConsultancyFee =
    signedAgreement && signedAgreementDestination
      ? (signedAgreement.consultancy_fee_override ?? signedAgreementDestination.consultancy_fee ?? 0) - (signedAgreement.discount_amount ?? 0)
      : null;
  const defaultInvoiceCurrency = signedAgreementDestination?.consultancy_fee_currency ?? null;
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const appIds = (applications ?? []).map((a) => a.id);
  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));

  // ---- Documentation trackers, grouped by country (one card per country the
  // student has an application in, keyed to that country's first application
  // for the application_country_extra foreign key) ----
  const primaryAppByCountry = new Map<string, { id: string; countryCode: string; displayName: string }>();
  const appsByCountry = new Map<string, { id: string; name: string }[]>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as {
      name?: string;
      destination?: { country_code?: string; display_name?: string } | { country_code?: string; display_name?: string }[];
    } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string; display_name?: string } | null) : null;
    const code = dest?.country_code;
    if (!code) continue;
    if (!primaryAppByCountry.has(code)) {
      primaryAppByCountry.set(code, { id: a.id, countryCode: code, displayName: dest?.display_name ?? code });
    }
    (appsByCountry.get(code) ?? appsByCountry.set(code, []).get(code)!).push({ id: a.id, name: uni?.name ?? "University" });
  }

  // ---- Application-status stat tiles (Applications/With Offer/Submitted/
  // Pending/Rejected/Not Eligible) — one row per real application, never
  // deduplicated, since these are meant to count actual applications. ----
  const applicationStatusRows = (applications ?? []).map((a) => {
    const uni = one(a.university as never) as {
      name?: string;
      destination?:
        | { country_code?: string; display_name?: string; pipeline_stages?: string[] }
        | { country_code?: string; display_name?: string; pipeline_stages?: string[] }[];
    } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { pipeline_stages?: string[] } | null) : null;
    return {
      id: a.id,
      currentStage: a.current_stage,
      pipelineStages: dest?.pipeline_stages ?? [],
    };
  });

  const applicationStats = { total: applicationStatusRows.length, pending: 0, submitted: 0, with_offer: 0, rejected: 0, not_eligible: 0 };
  for (const row of applicationStatusRows) {
    const category = categorizeApplicationStage(row.currentStage, row.pipelineStages);
    if (category === "withdrawn") continue;
    applicationStats[category] += 1;
  }

  // ---- Pipeline visualization, shown at the very top of the dashboard —
  // one card per destination the student either has a real application to,
  // OR selected as a country of interest at registration (lead_destinations)
  // with no application yet — so staff can start tracking a destination's
  // progress before any university application exists. Each card is driven
  // by that destination's own dashboard_pipeline_stages and this student's
  // saved dashboard_stage_values (from lead_destinations, defaulting to none
  // set — setDashboardStageValue upserts that row on first edit if it's
  // missing). The subtitle names the university/ies applied to, or "No
  // application yet" when there are none. ----
  const savedStageValuesByDestinationId = new Map<string, Record<string, string>>(
    (selectedDestinations ?? []).map((sd) => [sd.destination_id, (sd.dashboard_stage_values as Record<string, string> | null) ?? {}])
  );

  const destinationPipelineGroups = new Map<
    string,
    { destinationName: string; stages: DashboardStageDef[]; universityNames: string[] }
  >();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as {
      name?: string;
      destination?:
        | { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] }
        | { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] }[];
    } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null)
      : null;
    if (!dest?.id) continue;
    if (!destinationPipelineGroups.has(dest.id)) {
      destinationPipelineGroups.set(dest.id, {
        destinationName: dest.display_name ?? "Destination",
        stages: dest.dashboard_pipeline_stages ?? [],
        universityNames: [],
      });
    }
    destinationPipelineGroups.get(dest.id)!.universityNames.push(uni?.name ?? "University");
  }
  for (const sd of selectedDestinations ?? []) {
    if (destinationPipelineGroups.has(sd.destination_id)) continue;
    const dest = one(sd.destination as never) as { display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
    if (!dest) continue;
    destinationPipelineGroups.set(sd.destination_id, {
      destinationName: dest.display_name ?? "Destination",
      stages: dest.dashboard_pipeline_stages ?? [],
      universityNames: [],
    });
  }

  const destinationPipelineRows = Array.from(destinationPipelineGroups.entries())
    .filter(([, group]) => group.stages.length > 0)
    .map(([destinationId, group]) => ({
      destinationId,
      destinationName: group.destinationName,
      applicationSummary: group.universityNames.length === 0
        ? "No application yet"
        : group.universityNames.length === 1
          ? group.universityNames[0]
          : `${group.universityNames.length} applications`,
      stages: group.stages,
      values: savedStageValuesByDestinationId.get(destinationId) ?? {},
    }));

  // ---- Level 2: each of these depends only on level-1 results, and is
  // independent of every other level-2 query — fetch concurrently again. ----
  const [
    agreementLinkEntries,
    { data: allLineItems },
    invoicePdfEntries,
    { data: installments },
    docsWithUrls,
    { data: rawTasks },
    trackerDefsByCountry,
    { data: assignedCounselorStaff },
    { data: processingOfficers },
  ] = await Promise.all([
    Promise.all(
      (agreements ?? []).map(async (a) => {
        const links: { templateUrl?: string; signedUrl?: string; pdfUrl?: string } = {};
        const tmpl = one(a.template as never) as { file_path?: string; destination?: unknown } | null;
        if (tmpl?.file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(tmpl.file_path, 3600);
          if (data?.signedUrl) links.templateUrl = data.signedUrl;
        }
        if (a.signed_file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.signed_file_path, 3600);
          if (data?.signedUrl) links.signedUrl = data.signedUrl;
        }
        if (a.pdf_path) {
          const destination = tmpl?.destination ? (one(tmpl.destination as never) as { country?: string; track?: string } | null) : null;
          const { data } = await supabase.storage
            .from("documents")
            .createSignedUrl(a.pdf_path, 3600, { download: generatedAgreementFilename(student?.full_name, destination) });
          if (data?.signedUrl) links.pdfUrl = data.signedUrl;
        }
        return [a.id, links] as const;
      })
    ),
    invoiceIds.length
      ? supabase.from("invoice_line_items").select("id, invoice_id, name, amount").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      (invoices ?? [])
        .filter((i) => i.pdf_path)
        .map(async (i) => {
          const { data } = await supabase.storage.from("documents").createSignedUrl(i.pdf_path!, 3600);
          return [i.id, data?.signedUrl] as const;
        })
    ),
    invoiceIds.length ? supabase.from("invoice_installments").select("*").in("invoice_id", invoiceIds) : Promise.resolve({ data: [] }),
    Promise.all(
      (rawDocs ?? []).map(async (d) => {
        const templateName = one(d.template as never) as { name?: string } | null;
        const uni = d.application_id ? appLabel.get(d.application_id) : null;
        const name = `${d.custom_name ?? templateName?.name ?? d.category ?? "Document"}${uni?.name ? ` — ${uni.name}` : " — Student-level"}`;
        if (!d.file_path) return { ...d, name };
        const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
        return { ...d, name, fileUrl: data?.signedUrl ?? null };
      })
    ),
    appIds.length
      ? supabase
          .from("application_tasks")
          .select("id, description, due_date, status, priority, application_id")
          .in("application_id", appIds)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    listTrackerDefinitions(Array.from(primaryAppByCountry.keys())),
    leadRegistration?.assigned_counselor_id
      ? supabase
          .from("staff")
          .select("full_name, designation, mobile_official, mobile_personal, email_official, photo_path")
          .eq("id", leadRegistration.assigned_counselor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Not a per-student assignment — every active Processing-role staff
    // member is shown here, since ownership of processing work transfers to
    // the whole Processing Team (not one named person) once a lead
    // registers, per the doc's handoff rule.
    supabase
      .from("staff")
      .select("id, full_name, designation, mobile_official, mobile_personal, email_official, photo_path")
      .eq("role", "processing")
      .eq("status", "active")
      .order("full_name"),
  ]);

  let assignedCounselorPhotoUrl: string | null = null;
  if (assignedCounselorStaff?.photo_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(assignedCounselorStaff.photo_path, 3600);
    assignedCounselorPhotoUrl = data?.signedUrl ?? null;
  }
  const processingOfficerPhotoUrls = new Map<string, string>();
  await Promise.all(
    (processingOfficers ?? [])
      .filter((o) => o.photo_path)
      .map(async (o) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(o.photo_path!, 3600);
        if (data?.signedUrl) processingOfficerPhotoUrls.set(o.id, data.signedUrl);
      })
  );

  const agreementLinks = new Map(agreementLinkEntries);
  const invoicePdfUrls = new Map(invoicePdfEntries.filter((e): e is readonly [string, string] => Boolean(e[1])));

  const taskRows: DashboardTaskRow[] = (rawTasks ?? []).map((t) => ({
    id: t.id,
    description: t.description,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority,
    applicationLabel: appLabel.get(t.application_id)?.name ?? "Application",
  }));

  const applicationOptions = (applications ?? []).map((a) => ({
    id: a.id,
    label: (one(a.university as never) as { name?: string } | null)?.name ?? "University",
  }));

  // ---- Missing documents, collapsed to a per-category count for the
  // Dashboard summary — the full checklist (upload/accept/reject) stays on
  // the dedicated Documents tab, linked below. ----
  const missingDocCountsByCategory = new Map<string, number>();
  for (const d of docsWithUrls) {
    if (d.status !== "missing") continue;
    const key = d.category && (CATEGORY_ORDER as readonly string[]).includes(d.category) ? d.category : "other";
    missingDocCountsByCategory.set(key, (missingDocCountsByCategory.get(key) ?? 0) + 1);
  }
  const missingDocSummary = CATEGORY_ORDER.filter((cat) => cat !== "interview" && (missingDocCountsByCategory.get(cat) ?? 0) > 0).map((cat) => ({
    label: CATEGORY_LABELS[cat] ?? cat,
    count: missingDocCountsByCategory.get(cat) ?? 0,
  }));

  // ---- Level 3: per-country tracker sections — each country's fields fetch
  // in parallel, one level below trackerDefsByCountry (level 2). ----
  const trackerSections = await Promise.all(
    Array.from(primaryAppByCountry.values())
      .filter((entry) => (trackerDefsByCountry[entry.countryCode]?.length ?? 0) > 0)
      .map(async (entry) => {
        const needsScholarshipBodies = entry.countryCode === "IT";
        const [{ data: extras }, bodiesResult] = await Promise.all([
          supabase.from("application_country_extra").select("field_key, field_value").eq("application_id", entry.id),
          needsScholarshipBodies
            ? supabase.from("scholarship_bodies").select("region, covers")
            : Promise.resolve({ data: null as { region: string; covers: string[] | null }[] | null }),
        ]);
        const values: Record<string, string> = {};
        (extras ?? []).forEach((e) => (values[e.field_key] = e.field_value ?? ""));

        const universityOptions = (appsByCountry.get(entry.countryCode) ?? []).map((a) => ({ value: a.id, label: a.name }));
        const regionByUniversityValue: Record<string, string> = {};

        if (needsScholarshipBodies) {
          for (const a of appsByCountry.get(entry.countryCode) ?? []) {
            const match = (bodiesResult.data ?? []).find((b) => (b.covers ?? []).includes(a.name));
            if (match?.region) regionByUniversityValue[a.id] = match.region;
          }
        }

        return { entry, values, fields: trackerDefsByCountry[entry.countryCode] ?? [], universityOptions, regionByUniversityValue };
      })
  );

  return (
    <div>
      {destinationPipelineRows.length > 0 && (
        <>
          <div className="mb-6 flex flex-col gap-4">
            {destinationPipelineRows.map((row) => (
              <DestinationPipelineCard
                key={row.destinationId}
                leadId={id}
                destinationId={row.destinationId}
                destinationName={row.destinationName}
                subtitle={row.applicationSummary}
                stages={row.stages}
                values={row.values}
                editable
                revalidateTo={`/students/${id}`}
              />
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            <StatCard label="Applications" value={applicationStats.total} />
            <StatCard label="With Offer" value={applicationStats.with_offer} tone="success" />
            <StatCard label="Submitted" value={applicationStats.submitted} />
            <StatCard label="Pending" value={applicationStats.pending} tone="warning" />
            <StatCard label="Rejected" value={applicationStats.rejected} tone="danger" />
            <StatCard label="Not Eligible" value={applicationStats.not_eligible} tone="danger" />
          </div>
        </>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Registration & Portal Access</h3>
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Registration</p>
          <RegistrationEditForm
            studentId={id}
            revalidateTo={`/students/${id}`}
            destinations={allDestinations ?? []}
            selectedDestinationIds={(selectedDestinations ?? []).map((d) => d.destination_id)}
            counselors={counselors ?? []}
            assignedCounselorId={leadRegistration?.assigned_counselor_id ?? null}
            intake={leadRegistration?.intake ?? null}
            discountAmount={leadRegistration?.discount_amount ?? null}
            discountReason={leadRegistration?.discount_reason ?? null}
          />
        </div>
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Portal access</p>
          <PortalAccessPanel
            studentId={id}
            enabled={Boolean(student?.auth_user_id)}
            portalActive={Boolean(student?.portal_active)}
            isSuperAdmin={isSuperAdminRole}
          />
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Missing Documents</h3>
            <Link href={`/students/${id}/documents`} className="text-xs text-primary hover:underline">
              View all documents →
            </Link>
          </div>
          {missingDocSummary.length === 0 ? (
            <p className="text-sm text-muted">
              {docsWithUrls.length === 0 ? "No documents required yet." : "Nothing missing — all required documents submitted."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {missingDocSummary.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{s.label}</span>
                  <span className="font-semibold text-danger">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Tasks</h3>
          <DashboardTaskList tasks={taskRows} applications={applicationOptions} studentId={id} />
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Agreement</h3>
        {canModifyAgreement && (
          <GenerateAgreementForm studentId={id} templates={templates ?? []} discountAmount={leadRegistration?.discount_amount ?? null} />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => {
              const links = agreementLinks.get(a.id);
              return (
                <div key={a.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} ·{" "}
                      {new Date(a.created_at).toLocaleDateString()}
                      {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {links?.signedUrl ? (
                        <a
                          href={links.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          View signed copy
                        </a>
                      ) : (
                        !links?.pdfUrl &&
                        links?.templateUrl && (
                          <a
                            href={links.templateUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                          >
                            View template
                          </a>
                        )
                      )}
                      {links?.pdfUrl && (
                        <a
                          href={links.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          View generated agreement
                        </a>
                      )}
                      {canModifyAgreement && a.status !== "signed" && (
                        <GenerateAgreementPdfButton agreementId={a.id} studentId={id} revalidateTo={`/students/${id}`} hasPdf={Boolean(links?.pdfUrl)} />
                      )}
                      <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                      <AgreementActionsMenu
                        agreement={a}
                        studentId={id}
                        templates={templates ?? []}
                        links={links}
                        canEdit={isSuperAdmin && a.status !== "signed"}
                        canDelete={isSuperAdmin}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {canModifyAgreement && latestAgreement && latestAgreement.status !== "signed" && (
              <UploadSignedAgreementForm agreementId={latestAgreement.id} studentId={id} />
            )}
          </div>
        )}
      </Card>

      {signedAgreement && (
        <Card className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Invoice</h3>
          {canManageInvoice && (
            <GenerateInvoiceForm
              studentId={id}
              agreementId={signedAgreement.id}
              defaultInstallmentPlan={defaultInstallmentPlan}
              defaultAdminCharge={defaultInvoiceAdminCharge}
              defaultConsultancyFee={defaultInvoiceConsultancyFee}
              defaultCurrency={defaultInvoiceCurrency}
            />
          )}
          <div className="mt-4 flex flex-col gap-3">
            {(invoices ?? []).map((inv) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                installments={(installments ?? []).filter((i) => i.invoice_id === inv.id)}
                lineItems={(allLineItems ?? []).filter((li) => li.invoice_id === inv.id)}
                feeProducts={feeProducts ?? []}
                studentId={id}
                pdfUrl={invoicePdfUrls.get(inv.id)}
                revalidateTo={`/students/${id}`}
                canManage={canManageInvoice}
                isSuperAdmin={canDeleteInvoice}
              />
            ))}
          </div>
        </Card>
      )}

      {trackerSections.length > 0 && (
        <Card className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Documentation tracker</h3>
          <div className="flex flex-col gap-6">
            {trackerSections.map(({ entry, values, fields, universityOptions, regionByUniversityValue }) => (
              <div key={entry.countryCode}>
                <p className="mb-2 text-xs font-medium text-muted">{entry.displayName}</p>
                <CountryTrackerForm
                  applicationId={entry.id}
                  fields={fields}
                  values={values}
                  revalidateTo={`/students/${id}`}
                  universityOptions={universityOptions}
                  regionByUniversityValue={regionByUniversityValue}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Portal credentials</h3>
        <PortalCredentialsSection studentId={id} existingTypes={existingCredentialTypes} />
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Assigned Counselor & Processing Officer</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Assigned Counselor</p>
            {assignedCounselorStaff ? (
              <div className="flex items-start gap-3 text-sm text-ink">
                {assignedCounselorPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assignedCounselorPhotoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
                    —
                  </div>
                )}
                <div>
                  <p className="font-medium">{assignedCounselorStaff.full_name}</p>
                  {assignedCounselorStaff.designation && <p className="text-muted">{assignedCounselorStaff.designation}</p>}
                  {(assignedCounselorStaff.mobile_official ?? assignedCounselorStaff.mobile_personal) && (
                    <p className="text-muted">{assignedCounselorStaff.mobile_official ?? assignedCounselorStaff.mobile_personal}</p>
                  )}
                  {assignedCounselorStaff.email_official && <p className="text-muted">{assignedCounselorStaff.email_official}</p>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Not assigned yet — set one from the Registration card above.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Processing Officer</p>
            {processingOfficers && processingOfficers.length > 0 ? (
              <div className="flex flex-col gap-3">
                {processingOfficers.map((officer) => (
                  <div key={officer.id} className="flex items-start gap-3 text-sm text-ink">
                    {processingOfficerPhotoUrls.has(officer.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={processingOfficerPhotoUrls.get(officer.id)} alt="" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
                        —
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{officer.full_name}</p>
                      {officer.designation && <p className="text-muted">{officer.designation}</p>}
                      {(officer.mobile_official ?? officer.mobile_personal) && (
                        <p className="text-muted">{officer.mobile_official ?? officer.mobile_personal}</p>
                      )}
                      {officer.email_official && <p className="text-muted">{officer.email_official}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No processing officer on file.</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
