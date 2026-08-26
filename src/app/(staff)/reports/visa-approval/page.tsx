import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function VisaApprovalPage() {
  const supabase = await createClient();

  const { data: visaRecords } = await supabase
    .from("visa_records")
    .select("outcome, application:applications(university:universities(destination:destinations(display_name)))");

  const byDestination = new Map<string, { approved: number; rejected: number; rfe: number; pending: number }>();
  (visaRecords ?? []).forEach((v) => {
    const app = one(v.application);
    const uni = app ? one(app.university as never) : null;
    const dest = uni ? one((uni as { destination?: unknown }).destination as never) : null;
    const key = (dest as { display_name?: string } | null)?.display_name ?? "Unknown";
    const entry = byDestination.get(key) ?? { approved: 0, rejected: 0, rfe: 0, pending: 0 };
    if (v.outcome === "approved") entry.approved += 1;
    else if (v.outcome === "rejected") entry.rejected += 1;
    else if (v.outcome === "rfe") entry.rfe += 1;
    else entry.pending += 1;
    byDestination.set(key, entry);
  });

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Visa Approval Rate by Country</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Rejected</th>
              <th className="px-4 py-3">RFE</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3 text-right">Approval rate</th>
            </tr>
          </thead>
          <tbody>
            {[...byDestination.entries()].map(([name, v]) => {
              const decided = v.approved + v.rejected;
              const rate = decided ? Math.round((v.approved / decided) * 100) : null;
              return (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3">
                    <Badge tone="success">{v.approved}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="danger">{v.rejected}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="warning">{v.rfe}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{v.pending}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{rate === null ? "—" : `${rate}%`}</td>
                </tr>
              );
            })}
            {byDestination.size === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No visa records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
