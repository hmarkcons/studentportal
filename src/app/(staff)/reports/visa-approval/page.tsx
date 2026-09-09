import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { Badge } from "@/components/ui/Badge";
import { listVisaDecisions } from "@/lib/visaDecisions";

// Counts come from the tracker's visa outcome field, the same value the
// student's Visa tab reads. This used to read visa_records, which holds no
// rows, so the table was permanently empty.
//
// There is no RFE column any more: the decision is read as approved, refused
// or pending (see readVisaDecision), and a column that could only ever show
// zero is worse than no column.

export default async function VisaApprovalPage() {
  const { supabase } = await requireReportAccess("/reports/visa-approval");
  const decisions = await listVisaDecisions(supabase);

  const byDestination = new Map<string, { approved: number; refused: number; pending: number }>();
  for (const d of decisions) {
    const entry = byDestination.get(d.destination) ?? { approved: 0, refused: 0, pending: 0 };
    if (d.decision === "approved") entry.approved += 1;
    else if (d.decision === "refused") entry.refused += 1;
    else entry.pending += 1;
    byDestination.set(d.destination, entry);
  }

  // Busiest first, so the countries the numbers actually say something about
  // are at the top.
  const rows = [...byDestination.entries()].sort(
    (a, b) => b[1].approved + b[1].refused - (a[1].approved + a[1].refused)
  );

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-1 text-lg font-semibold text-ink">Visa Approval Rate by Country</h2>
      <p className="mb-4 text-sm text-muted">
        Recorded outcomes per destination. The rate counts decided applications only — pending ones are shown but not
        included, so one early refusal in a new country doesn&rsquo;t read as a 0% approval rate.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Refused</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3 text-right">Approval rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, v]) => {
              const decided = v.approved + v.refused;
              const rate = decided ? Math.round((v.approved / decided) * 100) : null;
              return (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3">
                    <Badge tone="success">{v.approved}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="danger">{v.refused}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{v.pending}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {rate === null ? (
                      <span className="text-muted" title="No decided applications yet">
                        —
                      </span>
                    ) : (
                      `${rate}%`
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No visa outcomes recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
