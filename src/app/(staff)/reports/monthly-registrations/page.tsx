import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function MonthlyRegistrationsPage() {
  const supabase = await createClient();

  const { data: counselors } = await supabase.from("staff").select("id, full_name").eq("role", "counselor");
  const { data: leads } = await supabase.from("leads").select("assigned_counselor_id, registered_at").not("registered_at", "is", null);

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: monthKey(d), label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }) };
  });

  const counts = new Map<string, number>(); // `${counselorId}:${monthKey}`
  (leads ?? []).forEach((l) => {
    if (!l.assigned_counselor_id || !l.registered_at) return;
    const key = `${l.assigned_counselor_id}:${monthKey(new Date(l.registered_at))}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Monthly Registrations by Counselor</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Counselor</th>
              {months.map((m) => (
                <th key={m.key} className="px-4 py-3 text-right">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(counselors ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{c.full_name}</td>
                {months.map((m) => (
                  <td key={m.key} className="px-4 py-3 text-right tabular-nums">
                    {counts.get(`${c.id}:${m.key}`) ?? 0}
                  </td>
                ))}
              </tr>
            ))}
            {(!counselors || counselors.length === 0) && (
              <tr>
                <td colSpan={months.length + 1} className="px-4 py-10 text-center text-muted">
                  No counselors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
