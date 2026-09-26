import { hasRole } from "@/lib/auth/roles";
import { loadDocumentHistory } from "@/lib/documentHistory";
import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { agreementCountry, agreementLabel } from "@/lib/agreementLabel";
import { agreementTemplateChoices } from "@/lib/agreementTemplateChoices";
import { StatCard } from "@/components/ui/StatCard";
import { categorizeApplicationStage } from "@/lib/applicationStage";
import type { DocRow } from "@/components/DocumentChecklist";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documentCategories";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { loadTrackerPrefillSource } from "@/lib/trackerPrefillSource";
import { trackerSuggestions } from "@/lib/trackerPrefill";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import { seesStagesOnly } from "@/lib/auth/studentAccess";
import { canSetService, serviceOf, templatesForService } from "@/lib/serviceType";
import { StagesOnlyView } from "./StagesOnlyView";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { GenerateAgreementForm, UploadSignedAgreementForm } from "./GenerateAgreementForm";
import { VerifySignedAgreement } from "./VerifySignedAgreement";
import { UndoAgreementApproval, UndoneApprovalNote } from "./UndoAgreementApproval";
import { ConsentVideoLink } from "./ConsentVideoLink";
import { GenerateAgreementPdfButton } from "./GenerateAgreementPdfButton";
import { AgreementActionsMenu } from "./AgreementActionsMenu";
import { GenerateInvoiceForm, InvoiceCard } from "./InvoicePanel";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { documentUrls, avatarUrlMap } from "@/lib/storageUrls";
import { PortalCredentialsSection } from "./PortalCredentialsSection";
import { DashboardTaskList, type DashboardTaskRow } from "./DashboardTaskList";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { RegistrationEditForm } from "./RegistrationEditForm";
import { RestartProcessPanel } from "./RestartProcessPanel";
import { loadRestartContext } from "@/lib/actions/intakeCycles";
import { loadReengagementContext } from "@/lib/actions/reengagement";
import {
  getCachedDestinations,
  getCachedCounselors,
  getCachedAgreementTemplates,
  getCachedFeeProducts,
  selectableDestinations,
} from "@/lib/cachedQueries";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { TrackerCountryTabs } from "@/components/TrackerCountryTabs";
import { uploadedLine } from "@/lib/activityStamp";
import { trackerValueFilled } from "@/lib/trackerValue";

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
  // A counsellor with no processing role follows a registered student's
  // progress and nothing more — before any of the work below, which builds
  // the checklist, prices the invoice and reads the trackers.
  if (seesStagesOnly(viewerStaff)) return <StagesOnlyView studentId={id} supabase={supabase} />;
  const isSuperAdminRole = hasRole(viewerStaff, "super_admin");
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
      supabase.from("leads").select("assigned_counselor_id, processing_officer_id, intake, discount_amount, discount_reason, service_type").eq("id", id).maybeSingle(),
      supabase
        .from("lead_destinations")
        .select("destination_id, is_backup, created_at, dashboard_stage_values, destination:destinations(display_name, country, admin_charge, country_code, dashboard_pipeline_stages, finalize_action_label, visa_service_fee)")
        .eq("lead_id", id),
      supabase
        .from("agreements")
        .select(
          "id, status, version, signing_method, signed_file_path, video_recording_path, signed_file_uploaded_at, video_uploaded_at, approval_undone_at, approval_undo_note, undone_by:staff!agreements_approval_undone_by_fkey(full_name), pdf_path, email_verified, document_status, video_status, document_review_note, video_review_note, discount_amount, created_at, template_id, admin_charge_override, consultancy_fee_override, installment_count, service_type, visa_service_fee_override, template:agreement_templates(file_path, destination_id, destination:destinations(country, track))"
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select(
          // tax_base and issued_on belong here as much as tax_rate does: the
          // card prices the invoice with computeInvoiceMath, and without the
          // rule it was raised under it silently falls back to the old one and
          // shows a total nothing else agrees with.
          "id, admin_charge, consultancy_fee, currency, sent_status, agreement_id, pdf_path, invoice_number, intake, terms, installment_plan, discount_amount, discount_reason, tax_rate, tax_base, issued_on, admin_fee_status, admin_fee_paid_date, admin_fee_payment_method, service_type"
        )
        .eq("student_id", id),
      supabase
        .from("applications")
        .select(
          `id, current_stage, intake, deadline, round_id,
           university:universities(name, destination:destinations(id, country_code, display_name, pipeline_stages, dashboard_pipeline_stages)),
           program:programs(name),
           round:program_intake_rounds(label)`
        )
        .eq("student_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("student_documents")
        .select(
      "id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, uploaded_at, uploaded_by_role, verified_at, created_at, template_id, template:document_templates(name)"
    )
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
  // Header summaries for the collapsible sections below. They open closed, so
  // without these the page would say nothing about whether the agreement is
  // signed or the invoice paid until you opened each one.
  const agreementSummary = !agreements?.length
    ? { text: "Not generated", tone: "neutral" as const }
    : signedAgreement
      ? { text: "Signed", tone: "success" as const }
      : { text: "Awaiting signature", tone: "warning" as const };
  // What this student has against each country, for the warning when one is
  // dropped or swapped. Applications reach their destination through their
  // university; agreements through their template.
  const destinationWork = (allDestinations ?? []).map((d) => {
    const appsHere = (applications ?? []).filter((a) => {
      const uni = one(a.university as never) as { destination?: unknown } | null;
      const dest = uni?.destination ? (one(uni.destination as never) as { id?: string } | null) : null;
      return dest?.id === d.id;
    });
    const agreementsHere = (agreements ?? []).filter((a) => {
      const t = one(a.template as never) as { destination_id?: string } | null;
      return t?.destination_id === d.id;
    });
    return {
      destinationId: d.id,
      name: d.display_name,
      applications: appsHere.length,
      agreements: agreementsHere.length,
      signedAgreements: agreementsHere.filter((a) => a.status === "signed").length,
    };
  });

  // No "latest agreement" any more. A student holds one per destination, so
  // every panel that used to act on agreements[0] now acts on the agreement it
  // is rendered under.
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

  /**
   * How an application reads where it has to be picked out from the student's
   * others — the task list's "which application" dropdown, and the label on a
   * task already assigned.
   *
   * The university name alone was not enough even before rounds existed: a
   * student applying to three programmes at one university got three options
   * all reading "Aalto University", with nothing to choose between them. With
   * two applications for the same programme in different rounds (0234) the
   * programme name is not enough either, so the round goes on the end.
   */
  const describeApplication = (a: NonNullable<typeof applications>[number]) => {
    const uni = (one(a.university as never) as { name?: string } | null)?.name ?? "University";
    const programName = (one(a.program as never) as { name?: string } | null)?.name ?? null;
    const roundLabel = (one(a.round as never) as { label?: string } | null)?.label ?? null;
    const base = programName ? `${uni} · ${programName}` : uni;
    return roundLabel ? `${base} (${roundLabel})` : base;
  };

  const appLabel = new Map((applications ?? []).map((a) => [a.id, describeApplication(a)]));

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

  // Registration edit form's primary/backup resolution. Normal case: exactly
  // one non-backup row (the primary) plus 0-3 backup rows, matching what
  // PrimaryBackupDestinationSelect writes. Legacy case: a student registered
  // before this feature may have 2+ non-backup rows from the old unlimited
  // multi-select — pick the earliest-added as primary and demote the rest
  // (up to the 3-backup cap) to backup slots for display only; nothing is
  // written to the DB until the form is actually saved.
  const nonBackupDestinations = (selectedDestinations ?? [])
    .filter((d) => !d.is_backup)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const explicitBackupIds = (selectedDestinations ?? []).filter((d) => d.is_backup).map((d) => d.destination_id);
  const primaryDestinationId = nonBackupDestinations[0]?.destination_id ?? null;
  const legacyExtraDestinationIds = nonBackupDestinations.slice(1).map((d) => d.destination_id);
  const resolvedBackupDestinationIds = [...explicitBackupIds, ...legacyExtraDestinationIds].slice(0, 3);

  // The countries an invoice for this student has to charge an administrative
  // fee for: the primary, then each backup. A backup's agreement is
  // administrative-fee only (see generateAgreement), so this is the only fee
  // it contributes — and the invoice needs one field per country to collect
  // them. The primary's default honours the signed agreement's override; a
  // backup has nothing to override it with, so its country's standard fee
  // stands.
  const invoiceCountries = [
    ...(primaryDestinationId ? [{ id: primaryDestinationId, isBackup: false }] : []),
    ...resolvedBackupDestinationIds.map((id) => ({ id, isBackup: true })),
  ]
    .map(({ id: destinationId, isBackup }) => {
      const row = (selectedDestinations ?? []).find((d) => d.destination_id === destinationId);
      const dest = row ? (one(row.destination as never) as { display_name?: string; country?: string; admin_charge?: number | string | null } | null) : null;
      return {
        destinationId,
        label: (dest?.display_name || dest?.country || "").trim(),
        isBackup,
        defaultAdminCharge: isBackup
          ? Number(dest?.admin_charge ?? 0)
          : Number(defaultInvoiceAdminCharge ?? dest?.admin_charge ?? 0),
      };
    })
    .filter((c) => c.label);

  // The agreement can only be for a country this student registered for —
  // their primary and their backups. The dropdown used to list every
  // template in the system, so an agreement for the wrong country was one
  // mis-click away.
  const registeredForTemplates = (selectedDestinations ?? [])
    .map((row) => {
      const dest = one(row.destination as never) as { display_name?: string } | null;
      return {
        id: row.destination_id as string,
        display_name: dest?.display_name ?? "",
        isBackup: resolvedBackupDestinationIds.includes(row.destination_id as string),
      };
    })
    .filter((r) => r.id);
  // A visa-only student (0279) is offered visa-service templates only, and a
  // full-service student never sees one — so "no template for X" names the
  // countries missing a template of the kind this student needs.
  const studentService = serviceOf(leadRegistration?.service_type);
  const templateChoices = agreementTemplateChoices(templatesForService(templates ?? [], studentService), registeredForTemplates);
  const visaFees: Record<string, number | null> = Object.fromEntries(
    (selectedDestinations ?? []).map((row) => {
      const dest = one(row.destination as never) as { visa_service_fee?: number | null } | null;
      return [row.destination_id as string, dest?.visa_service_fee ?? null];
    })
  );
  // A visa-only invoice opens on the visa service fee the signed agreement
  // settled — its own figure, else the country's from Setup. Before any
  // discount, which the form carries on its own line and takes off once.
  const signedAgreementDestinationId = signedAgreementTemplate?.destination_id ?? null;
  const defaultVisaInvoiceFee = signedAgreement
    ? (signedAgreement.visa_service_fee_override ?? (signedAgreementDestinationId ? visaFees[signedAgreementDestinationId] : null) ?? null)
    : null;

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
  const docHistory = await loadDocumentHistory(supabase, (rawDocs ?? []).map((d) => d.id));

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
    { data: allAdminCharges },
    restartContext,
  ] = await Promise.all([
    // The template and the signed scan are ordinary links, so they batch. The
    // generated PDF carries a per-agreement download filename, which the batch
    // call cannot vary, so those keep a call each — there are only ever one or
    // two agreements on a student.
    (async () => {
      const plain = await documentUrls(supabase, [
        ...(agreements ?? []).map((a) => (one(a.template as never) as { file_path?: string } | null)?.file_path),
        ...(agreements ?? []).map((a) => a.signed_file_path),
      ]);
      return Promise.all(
        (agreements ?? []).map(async (a) => {
          const links: { templateUrl?: string; signedUrl?: string; pdfUrl?: string } = {};
          const tmpl = one(a.template as never) as { file_path?: string; destination?: unknown } | null;
          if (tmpl?.file_path) links.templateUrl = plain.get(tmpl.file_path);
          if (a.signed_file_path) links.signedUrl = plain.get(a.signed_file_path);
          if (a.pdf_path) {
            const destination = tmpl?.destination ? (one(tmpl.destination as never) as { country?: string; track?: string } | null) : null;
            const { data } = await supabase.storage
              .from("documents")
              .createSignedUrl(a.pdf_path, 3600, { download: generatedAgreementFilename(student?.full_name, destination) });
            if (data?.signedUrl) links.pdfUrl = data.signedUrl;
          }
          return [a.id, links] as const;
        })
      );
    })(),
    invoiceIds.length
      ? supabase.from("invoice_line_items").select("id, invoice_id, name, description, amount").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] }),
    documentUrls(
      supabase,
      (invoices ?? []).map((i) => i.pdf_path)
    ).then((urls) => (invoices ?? []).map((i) => [i.id, i.pdf_path ? urls.get(i.pdf_path) : undefined] as const)),
    invoiceIds.length ? supabase.from("invoice_installments").select("*").in("invoice_id", invoiceIds) : Promise.resolve({ data: [] }),
    // Every document's URL in one request rather than one per file. A student
    // with thirty documents was thirty round trips to Storage before this page
    // could render, and they were the single biggest thing on it.
    documentUrls(
      supabase,
      (rawDocs ?? []).map((d) => d.file_path)
    ).then((urls) =>
      (rawDocs ?? []).map((d) => {
        const templateName = one(d.template as never) as { name?: string } | null;
        // Which application this requirement belongs to, now named down to the
        // programme and round — "— Aalto University" was the same string for
        // every application a student had there.
        const belongsTo = d.application_id ? appLabel.get(d.application_id) : null;
        const name = `${d.custom_name ?? templateName?.name ?? d.category ?? "Document"}${belongsTo ? ` — ${belongsTo}` : " — Student-level"}`;
        const past = docHistory.get(d.id) ?? [];
        if (!d.file_path) return { ...d, name, history: past };
        return { ...d, name, history: past, fileUrl: urls.get(d.file_path) ?? null };
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
          // Official contact only: a colleague's personal mobile is theirs and
          // the Super Admin's to read (0285).
          .select("full_name, designation, mobile_official, email_official, photo_path")
          .eq("id", leadRegistration.assigned_counselor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Not a per-student assignment — every active Processing-role staff
    // member is shown here, since ownership of processing work transfers to
    // the whole Processing Team (not one named person) once a lead
    // registers, per the doc's handoff rule.
    supabase
      .from("staff")
      .select("id, full_name, designation, mobile_official, email_official, photo_path")
      .contains("roles", ["processing"])
      .eq("status", "active")
      .order("full_name"),
    // Which country each slice of an invoice's administrative charge is for.
    invoiceIds.length
      ? supabase
          .from("invoice_admin_charges")
          .select("id, invoice_id, country_label, amount, is_backup, destination_id")
          .in("invoice_id", invoiceIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    // Takes nothing but the student id, so it belongs in this wave rather than
    // in one of its own after the trackers. It was the last of five queries
    // that ran strictly one after another at the foot of this page.
    loadRestartContext(id),
  ]);

  // Header summary for the Invoice section, which also opens collapsed. Counted
  // across every invoice on the student rather than summed, because the amounts
  // can be in different currencies and a combined figure would be meaningless
  // — how many instalments are settled is the thing worth seeing at a glance.
  const invoiceSummary = (() => {
    const schedule = installments ?? [];
    if ((invoices ?? []).length === 0) return { text: "None raised", tone: "neutral" as const };
    if (schedule.length === 0) return { text: "No schedule yet", tone: "warning" as const };
    const paid = schedule.filter((i) => i.status === "paid").length;
    if (paid === schedule.length) return { text: "Paid in full", tone: "success" as const };
    return { text: `${paid}/${schedule.length} instalments paid`, tone: "warning" as const };
  })();

  // Show just the assigned officer when there is one; otherwise the whole
  // processing team, who collectively cover an unassigned student.
  const shownProcessingOfficers = leadRegistration?.processing_officer_id
    ? (processingOfficers ?? []).filter((o) => o.id === leadRegistration.processing_officer_id)
    : (processingOfficers ?? []);

  // Every face on the page in one request, and through avatarUrls so the URL
  // is the same one the browser cached last time. These are the same handful
  // of staff photos on page after page; minting a fresh signature for each of
  // them on every load meant re-downloading all of them, every time.
  const photoUrls = await avatarUrlMap([
    assignedCounselorStaff?.photo_path,
    ...(processingOfficers ?? []).map((o) => o.photo_path),
  ]);
  const assignedCounselorPhotoUrl = assignedCounselorStaff?.photo_path
    ? photoUrls.get(assignedCounselorStaff.photo_path) ?? null
    : null;
  const processingOfficerPhotoUrls = new Map<string, string>();
  for (const o of processingOfficers ?? []) {
    const url = o.photo_path ? photoUrls.get(o.photo_path) : undefined;
    if (url) processingOfficerPhotoUrls.set(o.id, url);
  }

  const agreementLinks = new Map(agreementLinkEntries);
  const invoicePdfUrls = new Map(invoicePdfEntries.filter((e): e is readonly [string, string] => Boolean(e[1])));

  // The consent video a student recorded when e-signing, for staff to watch
  // before verifying (see VerifySignedAgreement).

  // The consent video is the evidence that an e-signature is attributable, so
  // it has to stay watchable after verification — it was previously hidden the
  // moment the agreement was marked signed, exactly when it matters most.
  // It is footage of a person, so viewing is limited to Super Admin and the
  // two people handling this student's case. No fallback to the whole
  // processing team when nobody is assigned.
  const canViewConsentVideo =
    isSuperAdminRole ||
    (Boolean(viewerStaff?.id) &&
      (viewerStaff!.id === leadRegistration?.assigned_counselor_id ||
        viewerStaff!.id === leadRegistration?.processing_officer_id));

  // Every version's video, not just the latest, so a superseded agreement can
  // still be evidenced if its signature is ever questioned.
  const consentVideoUrls = new Map<string, string>();
  if (canViewConsentVideo) {
    await Promise.all(
      (agreements ?? [])
        .filter((a) => a.video_recording_path)
        .map(async (a) => {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.video_recording_path!, 3600);
          if (data?.signedUrl) consentVideoUrls.set(a.id, data.signedUrl);
        })
    );
  }

  const taskRows: DashboardTaskRow[] = (rawTasks ?? []).map((t) => ({
    id: t.id,
    description: t.description,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority,
    applicationLabel: appLabel.get(t.application_id) ?? "Application",
  }));

  const applicationOptions = (applications ?? []).map((a) => ({
    id: a.id,
    label: describeApplication(a),
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

  // What a closed Documentation tracker header has to be able to say. A
  // checkbox field reads "true"/"false", and "false" is an answer somebody
  // gave rather than a blank, so anything non-empty counts as recorded.
  function summariseTracker(
    sections: { entry: { displayName: string }; values: Record<string, string>; fields: { key: string }[] }[]
  ) {
    let filled = 0;
    let total = 0;
    const perCountry: string[] = [];
    for (const section of sections) {
      const countryFilled = section.fields.filter((f) => trackerValueFilled(section.values[f.key])).length;
      filled += countryFilled;
      total += section.fields.length;
      perCountry.push(`${section.entry.displayName} ${countryFilled}/${section.fields.length}`);
    }
    const tone: "success" | "warning" | "neutral" =
      total === 0 ? "neutral" : filled === total ? "success" : "warning";
    return {
      filled,
      total,
      tone,
      // Only worth spelling out when there is more than one country; with one
      // it would just repeat the badge.
      subtitle: sections.length > 1 ? perCountry.join(" · ") : undefined,
    };
  }

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

        // One entry per university, not per application: a student with two
        // programmes at the same university produced the same university twice
        // in this picker. Keyed by name, and when an application id for that
        // university is already stored in this tracker we keep that exact id so
        // an existing saved answer does not silently lose its selection.
        const savedIds = new Set(Object.values(values));
        const byUniversity = new Map<string, { value: string; label: string }>();
        for (const a of appsByCountry.get(entry.countryCode) ?? []) {
          const existing = byUniversity.get(a.name);
          if (!existing) byUniversity.set(a.name, { value: a.id, label: a.name });
          else if (savedIds.has(a.id)) byUniversity.set(a.name, { value: a.id, label: a.name });
        }
        const universityOptions = Array.from(byUniversity.values());
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

  const trackerProgress = summariseTracker(trackerSections);

  // Whether this student can be started again, and on what evidence, comes
  // from the level-2 wave above — read there rather than in the panel so the
  // visa outcome comes from the same place the Visa tab reads it from.
  const canRestart = perms["students.restart_process"] === true;
  // The message to reach them with, when they have stopped. Only looked up
  // for a student the panel will actually show.
  const reengagement = restartContext.eligibility ? await loadReengagementContext(id) : null;

  // Primary country first, then backups, matching the Applications tab. The
  // student's lead_destinations rows are what say which is which; a country
  // with a tracker but no destination row (a destination removed after the
  // application was made) goes last rather than disappearing.
  const backupByCode = new Map<string, boolean>();
  const destinationOrder = new Map<string, number>();
  const finalizeLabelByCode = new Map<string, string>();
  (selectedDestinations ?? []).forEach((row) => {
    const dest = one(row.destination as never) as { country_code?: string; finalize_action_label?: string } | null;
    if (!dest?.country_code) return;
    backupByCode.set(dest.country_code, Boolean(row.is_backup));
    destinationOrder.set(dest.country_code, row.is_backup ? 1 : 0);
    if (dest.finalize_action_label) finalizeLabelByCode.set(dest.country_code, dest.finalize_action_label);
  });

  // What the rest of the record already says about the fields the tracker
  // leaves empty. Offered beside each one; nothing is written by this.
  const prefillSource = trackerSections.length > 0
    ? await loadTrackerPrefillSource(id, rawDocs ?? [])
    : null;

  const trackerTabs = trackerSections
    .map((section) => ({
      section,
      isBackup: backupByCode.get(section.entry.countryCode) ?? false,
      rank: destinationOrder.get(section.entry.countryCode) ?? 2,
    }))
    .sort((a, b) => a.rank - b.rank || a.section.entry.displayName.localeCompare(b.section.entry.displayName));

  return (
    <div>
      {/* Above everything, because a refused or ghosted student is not a
          detail — it is the thing the counsellor opened this page about. The
          panel renders nothing at all for a student who is neither. */}
      <RestartProcessPanel studentId={id} context={restartContext} canEdit={canRestart} reengagement={reengagement} />

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

      <CollapsibleCard
        id="registration-portal-access"
        title="Registration & Portal Access"
        badge={
          <Badge tone={student?.portal_active ? "success" : "neutral"}>
            {student?.portal_active ? "Portal active" : "Portal off"}
          </Badge>
        }
      >
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Registration</p>
          <RegistrationEditForm
            serviceType={serviceOf(leadRegistration?.service_type)}
            canSetService={canSetService(viewerStaff)}
            destinationWork={destinationWork}
            studentId={id}
            revalidateTo={`/students/${id}`}
            destinations={selectableDestinations(allDestinations ?? [], [
              primaryDestinationId,
              ...resolvedBackupDestinationIds,
            ])}
            defaultPrimaryId={primaryDestinationId}
            defaultBackupIds={resolvedBackupDestinationIds}
            counselors={counselors ?? []}
            assignedCounselorId={leadRegistration?.assigned_counselor_id ?? null}
            processingOfficers={(processingOfficers ?? []).map((o) => ({ id: o.id, full_name: o.full_name }))}
            processingOfficerId={leadRegistration?.processing_officer_id ?? null}
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
      </CollapsibleCard>

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

      {trackerSections.length > 0 && (
        <CollapsibleCard
          id="documentation-tracker"
          title="Documentation tracker"
          className="mt-6"
          badge={
            <Badge tone={trackerProgress.tone}>
              {trackerProgress.filled} / {trackerProgress.total} recorded
            </Badge>
          }
        >
          {/* One tab per country. There is one tracker per country and always
              was — this is about being able to look at one of them, rather
              than three sets of twenty-odd fields stacked in one card. */}
          <TrackerCountryTabs
            tabs={trackerTabs.map(({ section, isBackup }) => ({
              code: section.entry.countryCode,
              label: section.entry.displayName,
              isBackup,
              filled: section.fields.filter((f) => (section.values[f.key] ?? "").trim() !== "").length,
              total: section.fields.length,
              content: (
                <CountryTrackerForm
                  applicationId={section.entry.id}
                  fields={section.fields}
                  values={section.values}
                  revalidateTo={`/students/${id}`}
                  universityOptions={section.universityOptions}
                  regionByUniversityValue={section.regionByUniversityValue}
                  studentId={id}
                  finalizeActionLabel={finalizeLabelByCode.get(section.entry.countryCode) ?? "Finalize for visa"}
                  suggestions={
                    prefillSource
                      ? trackerSuggestions(
                          section.fields.map((f) => ({ key: f.key, type: f.type, options: f.options })),
                          section.values,
                          prefillSource
                        )
                      : {}
                  }
                />
              ),
            }))}
          />
        </CollapsibleCard>
      )}

      <CollapsibleCard
        id="agreement"
        title="Agreement"
        className="mt-6"
        badge={<Badge tone={agreementSummary.tone}>{agreementSummary.text}</Badge>}
      >
        {canModifyAgreement && (
          <GenerateAgreementForm
            studentId={id}
            templates={templateChoices.available}
            discountAmount={leadRegistration?.discount_amount ?? null}
            backupDestinationIds={explicitBackupIds}
            missingTemplateFor={templateChoices.missingTemplateFor}
            hasCountry={templateChoices.hasCountry}
            service={studentService}
            visaFees={visaFees}
          />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => {
              const links = agreementLinks.get(a.id);
              return (
                <div key={a.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      <span className="font-medium">{agreementCountry(a) ?? "No country"}</span> · v{a.version} ·{" "}
                      {a.signing_method === "e_signature" ? "e-signature" : (a.signing_method ?? "—")} ·{" "}
                      {new Date(a.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" })}
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
                      {consentVideoUrls.has(a.id) && (
                        <ConsentVideoLink url={consentVideoUrls.get(a.id)!} version={a.version} />
                      )}
                      <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                      <AgreementActionsMenu
                        agreement={a}
                        studentId={id}
                        templates={templateChoices.available}
                        backupDestinationIds={explicitBackupIds}
                        service={studentService}
                        visaFees={visaFees}
                        links={links}
                        canEdit={isSuperAdmin && a.status !== "signed"}
                        canDelete={isSuperAdmin}
                      />
                    </div>
                  </div>
                  {/* When each artefact arrived. The row's own created_at is
                      the day the agreement was generated and updated_at moves
                      again on review, so neither could answer when the student
                      actually sent the signed copy in. */}
                  <div className="flex flex-col gap-0.5 text-xs text-muted">
                    {uploadedLine({
                      at: a.signed_file_uploaded_at,
                      byRole: a.signing_method === "e_signature" ? "student" : "staff",
                      audience: "staff",
                    }) && (
                      <span>
                        Signed agreement ·{" "}
                        {uploadedLine({
                          at: a.signed_file_uploaded_at,
                          byRole: a.signing_method === "e_signature" ? "student" : "staff",
                          audience: "staff",
                        })}
                      </span>
                    )}
                    {uploadedLine({ at: a.video_uploaded_at, byRole: "student", audience: "staff" }) && (
                      <span>
                        Consent video · {uploadedLine({ at: a.video_uploaded_at, byRole: "student", audience: "staff" })}
                      </span>
                    )}
                  </div>

                  {/* Belongs to this agreement, not to whichever was generated
                      last. A student with an unsigned Italy agreement and an
                      unsigned Germany one had one upload box between them. */}
                  {canModifyAgreement && a.status !== "signed" && (
                    <div className="mt-2 rounded-md border border-border bg-bg p-3">
                      <p className="mb-2 text-xs font-medium text-ink">
                        {a.signing_method === "e_signature" ? "Review" : "Upload the signed copy"} —{" "}
                        <span className="font-semibold">{agreementLabel(a)}</span>
                      </p>
                      {a.signing_method === "e_signature" ? (
                        <VerifySignedAgreement
                          agreementId={a.id}
                          studentId={id}
                          submitted={Boolean(a.signed_file_path)}
                          videoUrl={consentVideoUrls.get(a.id) ?? null}
                          documentStatus={a.document_status}
                          videoStatus={a.video_status}
                          documentNote={a.document_review_note}
                          videoNote={a.video_review_note}
                        />
                      ) : (
                        <UploadSignedAgreementForm agreementId={a.id} studentId={id} />
                      )}
                    </div>
                  )}

                  {/* Approving used to be a one-way door: once signed, the
                      review panel disappears and there was no way back short
                      of deleting the agreement and regenerating it, which
                      discards the student's signed copy and their recording. */}
                  {canModifyAgreement && a.signing_method === "e_signature" && (
                    <UndoAgreementApproval
                      agreementId={a.id}
                      studentId={id}
                      documentStatus={a.document_status ?? "pending"}
                      videoStatus={a.video_status ?? "pending"}
                      hasInvoice={(invoices ?? []).some((inv) => inv.agreement_id === a.id)}
                    />
                  )}
                  {a.approval_undone_at && (
                    <UndoneApprovalNote
                      at={a.approval_undone_at}
                      by={(one(a.undone_by as never) as { full_name?: string } | null)?.full_name ?? null}
                      note={a.approval_undo_note}
                    />
                  )}

                  {/* A signed paper agreement with the wrong scan attached:
                      Super Admin can swap the file without deleting it. */}
                  {isSuperAdmin && a.status === "signed" && a.signing_method === "paper" && (
                    <div className="mt-2 rounded-md border border-border bg-bg p-3">
                      <p className="mb-2 text-xs font-medium text-ink">
                        Replace the scan — <span className="font-semibold">{agreementLabel(a)}</span>
                      </p>
                      <UploadSignedAgreementForm agreementId={a.id} studentId={id} replace />
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}
      </CollapsibleCard>

      {/* Shown whenever there is a signed agreement OR any invoice on file.
          Gating the whole card on the agreement meant an existing invoice
          disappeared from this page if the agreement was later reverted or
          deleted — the money was still owed, and the only way to reach it was
          the Invoice Generator. Generating a NEW one still needs the signed
          agreement, since that is where the fee, discount and currency come
          from. */}
      {(signedAgreement || (invoices ?? []).length > 0) && (
        <CollapsibleCard
          id="invoice"
          title="Invoice"
          className="mt-6"
          badge={<Badge tone={invoiceSummary.tone}>{invoiceSummary.text}</Badge>}
        >
          {canManageInvoice &&
            (signedAgreement ? (
              <GenerateInvoiceForm
                studentId={id}
                agreementId={signedAgreement.id}
                defaultInstallmentPlan={defaultInstallmentPlan}
                defaultAdminCharge={studentService === "visa_only" ? null : defaultInvoiceAdminCharge}
                defaultConsultancyFee={studentService === "visa_only" ? defaultVisaInvoiceFee : defaultInvoiceConsultancyFee}
                defaultCurrency={defaultInvoiceCurrency}
                service={studentService}
                // The agreement is where the number of payments and the
                // discount were actually agreed with the student, so the
                // invoice opens on them rather than making staff retype
                // what they already signed.
                defaultInstallmentCount={signedAgreement?.installment_count ?? null}
                defaultDiscount={signedAgreement?.discount_amount ?? leadRegistration?.discount_amount ?? null}
                defaultDiscountReason={leadRegistration?.discount_reason ?? null}
                countries={invoiceCountries}
              />
            ) : (
              <p className="rounded-md bg-warning-bg p-3 text-sm text-warning">
                No signed agreement on file, so a new invoice can&apos;t be generated here — the fee, discount and currency
                are read from it. The invoices below stay editable, and their payments can still be recorded.
              </p>
            ))}
          <div className="mt-4 flex flex-col gap-3">
            {(invoices ?? []).map((inv) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                installments={(installments ?? []).filter((i) => i.invoice_id === inv.id)}
                lineItems={(allLineItems ?? []).filter((li) => li.invoice_id === inv.id)}
                adminCharges={(allAdminCharges ?? []).filter((c) => c.invoice_id === inv.id)}
                feeProducts={feeProducts ?? []}
                studentId={id}
                pdfUrl={invoicePdfUrls.get(inv.id)}
                revalidateTo={`/students/${id}`}
                canManage={canManageInvoice}
                isSuperAdmin={canDeleteInvoice}
              />
            ))}
          </div>
        </CollapsibleCard>
      )}


      <CollapsibleCard
        id="portal-credentials"
        title="Portal credentials"
        className="mt-6"
        badge={
          <Badge tone={existingCredentialTypes.length > 0 ? "success" : "neutral"}>
            {existingCredentialTypes.length > 0
              ? `${existingCredentialTypes.length} on file`
              : "None saved"}
          </Badge>
        }
      >
        <PortalCredentialsSection studentId={id} existingTypes={existingCredentialTypes} />
      </CollapsibleCard>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Assigned Counselor & Processing Officer</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Assigned Counselor</p>
            {assignedCounselorStaff ? (
              <div className="flex items-start gap-3 text-sm text-ink">
                {assignedCounselorPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assignedCounselorPhotoUrl} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
                    —
                  </div>
                )}
                <div>
                  <p className="font-medium">{assignedCounselorStaff.full_name}</p>
                  {assignedCounselorStaff.designation && <p className="text-muted">{assignedCounselorStaff.designation}</p>}
                  {assignedCounselorStaff.mobile_official && (
                    <p className="text-muted">{assignedCounselorStaff.mobile_official}</p>
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
            <p className="mb-2 text-xs text-muted">
              {leadRegistration?.processing_officer_id
                ? "Assigned to this student — deadline reminders go to them."
                : "Nobody assigned yet, so the whole processing team below covers this student. Assign one from the Registration card above."}
            </p>
            {shownProcessingOfficers.length > 0 ? (
              <div className="flex flex-col gap-3">
                {shownProcessingOfficers.map((officer) => (
                  <div key={officer.id} className="flex items-start gap-3 text-sm text-ink">
                    {processingOfficerPhotoUrls.has(officer.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={processingOfficerPhotoUrls.get(officer.id)} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
                        —
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{officer.full_name}</p>
                      {officer.designation && <p className="text-muted">{officer.designation}</p>}
                      {officer.mobile_official && (
                        <p className="text-muted">{officer.mobile_official}</p>
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
