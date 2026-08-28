import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { StudentProfileForm } from "./StudentProfileForm";
import { GenerateAgreementForm, UploadSignedAgreementForm, DeleteAgreementButton } from "./GenerateAgreementForm";
import { GenerateAgreementPdfButton } from "./GenerateAgreementPdfButton";
import { GenerateInvoiceForm, InvoiceCard } from "./InvoicePanel";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { PortalCredentialsSection } from "./PortalCredentialsSection";
import { DashboardTaskList, type DashboardTaskRow } from "./DashboardTaskList";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { LeadEditForm } from "@/components/LeadEditForm";
import { RegistrationEditForm } from "./RegistrationEditForm";
import { getCachedDestinations, getCachedCounselors, getCachedAgreementTemplates, getCachedFeeProducts } from "@/lib/cachedQueries";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDashboardPage(props: PageProps<"/students/[id]">) {
  const { id } = await props.params;
  const { supabase, staff: staffRow } = await getStaffSession();
  const role = staffRow?.role;
  const isSuperAdmin = role === "super_admin";
  const canModifyAgreement = role === "super_admin" || role === "processing";
  const canManageInvoice = role === "super_admin" || role === "finance" || role === "processing";

  await ensureStudentDocumentRequirements(id);

  // ---- Level 1: every query below is independent of every other — fetch all
  // of them concurrently instead of one round trip at a time. ----
  const [
    [
      { data: student },
      { data: profile },
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
        .select(
          "auth_user_id, full_name, contact_number, email, platform_source, current_qualification, level_applying_for, course_of_interest, date_of_birth, address, home_phone"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle(),
      supabase.from("leads").select("assigned_counselor_id, discount_amount, discount_reason").eq("id", id).maybeSingle(),
      supabase.from("lead_destinations").select("destination_id").eq("lead_id", id),
      supabase
        .from("agreements")
        .select(
          "id, status, signing_method, signed_file_path, pdf_path, email_verified, discount_amount, created_at, template:agreement_templates(file_path, destination_id)"
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
           university:universities(name, destination:destinations(country_code, display_name)),
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
  const defaultInstallmentPlan = signedAgreementTemplate?.destination_id
    ? (allDestinations.find((d) => d.id === signedAgreementTemplate.destination_id)?.installment_plan ?? null)
    : null;
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
  ] = await Promise.all([
    Promise.all(
      (agreements ?? []).map(async (a) => {
        const links: { templateUrl?: string; signedUrl?: string; pdfUrl?: string } = {};
        const tmpl = one(a.template as never) as { file_path?: string } | null;
        if (tmpl?.file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(tmpl.file_path, 3600);
          if (data?.signedUrl) links.templateUrl = data.signedUrl;
        }
        if (a.signed_file_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.signed_file_path, 3600);
          if (data?.signedUrl) links.signedUrl = data.signedUrl;
        }
        if (a.pdf_path) {
          const { data } = await supabase.storage.from("documents").createSignedUrl(a.pdf_path, 3600);
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
  ]);

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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Profile</h3>
            {student && <LeadEditForm lead={{ id, ...student }} revalidateTo={`/students/${id}`} showRegistrationFields />}
          </div>
          <StudentProfileForm studentId={id} profile={profile} address={student?.address} />
          <div className="mt-4 border-t border-border pt-3">
            <RegistrationEditForm
              studentId={id}
              revalidateTo={`/students/${id}`}
              destinations={allDestinations ?? []}
              selectedDestinationIds={(selectedDestinations ?? []).map((d) => d.destination_id)}
              counselors={counselors ?? []}
              assignedCounselorId={leadRegistration?.assigned_counselor_id ?? null}
              discountAmount={leadRegistration?.discount_amount ?? null}
              discountReason={leadRegistration?.discount_reason ?? null}
            />
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Portal access</h3>
          <PortalAccessPanel studentId={id} enabled={Boolean(student?.auth_user_id)} />
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Agreement</h3>
        {(role === "super_admin" || role === "processing") && (
          <GenerateAgreementForm studentId={id} templates={templates ?? []} />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => {
              const links = agreementLinks.get(a.id);
              return (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} ·{" "}
                    {new Date(a.created_at).toLocaleDateString()}
                    {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                  </span>
                  <div className="flex items-center gap-3">
                    {links?.signedUrl ? (
                      <a href={links.signedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        View signed copy
                      </a>
                    ) : (
                      !links?.pdfUrl &&
                      links?.templateUrl && (
                        <a href={links.templateUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                          View template
                        </a>
                      )
                    )}
                    {links?.pdfUrl && (
                      <a href={links.pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        View generated agreement
                      </a>
                    )}
                    {canModifyAgreement && a.status !== "signed" && (
                      <GenerateAgreementPdfButton agreementId={a.id} studentId={id} revalidateTo={`/students/${id}`} hasPdf={Boolean(links?.pdfUrl)} />
                    )}
                    <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                    {isSuperAdmin && <DeleteAgreementButton agreementId={a.id} studentId={id} />}
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
            <GenerateInvoiceForm studentId={id} agreementId={signedAgreement.id} defaultInstallmentPlan={defaultInstallmentPlan} />
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
                isSuperAdmin={isSuperAdmin}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        <DocumentChecklist docs={docsWithUrls} studentId={id} applicationId={null} revalidateTo={`/students/${id}`} />
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Tasks</h3>
        <DashboardTaskList tasks={taskRows} applications={applicationOptions} studentId={id} />
      </Card>

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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Applications</h3>
          <Link href={`/students/${id}/applications`} className="text-sm font-medium text-primary hover:underline">
            View all →
          </Link>
        </div>
        {!applications || applications.length === 0 ? (
          <EmptyState>No applications yet.</EmptyState>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {applications.map((app) => (
              <Link
                key={app.id}
                href={`/students/${id}/applications/${app.id}`}
                className="flex items-center justify-between py-3 text-sm hover:text-primary"
              >
                <span>{(one(app.university as never) as { name?: string } | null)?.name ?? "University"}</span>
                <Badge tone="info">{app.current_stage.replace(/_/g, " ")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
