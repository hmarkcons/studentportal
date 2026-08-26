import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentTurnaroundPage() {
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("student_documents")
    .select("category, created_at, verified_at")
    .not("verified_at", "is", null);

  const byCategory = new Map<string, { totalDays: number; count: number }>();
  (docs ?? []).forEach((d) => {
    const key = d.category ?? "other";
    const days = (new Date(d.verified_at!).getTime() - new Date(d.created_at).getTime()) / 86_400_000;
    const entry = byCategory.get(key) ?? { totalDays: 0, count: 0 };
    entry.totalDays += days;
    entry.count += 1;
    byCategory.set(key, entry);
  });

  const rows = [...byCategory.entries()].map(([category, v]) => ({
    category,
    avgDays: v.count ? Math.round((v.totalDays / v.count) * 10) / 10 : 0,
    count: v.count,
  }));

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Document Turnaround Time</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Avg. days to verify</th>
              <th className="px-4 py-3 text-right">Verified count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{r.category.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.avgDays}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">
                  No verified documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
