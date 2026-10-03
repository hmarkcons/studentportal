import Link from "next/link";
import { readAll } from "@/lib/catalogueReads";
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

/** A thousand leads to a page, read by the server one page at a time. */
const PAGE_SIZE = 1000;

/** What the search box looks through on the lead itself; remarks, counsellors and statuses are matched besides. */
const SEARCHED_COLUMNS = [
  "full_name",
  "contact_number",
  "email",
  "city",
  "country_of_interest",
  "course_of_interest",
  "current_qualification",
  "platform_source",
];

const LEAD_SELECT =
  "id, full_name, contact_number, email, city, country_of_interest, current_qualification, level_applying_for, course_of_interest, platform_source, status, date_of_inquiry, assigned_counselor_id, assigned_counselor:staff!assigned_counselor_id(full_name), current_remark:lead_remark_current(body, updated_at, editor:staff!lead_remark_current_updated_by_fkey(full_name))";

type OptionRow = {
  country_of_interest: string | null;
  city: string | null;
  assigned_counselor_id: string | null;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

export default async function LeadsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Server-side paging: only the page shown is read and sent. The search,
  // the filters and the page are in the address (?q=, ?f_<key>=, ?page=), so
  // the server answers them — a list of 2,803 sent whole took four seconds and
  // a megabyte to open.
  const params = await props.searchParams;
  const param = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : (v ?? "")).trim();
  };
  const page = Math.max(1, Math.floor(Number(param("page")) || 1));
  const search = param("q").slice(0, 100);
  const filters = {
    status: param("f_status"),
    country: param("f_country"),
    city: param("f_city"),
    level: param("f_level"),
    counselor: param("f_counselor"),
  };
  // The search as an ilike pattern, without what PostgREST's filter syntax
  // would read as structure — commas, brackets, quotes — or as wildcards.
  const term = search.replace(/[%_,()*\\"']/g, " ").replace(/\s+/g, " ").trim();
  const like = `%${term}%`;

  const supabase = await createClient();
  // First, everything that does not depend on which leads are on the page —
  // read beside each other. The filter choices and the total come from every
  // lead, light: three columns, a thousand rows at a time (PostgREST stops at
  // 1000 to a request without saying so). The follow-ups and call logs are
  // read the same way, by what RLS lets this viewer see.
  const [canDelete, counselors, { staff }, { data: savedOrder }, optionRows, remarkHits, followUps, callLogs] = await Promise.all([
    hasPermission("leads.delete"),
    getCachedCounselors(),
    getStaffSession(),
    // The order a Super Admin arranged the columns in (0313), for everyone.
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle(),
    readAll<OptionRow>((from, to) =>
      supabase
        .from("leads")
        .select("country_of_interest, city, assigned_counselor_id, assigned_counselor:staff!assigned_counselor_id(full_name)")
        .order("id")
        .range(from, to)
        .returns<OptionRow[]>()
    ).catch(() => [] as OptionRow[]),
    // Leads whose remark says what was searched for. A hundred at most: they
    // go into the request by id, and more would not fit in its address.
    term
      ? supabase
          .from("lead_remark_current")
          .select("lead_id")
          .ilike("body", like)
          .limit(100)
          .then((r) => (r.data ?? []) as { lead_id: string }[])
      : Promise.resolve([] as { lead_id: string }[]),
    // Powers the Follow-up column's "View (N)" count — every follow_up remark
    // ever logged for the lead (see addLeadFollowUpRemark), resolved or not.
    // The Calendar page reads the same rows directly, so adding one here
    // surfaces it there automatically.
    readAll<{ student_id: string }>((from, to) =>
      supabase.from("reminders").select("student_id").eq("type", "follow_up").order("id").range(from, to).returns<{ student_id: string }[]>()
    ).catch(() => [] as { student_id: string }[]),
    // Powers the status button's hover tooltip — the most recent call-log
    // remark per lead (see update_lead_status), newest first so the first row
    // seen per lead is already the latest one.
    readAll<{ lead_id: string; remark: string }>((from, to) =>
      supabase
        .from("lead_call_logs")
        .select("lead_id, remark")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .returns<{ lead_id: string; remark: string }[]>()
    ).catch(() => [] as { lead_id: string; remark: string }[]),
  ]);
  const canArrange = hasRole(staff, "super_admin");

  // The filter choices, from every lead rather than the page shown.
  const counselorIdByName = new Map<string, string>();
  for (const r of optionRows) {
    const name = one(r.assigned_counselor)?.full_name;
    if (name && r.assigned_counselor_id) counselorIdByName.set(name, r.assigned_counselor_id);
  }
  const countryOptions = Array.from(new Set(optionRows.map((r) => r.country_of_interest).filter(Boolean))).sort() as string[];
  const cityOptions = Array.from(new Set(optionRows.map((r) => r.city?.trim()).filter(Boolean))).sort() as string[];
  const counselorOptions = Array.from(counselorIdByName.keys()).sort();
  const totalLeads = optionRows.length;

  // Then the page itself: searched and filtered by the database, counted in all.
  let query = supabase.from("leads").select(LEAD_SELECT, { count: "exact" });
  const statusKey = Object.entries(LEAD_STATUS_LABELS).find(([, label]) => label === filters.status)?.[0];
  if (filters.status) query = query.eq("status", statusKey ?? "-");
  if (filters.country) query = query.eq("country_of_interest", filters.country);
  if (filters.city) query = query.eq("city", filters.city);
  const levelKey = Object.entries(LEVEL_LABELS).find(([, label]) => label === filters.level)?.[0];
  if (filters.level) query = query.eq("level_applying_for", levelKey ?? "-");
  if (filters.counselor) query = query.eq("assigned_counselor_id", counselorIdByName.get(filters.counselor) ?? "00000000-0000-0000-0000-000000000000");
  if (term) {
    const lower = term.toLowerCase();
    const ors = SEARCHED_COLUMNS.map((c) => `${c}.ilike."${like}"`);
    if (remarkHits.length) ors.push(`id.in.(${remarkHits.map((r) => r.lead_id).join(",")})`);
    const counselorIds = Array.from(counselorIdByName.entries())
      .filter(([name]) => name.toLowerCase().includes(lower))
      .map(([, id]) => id);
    if (counselorIds.length) ors.push(`assigned_counselor_id.in.(${counselorIds.join(",")})`);
    const statusKeys = Object.entries(LEAD_STATUS_LABELS)
      .filter(([, label]) => label.toLowerCase().includes(lower))
      .map(([key]) => key);
    if (statusKeys.length) ors.push(`status.in.(${statusKeys.join(",")})`);
    query = query.or(ors.join(","));
  }
  const { data: leads, error, count } = await query
    .order("date_of_inquiry", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<LeadRow[]>();
  const matching = count ?? leads?.length ?? 0;

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


  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Leads</h2>
          <p className="text-sm text-muted">{totalLeads} in the pipeline</p>
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
            pageSize={PAGE_SIZE}
            server={{ page, total: matching, search, filters }}
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
