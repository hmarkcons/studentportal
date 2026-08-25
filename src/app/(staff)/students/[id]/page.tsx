import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MessageThread, type MessageRow } from "@/components/MessageThread";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { StudentProfileForm } from "./StudentProfileForm";
import { GenerateAgreementForm, UploadSignedAgreementForm } from "./GenerateAgreementForm";
import { GenerateInvoiceForm, InvoiceCard } from "./InvoicePanel";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentDetailPage(props: PageProps<"/students/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("id, full_name, email, contact_number, country_of_interest, auth_user_id, portal_active")
    .eq("id", id)
    .maybeSingle();

  if (error || !student) notFound();

  const { data: profile } = await supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle();

  const { data: templates } = await supabase
    .from("agreement_templates")
    .select("id, signatory_name, destination:destinations(display_name)");

  const { data: agreements } = await supabase
    .from("agreements")
    .select("id, status, signing_method, signed_file_path, email_verified, created_at")
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
    .select("id, current_stage, intake, university:universities(name)")
    .eq("student_id", id);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
    .eq("entity_type", "student")
    .eq("entity_id", id)
    .order("sent_at", { ascending: true })
    .returns<MessageRow[]>();

  const { data: messageTemplates } = await supabase.from("message_templates").select("id, purpose, channel, body").order("purpose");

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/students" className="text-sm text-muted hover:text-ink">
        &larr; Back to students
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">{student.full_name}</h2>
          <p className="text-sm text-muted">
            {student.email ?? "No email"} · {student.contact_number ?? "No phone"} · {student.country_of_interest ?? "—"}
          </p>
        </div>
        <Badge tone={student.portal_active ? "success" : "neutral"}>{student.portal_active ? "Portal active" : "Portal inactive"}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Profile</h3>
          <StudentProfileForm studentId={id} profile={profile} />
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Portal access</h3>
          <PortalAccessPanel studentId={id} enabled={Boolean(student.auth_user_id)} />
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Agreement</h3>
        <GenerateAgreementForm studentId={id} templates={templates ?? []} />
        {agreements && agreements.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {agreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  v{a.status === "signed" ? "signed" : "pending"} · {a.signing_method ?? "—"} ·{" "}
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
                <Badge tone={a.status === "signed" ? "success" : "warning"}>{a.status}</Badge>
              </div>
            ))}
            {latestAgreement && latestAgreement.status !== "signed" && (
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Applications</h3>
          <Link href={`/students/${id}/applications/new`} className="text-sm font-medium text-primary hover:underline">
            + New application
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
                <span>
                  {one(app.university)?.name} {app.intake && `· ${app.intake}`}
                </span>
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
            placeholder="Internal note…"
          />
        </Card>
      </div>
    </div>
  );
}
