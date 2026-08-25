import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";

type Row = { id: string; name: string; total: number; enrolled: number; rejected: number; successPct: number };

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function UniversitySuccessPage() {
  const supabase = await createClient();

  const { data: applications } = await supabase.from("applications").select("current_stage, university:universities(id, name)");

  const byUni = new Map<string, { name: string; total: number; enrolled: number; rejected: number }>();
  (applications ?? []).forEach((a) => {
    const uni = one(a.university);
    if (!uni) return;
    const entry = byUni.get(uni.id) ?? { name: uni.name, total: 0, enrolled: 0, rejected: 0 };
    entry.total += 1;
    if (a.current_stage === "enrolled") entry.enrolled += 1;
    if (["rejected", "declined"].includes(a.current_stage)) entry.rejected += 1;
    byUni.set(uni.id, entry);
  });

  const rows: Row[] = [...byUni.entries()].map(([id, v]) => {
    const decided = v.enrolled + v.rejected;
    return { id, name: v.name, total: v.total, enrolled: v.enrolled, rejected: v.rejected, successPct: decided ? Math.round((v.enrolled / decided) * 100) : 0 };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">University-wise Application / Success Rate</h2>
      <DataTable
        exportFilename="university-success"
        rows={rows}
        columns={[
          { key: "name", header: "University", render: (r) => r.name, csv: (r) => r.name },
          { key: "total", header: "Applications", align: "right", render: (r) => r.total, csv: (r) => String(r.total) },
          { key: "enrolled", header: "Enrolled", align: "right", render: (r) => r.enrolled, csv: (r) => String(r.enrolled) },
          { key: "rejected", header: "Rejected", align: "right", render: (r) => r.rejected, csv: (r) => String(r.rejected) },
          { key: "rate", header: "Success rate", align: "right", render: (r) => `${r.successPct}%`, csv: (r) => String(r.successPct) },
        ]}
      />
    </div>
  );
}
