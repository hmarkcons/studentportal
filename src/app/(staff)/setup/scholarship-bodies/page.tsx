import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { NewScholarshipBodyForm } from "./NewScholarshipBodyForm";
import { ScholarshipBodyRow } from "./ScholarshipBodyRow";

export default async function ScholarshipBodiesPage() {
  const { supabase } = await getStaffSession();
  // scholarships.manage, not role === "super_admin". The page has always told
  // Processing they could edit this directory; only Super Admin was ever shown
  // the controls, and creating a body needed no permission at all.
  const canManage = await hasPermission("scholarships.manage");

  const { data: bodies } = await supabase
    .from("scholarship_bodies")
    .select("id, name, region, academic_year, covers, stipend_amount, source_url, last_updated_year")
    .order("name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Scholarship Region & University Directory</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Italy&rsquo;s regional DSU bodies, which award the scholarships tracked on a student&rsquo;s Scholarship tab.
        &ldquo;Covers&rdquo; lists the universities a body pays for, and is what maps a student&rsquo;s university to
        its region.
      </p>
      {canManage && (
        <Card className="mb-6">
          <NewScholarshipBodyForm />
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Body</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Covers</th>
              <th className="px-4 py-3">Academic year</th>
              <th className="px-4 py-3">Stipend / notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(bodies ?? []).map((b) => (
              <ScholarshipBodyRow key={b.id} body={{ ...b, covers: b.covers ?? [] }} canManage={canManage} />
            ))}
            {(!bodies || bodies.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No scholarship bodies added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
