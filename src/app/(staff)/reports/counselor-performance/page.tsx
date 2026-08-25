import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";

type Row = { id: string; name: string; assigned: number; registered: number; conversionPct: number };

export default async function CounselorPerformancePage() {
  const supabase = await createClient();

  const { data: counselors } = await supabase.from("staff").select("id, full_name").eq("role", "counselor");
  const { data: leads } = await supabase.from("leads").select("assigned_counselor_id, registered_at");

  const rows: Row[] = (counselors ?? []).map((c) => {
    const assignedLeads = (leads ?? []).filter((l) => l.assigned_counselor_id === c.id);
    const registered = assignedLeads.filter((l) => l.registered_at).length;
    return {
      id: c.id,
      name: c.full_name,
      assigned: assignedLeads.length,
      registered,
      conversionPct: assignedLeads.length ? Math.round((registered / assignedLeads.length) * 100) : 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Counselor-wise Performance</h2>
      <DataTable
        exportFilename="counselor-performance"
        rows={rows}
        columns={[
          { key: "name", header: "Counselor", render: (r) => r.name, csv: (r) => r.name },
          { key: "assigned", header: "Leads assigned", align: "right", render: (r) => r.assigned, csv: (r) => String(r.assigned) },
          { key: "registered", header: "Registered", align: "right", render: (r) => r.registered, csv: (r) => String(r.registered) },
          { key: "conv", header: "Conversion rate", align: "right", render: (r) => `${r.conversionPct}%`, csv: (r) => String(r.conversionPct) },
        ]}
      />
    </div>
  );
}
