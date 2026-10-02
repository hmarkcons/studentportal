import { hasRole } from "@/lib/auth/roles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LEAD_STATUS_LABELS, LEAD_STATUS_TONE } from "@/lib/constants";
import { CallLogForm } from "./CallLogForm";
import { LeadRemarkEditor } from "../LeadRemarkEditor";
import { RegisterLeadButton } from "./RegisterLeadButton";
import { LeadEditForm } from "@/components/LeadEditForm";
import { DeleteStudentButton } from "../../students/[id]/DeleteStudentButton";
import { getCurrentUser } from "@/lib/auth/currentUser";

type CallLog = { id: string; status_at_time: string; remark: string; created_at: string; counselor: { full_name: string } | { full_name: string }[] | null };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const user = await getCurrentUser();
  const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  const canDeleteLead = hasRole(staffRow, "super_admin") || hasRole(staffRow, "processing");

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, contact_number, email, current_qualification, level_applying_for, course_of_interest, country_of_interest, status, date_of_inquiry, platform_source, registered_at, current_remark:lead_remark_current(body, updated_at, editor:staff!lead_remark_current_updated_by_fkey(full_name))"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !lead) notFound();
  // Staff-only, beside the lead rather than on it (0307).
  const currentRemark = (Array.isArray(lead.current_remark) ? lead.current_remark[0] : lead.current_remark) as
    | { body: string | null; updated_at: string; editor: { full_name: string } | { full_name: string }[] | null }
    | null
    | undefined;

  const { data: logs } = await supabase
    .from("lead_call_logs")
    .select("id, status_at_time, remark, created_at, counselor:staff(full_name)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .returns<CallLog[]>();

  return (
    <div className="w-full">
      <Link prefetch={false} href="/leads" className="text-sm text-muted hover:text-ink">
        &larr; Back to leads
      </Link>

      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">{lead.full_name}</h2>
          <p className="text-sm text-muted">
            {lead.email ?? "No email"} · {lead.contact_number ?? "No phone"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={LEAD_STATUS_TONE[lead.status as never] ?? "neutral"}>
            {LEAD_STATUS_LABELS[lead.status as never] ?? lead.status}
          </Badge>
          {canDeleteLead && (
            <DeleteStudentButton studentId={id} studentName={lead.full_name} redirectTo="/leads" label="Delete lead" />
          )}
        </div>
      </div>

      {lead.registered_at ? (
        <Card className="mb-6 bg-success-bg">
          <p className="text-sm text-success">
            Registered on {new Date(lead.registered_at).toLocaleDateString()}.{" "}
            <Link prefetch={false} href={`/students/${lead.id}`} className="font-medium underline">
              View student record
            </Link>
          </p>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-sm text-muted">
            Converts this lead into a Registered Student and hands ownership to the Processing Team.
          </p>
          <div className="mt-3">
            <RegisterLeadButton leadId={id} />
          </div>
          <p className="mt-2 text-xs text-muted">Discount can be set anytime after registration from the student&apos;s dashboard.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Details</h3>
            <LeadEditForm lead={lead} revalidateTo={`/leads/${id}`} />
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Platform</dt>
              <dd className="text-ink">{lead.platform_source ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Current qualification</dt>
              <dd className="text-ink">{lead.current_qualification ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Applying for</dt>
              <dd className="text-ink">{lead.level_applying_for ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Course of interest</dt>
              <dd className="text-ink">{lead.course_of_interest ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Country of interest</dt>
              <dd className="text-ink">{lead.country_of_interest ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Inquiry date</dt>
              <dd className="text-ink">{formatDateOnly(lead.date_of_inquiry)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Call log & status</h3>
          <CallLogForm leadId={id} currentStatus={lead.status} />
        </Card>
      </div>

      {/* The counsellor's own note on the lead, every version kept (0306) —
          the same remark as the Remarks column in the leads list. */}
      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Remarks</h3>
        <LeadRemarkEditor
          leadId={id}
          remark={currentRemark?.body ?? null}
          updatedAt={currentRemark?.updated_at ?? null}
          updatedBy={(Array.isArray(currentRemark?.editor) ? currentRemark?.editor[0] : currentRemark?.editor)?.full_name ?? null}
        />
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Call history</h3>
        {!logs || logs.length === 0 ? (
          <EmptyState>No calls logged yet.</EmptyState>
        ) : (
          <ol className="flex flex-col gap-3">
            {logs.map((log) => (
              <li key={log.id} className="border-l-2 border-border pl-3">
                <p className="text-sm text-ink">
                  {LEAD_STATUS_LABELS[log.status_at_time as never] ?? log.status_at_time} — {log.remark}
                </p>
                <p className="text-xs text-muted">
                  {one(log.counselor)?.full_name ?? "Unknown"} · {new Date(log.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
