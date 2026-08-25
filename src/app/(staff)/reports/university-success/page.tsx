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
        columns={[
          { key: "name", header: "University" },
          { key: "total", header: "Applications", align: "right" },
          { key: "enrolled", header: "Enrolled", align: "right" },
          { key: "rejected", header: "Rejected", align: "right" },
          { key: "rate", header: "Success rate", align: "right" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: { name: r.name, total: r.total, enrolled: r.enrolled, rejected: r.rejected, rate: `${r.successPct}%` },
          csv: { name: r.name, total: String(r.total), enrolled: String(r.enrolled), rejected: String(r.rejected), rate: String(r.successPct) },
        }))}
      />
    </div>
  );
}
