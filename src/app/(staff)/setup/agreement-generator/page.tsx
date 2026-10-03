import Link from "next/link";
import { agreementCountry } from "@/lib/agreementLabel";
import { agreementTemplateChoices } from "@/lib/agreementTemplateChoices";
import { serviceOf, templatesForService } from "@/lib/serviceType";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StudentPicker } from "./StudentPicker";
import {
  GenerateAgreementForm,
  UploadSignedAgreementForm,
  DeleteAgreementButton,
} from "@/app/(staff)/students/[id]/GenerateAgreementForm";
import { GenerateAgreementPdfButton } from "@/app/(staff)/students/[id]/GenerateAgreementPdfButton";
import { SectionTabs } from "@/components/SectionTabs";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { StaffAgreementGenerator } from "./StaffAgreementGenerator";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { hasRole } from "@/lib/auth/roles";
import { AgreementDateEditor } from "@/components/AgreementDateEditor";
import { agreementToday } from "@/lib/agreementDate";
import { setAgreementDate } from "@/lib/actions/agreements";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AgreementGeneratorPage(props: {
  searchParams: Promise<{ student?: string; tab?: string; staff?: string }>;
}) {
  const { student: studentId, tab, staff: staffId } = await props.searchParams;

  // Staff agreements: a tab shown only to someone holding
  // staff_agreements.manage. Asked for by anyone else, the Students tab shows.
  const canStaffAgreements = (await getEffectivePermissions())["staff_agreements.manage"] === true;
  const active = tab === "staff" && canStaffAgreements ? "staff" : "students";
  const tabs = [
    { key: "students", label: "Students", href: "/setup/agreement-generator" },
    ...(canStaffAgreements ? [{ key: "staff", label: "Staff", href: "/setup/agreement-generator?tab=staff" }] : []),
  ];
  if (active === "staff") {
    return (
      <div className="w-full">
        <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Generator</h2>
        <SectionTabs tabs={tabs} active={active} />
        <StaffAgreementGenerator selectedId={staffId} />
      </div>
    );
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, email, country_of_interest, discount_amount, profile:student_profiles(passport_number)")
    .order("full_name");

  const pickerStudents = (students ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    country_of_interest: s.country_of_interest,
    discount_amount: s.discount_amount,
    passport_number: (one(s.profile as never) as { passport_number?: string } | null)?.passport_number ?? null,
  }));

  const countries = Array.from(
    new Set(
      pickerStudents
        .flatMap((s) => (s.country_of_interest ?? "").split(",").map((c: string) => c.trim()))
        .filter(Boolean)
    )
  ).sort();

  const selected = pickerStudents.find((s) => s.id === studentId);

  let panel: React.ReactNode = null;
  if (selected) {
    const user = await getCurrentUser();
    const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
    // Every role this person holds, not only the primary one.
    const isSuperAdmin = hasRole(staffRow, "super_admin");
    const canModifyAgreement = hasRole(staffRow, "super_admin", "processing");

    const [{ data: allTemplates }, { data: registeredRows }, { data: leadService }] = await Promise.all([
      supabase.from("agreement_templates").select("id, name, signatory_name, service_type, destination:destinations(id, display_name)"),
      supabase.from("lead_destinations").select("destination_id, is_backup, destination:destinations(display_name)").eq("lead_id", selected.id),
      supabase.from("leads").select("service_type").eq("id", selected.id).maybeSingle(),
    ]);
    const backupDestinationIds = (registeredRows ?? []).filter((d) => d.is_backup).map((d) => d.destination_id as string);
    // The same narrowing as the student's own page: their countries, their
    // service — and a general visa template with a country chosen (0298).
    const registered = (registeredRows ?? []).map((r) => ({
      id: r.destination_id as string,
      display_name: (one(r.destination as never) as { display_name?: string } | null)?.display_name ?? "",
      isBackup: Boolean(r.is_backup),
    }));
    const service = serviceOf(leadService?.service_type);
    const templateChoices = agreementTemplateChoices(templatesForService(allTemplates ?? [], service), registered);
    const templates = templateChoices.available;
    const orderedCountries = [...registered.filter((r) => !r.isBackup), ...registered.filter((r) => r.isBackup)].map(({ id: countryId, display_name }) => ({
      id: countryId,
      display_name,
    }));

    const { data: agreements } = await supabase
      .from("agreements")
      .select(
        "id, status, version, signing_method, signed_file_path, pdf_path, email_verified, discount_amount, created_at, agreement_date, destination:destinations(country), template:agreement_templates(file_path, destination:destinations(country))"
      )
      .eq("student_id", selected.id)
      .order("created_at", { ascending: false });

    const agreementLinks = new Map<string, { templateUrl?: string; signedUrl?: string; pdfUrl?: string }>();
    await Promise.all(
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
        agreementLinks.set(a.id, links);
      })
    );

    const latestAgreement = agreements?.[0];

    panel = (
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Agreement — {selected.full_name}</h3>
          <Link prefetch={false} href={`/students/${selected.id}`} className="text-xs text-primary hover:underline">
            View full student record →
          </Link>
        </div>
        {canModifyAgreement && (
          <GenerateAgreementForm
            studentId={selected.id}
            templates={templates}
            discountAmount={selected.discount_amount ?? null}
            backupDestinationIds={backupDestinationIds}
            missingTemplateFor={templateChoices.missingTemplateFor}
            hasCountry={templateChoices.hasCountry}
            service={service}
            countries={orderedCountries}
            today={agreementToday()}
          />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => {
              const links = agreementLinks.get(a.id);
              return (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">
                    {agreementCountry(a) ?? "No country"} · v{a.version} ·{" "}
                    {a.status === "signed" ? "signed" : "pending signature"} ·{" "}
                    {a.signing_method === "e_signature" ? "e-signature" : (a.signing_method ?? "—")} ·{" "}
                    <AgreementDateEditor date={a.agreement_date} canEdit={canModifyAgreement} save={setAgreementDate.bind(null, a.id, selected.id)} />
                    {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
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
                      <GenerateAgreementPdfButton
                        agreementId={a.id}
                        studentId={selected.id}
                        revalidateTo={`/setup/agreement-generator?student=${selected.id}`}
                        hasPdf={Boolean(links?.pdfUrl)}
                      />
                    )}
                    <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                    {isSuperAdmin && <DeleteAgreementButton agreementId={a.id} studentId={selected.id} />}
                  </div>
                </div>
              );
            })}
            {canModifyAgreement && latestAgreement && latestAgreement.status !== "signed" && (
              <UploadSignedAgreementForm agreementId={latestAgreement.id} studentId={selected.id} />
            )}
            {/* Correcting a wrong scan on an already-signed paper agreement —
                see UploadSignedAgreementForm. */}
            {isSuperAdmin && latestAgreement?.status === "signed" && latestAgreement.signing_method === "paper" && (
              <UploadSignedAgreementForm agreementId={latestAgreement.id} studentId={selected.id} replace />
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Agreement Generator</h2>
      <SectionTabs tabs={tabs} active={active} />
      <p className="mb-4 text-sm text-muted">
        Find a registered student to generate, view, or manage their agreement — without navigating to their full record.
      </p>
      <Card>
        <StudentPicker students={pickerStudents} countries={countries} />
      </Card>
      {panel}
    </div>
  );
}
