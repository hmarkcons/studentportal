import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { ImportLeadsForm } from "./ImportLeadsForm";
import { LeadsTable, type LeadListRow } from "./LeadsTable";
import { hasPermission } from "@/lib/auth/permissions";
import { getCachedCounselors } from "@/lib/cachedQueries";
import { monthLabel, orderedLeadColumns, type LeadColumnKey } from "@/lib/leadSheet";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { ArrangeLeadColumns } from "./ArrangeLeadColumns";
import { searchTerm } from "@/lib/listSearch";
import { loginEmailMatches } from "@/lib/loginEmailSearch";
import { RefreshIfStale } from "@/components/RefreshIfStale";

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
  /** The newest call-log remark, for the status button's tooltip — one row at most. */
  latest_log: { remark: string | null }[] | null;
  /** How many follow-ups have been logged for the lead, resolved or not. */
  follow_ups: { count: number }[] | null;
};

type CurrentRemark = { body: string | null; updated_at: string; editor: { full_name: string } | { full_name: string }[] | null };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * A thousand leads to a page, read by the server one page at a time — the
 * office's choice. (250 was tried; a thousand on screen at once is what they
 * work from.)
 */
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
  "id, full_name, contact_number, email, city, country_of_interest, current_qualification, level_applying_for, course_of_interest, platform_source, status, date_of_inquiry, assigned_counselor_id, assigned_counselor:staff!assigned_counselor_id(full_name), current_remark:lead_remark_current(body, updated_at, editor:staff!lead_remark_current_updated_by_fkey(full_name)), latest_log:lead_call_logs(remark, created_at), follow_ups:reminders(count)";

/** What the filters offer and how many leads there are, from every lead the viewer may see (0316). */
type ListOptions = { total: number; countries: string[]; cities: string[]; counselors: { id: string; name: string }[] };

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
  // would read as structure — commas, brackets, quotes — or as wildcards; an
  // email address's underscore kept (src/lib/listSearch.ts).
  const term = searchTerm(search);
  const like = `%${term}%`;

  const supabase = await createClient();
  // First, everything that does not depend on which leads are on the page —
  // read beside each other. The filter choices and the total come from every
  // lead, worked out by the database in one request (lead_list_options, 0316):
  // reading every lead here to work them out, a thousand at a time and one
  // request after another, was most of the time the list took to open.
  const [canDelete, counselors, { staff }, { data: savedOrder }, { data: listOptions }, remarkHits, loginHits] = await Promise.all([
    hasPermission("leads.delete"),
    getCachedCounselors(),
    getStaffSession(),
    // The order a Super Admin arranged the columns in (0313), for everyone.
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "leads").maybeSingle(),
    supabase.rpc("lead_list_options").then((r) => ({ data: r.data as ListOptions | null })),
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
    // Students whose portal sign-in address says it, where that is not the
    // email on their record (0327).
    term.length >= 2 ? loginEmailMatches(supabase, term) : Promise.resolve([] as string[]),
  ]);
  const canArrange = hasRole(staff, "super_admin");

  // The filter choices, from every lead rather than the page shown.
  const counselorIdByName = new Map<string, string>();
  for (const c of listOptions?.counselors ?? []) counselorIdByName.set(c.name, c.id);
  const countryOptions = [...(listOptions?.countries ?? [])].sort();
  const cityOptions = [...(listOptions?.cities ?? [])].sort();
  const counselorOptions = Array.from(counselorIdByName.keys()).sort();
  const totalLeads = listOptions?.total ?? 0;

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
    const idHits = [...new Set([...remarkHits.map((r) => r.lead_id), ...loginHits])];
    if (idHits.length) ors.push(`id.in.(${idHits.join(",")})`);
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
  // Each lead's newest call-log remark and its follow-up count come with it,
  // rather than every call log and follow-up on file being read to find them.
  const { data: leads, error, count } = await query
    .not("latest_log.remark", "is", null)
    .order("created_at", { referencedTable: "latest_log", ascending: false })
    .limit(1, { referencedTable: "latest_log" })
    .eq("follow_ups.type", "follow_up")
    .order("date_of_inquiry", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<LeadRow[]>();
  const matching = count ?? leads?.length ?? 0;

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

  // Plain values, one lead to a row: the browser makes the cells, and only
  // for the rows in view (LeadsTable). The server making every cell of a
  // thousand rows came to six megabytes of page.
  const rows: LeadListRow[] = (leads ?? []).map((r) => {
    const remark = one(r.current_remark);
    return {
      id: r.id,
      name: r.full_name,
      contact: r.contact_number,
      email: r.email,
      city: r.city,
      country: r.country_of_interest,
      qualification: r.current_qualification,
      level: r.level_applying_for ? (LEVEL_LABELS[r.level_applying_for] ?? r.level_applying_for) : null,
      course: r.course_of_interest,
      source: r.platform_source,
      status: r.status,
      // Worked out from the inquiry date, never stored or typed.
      month: monthLabel(r.date_of_inquiry),
      date: formatDateOnly(r.date_of_inquiry),
      counselorId: r.assigned_counselor_id,
      counselorName: one(r.assigned_counselor)?.full_name ?? null,
      remark: remark?.body ?? null,
      remarkAt: remark?.updated_at ?? null,
      remarkBy: one(remark?.editor ?? null)?.full_name ?? null,
      lastCallRemark: r.latest_log?.[0]?.remark ?? null,
      followUps: r.follow_ups?.[0]?.count ?? 0,
    };
  });

  return (
    <div className="w-full">
      <RefreshIfStale renderKey={crypto.randomUUID()} />
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
          <LeadsTable
            leads={rows}
            counselors={counselors}
            canDelete={canDelete}
            virtualRowHeight={37}
            exportFilename="leads"
            exportHref="/api/export/leads"
            rowHighlight
            dense
            expandable
            label="Leads"
            freezeColumn="name"
            columns={columns}
            searchable
            searchPlaceholder="Search name, email, phone, course, remarks…"
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
