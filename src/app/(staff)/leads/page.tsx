import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { DataTable } from "@/components/ui/DataTable";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { ImportLeadsForm } from "./ImportLeadsForm";
import { InlineStatusCell } from "./InlineStatusCell";
import { InlineCounselorCell } from "./InlineCounselorCell";
import { FollowUpCell } from "./FollowUpCell";
import { RemarkCell } from "./RemarkCell";
import { LongTextCell } from "@/components/ui/LongTextCell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { hasPermission } from "@/lib/auth/permissions";
import { getCachedCounselors } from "@/lib/cachedQueries";
import { monthLabel, orderedLeadColumns, type LeadColumnKey } from "@/lib/leadSheet";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { ArrangeLeadColumns } from "./ArrangeLeadColumns";

/** Each list column, by the leads workbook column it shows. The follow-up note has none of its own: it is in Follow-up. */
const TABLE_KEY: Record<LeadColumnKey, string | null> = {
  month: "month",
  city: "city",
  full_name: "name",
  contact_number: "contact",
  email: "email",
  country_of_interest: "country",
  current_qualification: "qualification",
  level_applying_for: "level",
  course_of_interest: "course",
  status: "status",
  counselor: "counselor",
  remarks: "remarks",
  follow_up_date: "followUp",
  follow_up_note: null,
  date_of_inquiry: "date",
  platform_source: "source",
};

const LEVEL_LABELS: Record<string, string> = { bachelors: "Bachelors", masters: "Masters", phd: "PhD" };

type LeadRow = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  city: string | null;
  country_of_interest: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  platform_source: string | null;
  status: string;
  date_of_inquiry: string;
  assigned_counselor_id: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
  /** The current remark: its newest version, staff-only (0306, 0307). */
  current_remark: CurrentRemark | CurrentRemark[] | null;
};

type CurrentRemark = { body: string | null; updated_at: string; editor: { full_name: string } | { full_name: string }[] | null };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function LeadsPage() {
  const supabase = await createClient();
  // Two waves where there were five: the list with what needs nothing, then
  // the two things that need the list.
  const [canDelete, { data: leads, error }, counselors, { staff }, { data: savedOrder }] = await Promise.all([
    hasPermission("leads.delete"),
    supabase
      .from("leads")
      .select(
        "id, full_name, contact_number, email, city, country_of_interest, current_qualification, level_applying_for, course_of_interest, platform_source, status, date_of_inquiry, assigned_counselor_id, assigned_counselor:staff!assigned_counselor_id(full_name), current_remark:lead_remark_current(body, updated_at, editor:staff!lead_remark_current_updated_by_fkey(full_name))"
      )
      .order("date_of_inquiry", { ascending: false })
      .returns<LeadRow[]>(),
    getCachedCounselors(),
    getStaffSession(),
    // The order a Super Admin arranged the columns in (0313), for everyone.
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle(),
  ]);
  const canArrange = hasRole(staff, "super_admin");

  const leadIds = (leads ?? []).map((r) => r.id);

  const [{ data: followUps }, { data: callLogs }] = await Promise.all([
    // Powers the Follow-up column's "View (N)" count — every follow_up remark
    // ever logged for the lead (see addLeadFollowUpRemark), resolved or not.
    // The Calendar page reads the same rows directly, so adding one here
    // surfaces it there automatically.
    leadIds.length > 0
      ? supabase.from("reminders").select("student_id").eq("type", "follow_up").in("student_id", leadIds)
      : Promise.resolve({ data: [] as { student_id: string }[] }),
    // Powers the status button's hover tooltip — the most recent call-log
    // remark per lead (see update_lead_status). Ordered newest-first so the
    // first row seen per lead_id is already the latest one.
    leadIds.length > 0
      ? supabase.from("lead_call_logs").select("lead_id, remark").in("lead_id", leadIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { lead_id: string; remark: string }[] }),
  ]);
  const followUpCountByLead = new Map<string, number>();
  for (const f of followUps ?? []) {
    followUpCountByLead.set(f.student_id, (followUpCountByLead.get(f.student_id) ?? 0) + 1);
  }

  const latestRemarkByLead = new Map<string, string>();
  for (const log of callLogs ?? []) {
    if (!latestRemarkByLead.has(log.lead_id)) latestRemarkByLead.set(log.lead_id, log.remark);
  }

  // Everything on one line, with the table scrolling sideways — a name, a
  // number and a country each wrapping onto two lines made a row three deep
  // and the list impossible to scan. Status and Follow-up keep wrapping: both
  // hold an inline editor that needs the room. Remarks stays on one line, cut
  // short where it is long, and opens whole in a pop-up (RemarkCell).
  //
  // The columns are the leads workbook's (src/lib/leadSheet.ts), in the order a
  // Super Admin arranged them (0313) — the same order as the export and the
  // template, so what is on screen is what they hold.
  const columnDefs = [
    { key: "month", header: "Month" },
    { key: "city", header: "City" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact number" },
    { key: "email", header: "Email" },
    { key: "country", header: "Country" },
    { key: "qualification", header: "Current qualification" },
    { key: "level", header: "Applying for" },
    { key: "course", header: "Course of interest" },
    { key: "status", header: "Status", wrap: true },
    { key: "counselor", header: "Counselor", align: "center" as const },
    { key: "remarks", header: "Remarks" },
    { key: "followUp", header: "Follow-up", wrap: true },
    { key: "date", header: "Inquiry date" },
    { key: "source", header: "Source" },
  ];
  const defByKey = new Map(columnDefs.map((c) => [c.key, c]));
  const arranged = orderedLeadColumns(savedOrder?.column_keys)
    .map((c) => ({ sheetKey: c.key, def: TABLE_KEY[c.key] ? defByKey.get(TABLE_KEY[c.key]!) : undefined }))
    .filter((c): c is { sheetKey: LeadColumnKey; def: (typeof columnDefs)[number] } => Boolean(c.def));
  const columns = [...arranged.map((c) => c.def), { key: "actions", header: "", align: "right" as const, exportable: false }];

  const rows = (leads ?? []).map((r) => {
    const remark = one(r.current_remark);
    // Worked out from the inquiry date, never stored or typed.
    const monthYearLabel = monthLabel(r.date_of_inquiry);
    const level = r.level_applying_for ? (LEVEL_LABELS[r.level_applying_for] ?? r.level_applying_for) : null;
    // A long value is cut short on its line and opens whole in a pop-up.
    const long = (text: string | null, label: string, widthClassName?: string) => (
      <LongTextCell text={text} label={label} rowName={r.full_name} widthClassName={widthClassName} />
    );
    const counselorName = one(r.assigned_counselor)?.full_name;
    return {
      id: r.id,
      cells: {
        month: monthYearLabel,
        name: (
          <Link href={`/leads/${r.id}`} prefetch={false} title={r.full_name} className="block max-w-[16rem] truncate font-medium text-ink hover:underline">
            {r.full_name}
          </Link>
        ),
        contact: long(r.contact_number, "Contact number", "max-w-[10rem]"),
        email: long(r.email, "Email", "max-w-[14rem]"),
        city: long(r.city, "City", "max-w-[10rem]"),
        country: long(r.country_of_interest, "Country"),
        qualification: long(r.current_qualification, "Current qualification"),
        level: level ?? "—",
        course: long(r.course_of_interest, "Course of interest", "max-w-[14rem]"),
        status: <InlineStatusCell leadId={r.id} currentStatus={r.status} latestRemark={latestRemarkByLead.get(r.id)} />,
        counselor: (
          <InlineCounselorCell
            leadId={r.id}
            currentCounselorId={r.assigned_counselor_id}
            currentCounselorName={counselorName ?? null}
            counselors={counselors}
          />
        ),
        remarks: (
          <RemarkCell
            leadId={r.id}
            leadName={r.full_name}
            remark={remark?.body ?? null}
            updatedAt={remark?.updated_at ?? null}
            updatedBy={one(remark?.editor ?? null)?.full_name ?? null}
          />
        ),
        followUp: <FollowUpCell leadId={r.id} remarkCount={followUpCountByLead.get(r.id) ?? 0} revalidateTo="/leads" />,
        date: formatDateOnly(r.date_of_inquiry),
        source: long(r.platform_source, "Source", "max-w-[10rem]"),
        actions: (
          <RowActionsMenu id={r.id} name={r.full_name} editHref={`/leads/${r.id}`} canDelete={canDelete} deleteLabel="Delete lead" />
        ),
      },
      csv: {
        name: r.full_name,
        contact: r.contact_number ?? "",
        email: r.email ?? "",
        city: r.city ?? "",
        country: r.country_of_interest ?? "",
        qualification: r.current_qualification ?? "",
        level: level ?? "",
        course: r.course_of_interest ?? "",
        source: r.platform_source ?? "",
        status: LEAD_STATUS_LABELS[r.status as keyof typeof LEAD_STATUS_LABELS] ?? r.status,
        counselor: counselorName ?? "",
        // In the export, and in what the search box looks through.
        remarks: remark?.body ?? "",
        followUp: String(followUpCountByLead.get(r.id) ?? 0),
        date: r.date_of_inquiry,
        month: monthYearLabel,
      },
    };
  });

  const countryOptions = Array.from(new Set((leads ?? []).map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const cityOptions = Array.from(new Set((leads ?? []).map((r) => r.city?.trim()).filter(Boolean))).sort() as string[];
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
        <div className="flex items-center gap-2">
          {canArrange && <ArrangeLeadColumns columns={arranged.map((c) => ({ key: c.sheetKey, header: c.def.header }))} />}
          <Link prefetch={false} href="/leads/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
            + New lead
          </Link>
        </div>
      </div>

      <ImportLeadsForm />

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {!error && (
        <div className="mt-4">
          <DataTable
            exportFilename="leads"
            exportHref="/api/export/leads"
            rowHighlight
            label="Leads"
            freezeColumn="name"
            rows={rows}
            columns={columns}
            searchable
            searchPlaceholder="Search name, contact, course, remarks…"
            oneLine
            minTableWidthClassName="min-w-[1500px]"
            pageSize={25}
            filters={[
              { key: "status", label: "Status", options: Object.values(LEAD_STATUS_LABELS) },
              { key: "country", label: "Country", options: countryOptions },
              { key: "city", label: "City", options: cityOptions },
              { key: "level", label: "Applying for", options: Object.values(LEVEL_LABELS) },
              { key: "counselor", label: "Counselor", options: counselorOptions },
            ]}
          />
        </div>
      )}
    </div>
  );
}
