import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewScholarshipBodyForm } from "./NewScholarshipBodyForm";
import { ScholarshipBodyRow } from "./ScholarshipBodyRow";

export default async function ScholarshipBodiesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: bodies } = await supabase
    .from("scholarship_bodies")
    .select("id, name, region, academic_year, covers, stipend_amount, source_url, last_updated_year")
    .order("name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Scholarship Region & University Directory</h2>
      <p className="mb-4 text-sm text-muted">Italy public-university scholarship bodies (DSU). Editable by Processing and Super Admin.</p>
      <Card className="mb-6">
        <NewScholarshipBodyForm />
      </Card>
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
              <ScholarshipBodyRow key={b.id} body={{ ...b, covers: b.covers ?? [] }} isSuperAdmin={isSuperAdmin} />
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
