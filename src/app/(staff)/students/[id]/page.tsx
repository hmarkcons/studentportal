import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MessageThread, type MessageRow } from "@/components/MessageThread";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { COUNTRY_TRACKER_FIELDS } from "@/lib/countryTrackers";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { StudentProfileForm } from "./StudentProfileForm";
import { GenerateAgreementForm, UploadSignedAgreementForm, DeleteAgreementButton } from "./GenerateAgreementForm";
import { GenerateInvoiceForm, InvoiceCard } from "./InvoicePanel";
import { PortalCredentialsSection } from "./PortalCredentialsSection";
import { DashboardTaskList, type DashboardTaskRow } from "./DashboardTaskList";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDashboardPage(props: PageProps<"/students/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const role = staffRow?.role;
  const isSuperAdmin = role === "super_admin";
  const canModifyAgreement = role === "super_admin" || role === "processing";

  const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", id).maybeSingle();

  const { data: profile } = await supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle();

  const { data: templates } = await supabase
    .from("agreement_templates")
    .select("id, signatory_name, destination:destinations(display_name)");

  const { data: agreements } = await supabase
    .from("agreements")
    .select("id, status, signing_method, signed_file_path, email_verified, discount_amount, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false });

  const signedAgreement = agreements?.find((a) => a.status === "signed");
  const latestAgreement = agreements?.[0];

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, admin_charge, consultancy_fee, currency, sent_status, agreement_id")
    .eq("student_id", id);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: installments } = invoiceIds.length
    ? await supabase.from("invoice_installments").select("*").in("invoice_id", invoiceIds)
    : { data: [] };

  const { data: applications } = await supabase
    .from("applications")
    .select(
      `id, current_stage, intake, deadline,
       university:universities(name, destination:destinations(country_code, display_name)),
       program:programs(name)`
    )
    .eq("student_id", id)
    .order("created_at", { ascending: true });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
    .eq("entity_type", "student")
    .eq("entity_id", id)
    .order("sent_at", { ascending: true })
    .returns<MessageRow[]>();

  const { data: messageTemplates } = await supabase.from("message_templates").select("id, purpose, channel, body").order("purpose");

  // ---- Consolidated documents (student-level + every application) ----
  const appIds = (applications ?? []).map((a) => a.id);
  const { data: rawDocs } = await supabase
    .from("student_documents")
    .select("id, category, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
    .eq("student_id", id)
    .returns<(DocRow & { application_id: string | null; template: { name: string } | { name: string }[] | null })[]>();

  const appLabel = new Map((applications ?? []).map((a) => [a.id, one(a.university as never) as { name?: string } | null]));
  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const templateName = one(d.template as never) as { name?: string } | null;
      const uni = d.application_id ? appLabel.get(d.application_id) : null;
      const name = `${templateName?.name ?? d.category ?? "Document"}${uni?.name ? ` — ${uni.name}` : ""}`;
      if (!d.file_path) return { ...d, name };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name, fileUrl: data?.signedUrl ?? null };
    })
  );

  // ---- Aggregated tasks across every application ----
  const { data: rawTasks } = appIds.length
    ? await supabase
        .from("application_tasks")
        .select("id, description, due_date, status, priority, application_id")
        .in("application_id", appIds)
        .order("due_date", { ascending: true })
    : { data: [] };

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

  // ---- Documentation trackers, grouped by country (primary application per country) ----
  const primaryAppByCountry = new Map<string, { id: string; countryCode: string; displayName: string }>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as {
      destination?: { country_code?: string; display_name?: string } | { country_code?: string; display_name?: string }[];
    } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string; display_name?: string } | null) : null;
    const code = dest?.country_code;
    if (!code || !COUNTRY_TRACKER_FIELDS[code]) continue;
    if (!primaryAppByCountry.has(code)) {
      primaryAppByCountry.set(code, { id: a.id, countryCode: code, displayName: dest?.display_name ?? code });
    }
  }

  const trackerSections = await Promise.all(
    Array.from(primaryAppByCountry.values()).map(async (entry) => {
      const { data: extras } = await supabase
        .from("application_country_extra")
        .select("field_key, field_value")
        .eq("application_id", entry.id);
      const values: Record<string, string> = {};
      (extras ?? []).forEach((e) => (values[e.field_key] = e.field_value ?? ""));

      const dynamicOptions: Record<string, { value: string; label: string }[] | string[]> = {};
      const regionByUniversityValue: Record<string, string> = {};

      if (entry.countryCode === "IT") {
        dynamicOptions.preenrollment_university = (applications ?? []).map((a) => ({
          value: a.id,
          label: (one(a.university as never) as { name?: string } | null)?.name ?? "University",
        }));

        const { data: bodies } = await supabase.from("scholarship_bodies").select("region, covers");
        for (const a of applications ?? []) {
          const uniName = (one(a.university as never) as { name?: string } | null)?.name;
          if (!uniName) continue;
          const match = (bodies ?? []).find((b) => (b.covers ?? []).includes(uniName));
          if (match?.region) regionByUniversityValue[a.id] = match.region;
        }

        const { data: docs } = await supabase
          .from("student_documents")
          .select("id, category, template:document_templates(name)")
          .eq("application_id", entry.id)
          .neq("status", "verified");
        dynamicOptions.pending_documents = (docs ?? []).map(
          (d) => ((one(d.template as never) as { name?: string } | null)?.name as string | undefined) ?? d.category ?? "Document"
        );
      }

      return { entry, values, dynamicOptions, regionByUniversityValue };
    })
  );

  const existingCredentialTypes = await listCredentialTypesAction("student", id);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Profile</h3>
          <StudentProfileForm studentId={id} profile={profile} />
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Portal access</h3>
          <PortalAccessPanel studentId={id} enabled={Boolean(student?.auth_user_id)} />
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Pipeline stages</h3>
        {(applications ?? []).length === 0 ? (
          <p className="text-sm text-muted">No applications yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(applications ?? []).map((a) => (
              <Link
                key={a.id}
                href={`/students/${id}/applications/${a.id}`}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
              >
                {(one(a.university as never) as { name?: string } | null)?.name ?? "University"}
                <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Agreement</h3>
        {(role === "super_admin" || role === "processing") && (
          <GenerateAgreementForm studentId={id} templates={templates ?? []} />
        )}
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} ·{" "}
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.discount_amount != null && ` · discount ${a.discount_amount}`}
                </span>
                <div className="flex items-center gap-3">
                  <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
                  {isSuperAdmin && <DeleteAgreementButton agreementId={a.id} studentId={id} />}
                </div>
              </div>
            ))}
            {canModifyAgreement && latestAgreement && latestAgreement.status !== "signed" && (
              <UploadSignedAgreementForm agreementId={latestAgreement.id} studentId={id} />
            )}
          </div>
        )}
      </Card>

      {signedAgreement && (
        <Card className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Invoice</h3>
          <GenerateInvoiceForm studentId={id} agreementId={signedAgreement.id} />
          <div className="mt-4 flex flex-col gap-3">
            {(invoices ?? []).map((inv) => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                installments={(installments ?? []).filter((i) => i.invoice_id === inv.id)}
                studentId={id}
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
            {trackerSections.map(({ entry, values, dynamicOptions, regionByUniversityValue }) => (
              <div key={entry.countryCode}>
                <p className="mb-2 text-xs font-medium text-muted">{entry.displayName}</p>
                <CountryTrackerForm
                  applicationId={entry.id}
                  fields={COUNTRY_TRACKER_FIELDS[entry.countryCode]}
                  values={values}
                  revalidateTo={`/students/${id}`}
                  dynamicOptions={dynamicOptions}
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
          <p className="text-sm text-muted">No applications yet.</p>
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

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Message student</h3>
          <p className="mb-3 text-xs text-muted">
            Visible to the student in their portal. Real email/SMS/WhatsApp sending needs a gateway integration —
            this sends as an in-app portal message for now.
          </p>
          <MessageThread
            messages={(messages ?? []).filter((m) => m.channel !== "internal_note")}
            entityType="student"
            entityId={id}
            channel="inapp"
            revalidateTo={`/students/${id}`}
            placeholder="Message to the student…"
            templates={messageTemplates ?? []}
          />
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Internal notes</h3>
          <p className="mb-3 text-xs text-muted">Staff-only — never visible to the student.</p>
          <MessageThread
            messages={(messages ?? []).filter((m) => m.channel === "internal_note")}
            entityType="student"
            entityId={id}
            channel="internal_note"
            revalidateTo={`/students/${id}`}
          />
        </Card>
      </div>
    </div>
  );
}
