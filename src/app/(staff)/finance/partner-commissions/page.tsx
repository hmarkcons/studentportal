import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { StatusButtons } from "./StatusButtons";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  received: "success",
  pending: "warning",
  not_yet_due: "neutral",
  partially_received: "warning",
  overdue: "danger",
  disputed: "danger",
};

export default async function PartnerCommissionsPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("partner_commissions")
    .select("id, paid_fee, expected_amount, currency, status, student:leads(full_name), application:applications(university:universities(name))");

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Partner Commissions</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">University</th>
              <th className="px-4 py-3 text-right">Expected</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const app = one(r.application);
              const uni = app ? one(app.university as never) : null;
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{one(r.student)?.full_name}</td>
                  <td className="px-4 py-3">{(uni as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.currency} {r.expected_amount ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusButtons id={r.id} />
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No partner commission records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
