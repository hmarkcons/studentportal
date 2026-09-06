import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { DataTable } from "@/components/ui/DataTable";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { ImportLeadsForm } from "./ImportLeadsForm";
import { InlineStatusCell } from "./InlineStatusCell";
import { InlineCounselorCell } from "./InlineCounselorCell";
import { FollowUpCell } from "./FollowUpCell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { hasPermission } from "@/lib/auth/permissions";
import { getCachedCounselors } from "@/lib/cachedQueries";

type LeadRow = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  country_of_interest: string | null;
  status: string;
  date_of_inquiry: string;
  assigned_counselor_id: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function LeadsPage() {
  const supabase = await createClient();
  const canDelete = await hasPermission("leads.delete");

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, contact_number, email, country_of_interest, status, date_of_inquiry, assigned_counselor_id, assigned_counselor:staff!assigned_counselor_id(full_name)"
    )
    .order("date_of_inquiry", { ascending: false })
    .returns<LeadRow[]>();

  const leadIds = (leads ?? []).map((r) => r.id);

  // Powers the Follow-up column's "View (N)" count — every follow_up remark
  // ever logged for the lead (see addLeadFollowUpRemark), resolved or not.
  // The Calendar page reads the same rows directly, so adding one here
  // surfaces it there automatically.
  const { data: followUps } =
    leadIds.length > 0
      ? await supabase.from("reminders").select("student_id").eq("type", "follow_up").in("student_id", leadIds)
      : { data: [] as { student_id: string }[] };
  const followUpCountByLead = new Map<string, number>();
  for (const f of followUps ?? []) {
    followUpCountByLead.set(f.student_id, (followUpCountByLead.get(f.student_id) ?? 0) + 1);
  }

  // Powers the status button's hover tooltip — the most recent call-log
  // remark per lead (see update_lead_status). Ordered newest-first so the
  // first row seen per lead_id is already the latest one.
  const { data: callLogs } =
    leadIds.length > 0
      ? await supabase.from("lead_call_logs").select("lead_id, remark").in("lead_id", leadIds).order("created_at", { ascending: false })
      : { data: [] as { lead_id: string; remark: string }[] };
  const latestRemarkByLead = new Map<string, string>();
  for (const log of callLogs ?? []) {
    if (!latestRemarkByLead.has(log.lead_id)) latestRemarkByLead.set(log.lead_id, log.remark);
  }

  const counselors = await getCachedCounselors();

  const columns = [
    { key: "month", header: "Month" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "country", header: "Country" },
    { key: "status", header: "Status" },
    { key: "counselor", header: "Counselor", align: "center" as const },
    { key: "followUp", header: "Follow-up" },
    { key: "date", header: "Inquiry date" },
    { key: "actions", header: "", align: "right" as const, exportable: false },
  ];

  const rows = (leads ?? []).map((r) => {
    const inquiryDate = new Date(r.date_of_inquiry);
    const monthYearLabel = inquiryDate.toLocaleString("en-US", { month: "short", year: "numeric" });
    const counselorName = one(r.assigned_counselor)?.full_name;
    return {
      id: r.id,
      cells: {
        month: monthYearLabel,
        name: (
          <Link href={`/leads/${r.id}`} prefetch={false} className="font-medium text-ink hover:underline">
            {r.full_name}
          </Link>
        ),
        contact: r.contact_number ?? r.email ?? "—",
        country: r.country_of_interest ?? "—",
        status: <InlineStatusCell leadId={r.id} currentStatus={r.status} latestRemark={latestRemarkByLead.get(r.id)} />,
        counselor: (
          <InlineCounselorCell
            leadId={r.id}
            currentCounselorId={r.assigned_counselor_id}
            currentCounselorName={counselorName ?? null}
            counselors={counselors}
          />
        ),
        followUp: <FollowUpCell leadId={r.id} remarkCount={followUpCountByLead.get(r.id) ?? 0} revalidateTo="/leads" />,
        date: formatDateOnly(r.date_of_inquiry),
        actions: (
          <RowActionsMenu id={r.id} name={r.full_name} editHref={`/leads/${r.id}`} canDelete={canDelete} deleteLabel="Delete lead" />
        ),
      },
      csv: {
        name: r.full_name,
        contact: r.contact_number ?? r.email ?? "",
        country: r.country_of_interest ?? "",
        status: LEAD_STATUS_LABELS[r.status as keyof typeof LEAD_STATUS_LABELS] ?? r.status,
        counselor: counselorName ?? "",
        followUp: String(followUpCountByLead.get(r.id) ?? 0),
        date: r.date_of_inquiry,
        month: monthYearLabel,
      },
    };
  });

  const countryOptions = Array.from(new Set((leads ?? []).map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const counselorOptions = Array.from(
    new Set((leads ?? []).map((r) => one(r.assigned_counselor)?.full_name).filter(Boolean))
  ).sort() as string[];

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Leads</h2>
          <p className="text-sm text-muted">{leads?.length ?? 0} in the pipeline</p>
        </div>
        <Link href="/leads/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + New lead
        </Link>
      </div>

      <ImportLeadsForm />

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && (
        <div className="mt-4">
          <DataTable
            exportFilename="leads"
            rows={rows}
            columns={columns}
            searchable
            searchPlaceholder="Search name, contact…"
            minTableWidthClassName="min-w-[640px] lg:min-w-[950px]"
            pageSize={25}
            filters={[
              { key: "status", label: "Status", options: Object.values(LEAD_STATUS_LABELS) },
              { key: "country", label: "Country", options: countryOptions },
              { key: "counselor", label: "Counselor", options: counselorOptions },
            ]}
          />
        </div>
      )}
    </div>
  );
}
