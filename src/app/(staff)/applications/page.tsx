import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { loadApplicationRows } from "@/lib/applicationRows";
import { orderedApplicationColumns } from "@/lib/applicationTable";
import { karachiToday } from "@/lib/calendarDates";
import { RefreshIfStale } from "@/components/RefreshIfStale";
import { ArrangeLeadColumns } from "../leads/ArrangeLeadColumns";
import { NewApplicationForStudent } from "./NewApplicationForStudent";
import { ApplicationsTable } from "./ApplicationsTable";

/**
 * Every application the viewer can see, as one table (ApplicationsTable):
 * edited where it stands, offers at the top and rejections at the bottom.
 * RLS decides whose applications are in it.
 */
export default async function ApplicationsPage() {
  const { supabase, staff } = await getStaffSession();

  const [{ rows, programsByUniversity }, { data: students }, { data: savedOrder }] = await Promise.all([
    loadApplicationRows(supabase),
    supabase.from("students").select("id, full_name").order("full_name"),
    supabase.from("list_column_orders").select("column_keys").eq("list_key", "applications").maybeSingle(),
  ]);

  const isSuperAdmin = hasRole(staff, "super_admin");
  const columns = orderedApplicationColumns(savedOrder?.column_keys, "all").map((c) => ({ key: c.key, header: c.header }));
  const studentCount = new Set(rows.map((r) => r.studentId)).size;

  return (
    <div className="w-full">
      <RefreshIfStale renderKey={crypto.randomUUID()} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Applications</h2>
          <p className="text-xs text-muted">
            {rows.length} applications · {studentCount} students. Click a cell to change it; offers rise to the top and rejections sink to the bottom on their own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <ArrangeLeadColumns list="applications" columns={orderedApplicationColumns(savedOrder?.column_keys).map((c) => ({ key: c.key, header: c.header }))} />
          )}
          <NewApplicationForStudent students={students ?? []} />
        </div>
      </div>
      <ApplicationsTable
        rows={rows}
        programsByUniversity={programsByUniversity}
        columns={columns}
        scope="all"
        today={karachiToday()}
        canEditCatalogue={isSuperAdmin}
        canDelete={isSuperAdmin || hasRole(staff, "management")}
        exportHref="/api/export/applications"
        label="Applications"
        heading={{ title: "All applications", detail: `${rows.length} applications · ${studentCount} students` }}
      />
    </div>
  );
}
