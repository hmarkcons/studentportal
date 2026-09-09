import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { buildLeadOwners, ownerKey, karachiMonthKey, recentMonths } from "@/lib/leadOwners";
import { STAFF_ROLE_LABELS } from "@/lib/constants";

export default async function MonthlyRegistrationsPage() {
  const { supabase } = await requireReportAccess("/reports/monthly-registrations");

  // Everyone who holds leads, not only role='counselor' — 11 of the 17
  // registrations on file belong to management, super_admin or
  // digital_marketing staff and were absent from this grid entirely. See
  // buildLeadOwners.
  const { data: staff } = await supabase.from("staff").select("id, full_name, role, status, monthly_target");
  const { data: leads } = await supabase
    .from("leads")
    .select("assigned_counselor_id, registered_at")
    .not("registered_at", "is", null);

  const owners = buildLeadOwners(staff ?? [], leads ?? []);
  const months = recentMonths(6);

  // Keyed on the Karachi month: this used getMonth() on the server's clock,
  // which is UTC, so a student registered before 5am Karachi time landed in
  // the previous month.
  const counts = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  for (const l of leads ?? []) {
    if (!l.registered_at) continue;
    const month = karachiMonthKey(l.registered_at);
    counts.set(`${ownerKey(l)}:${month}`, (counts.get(`${ownerKey(l)}:${month}`) ?? 0) + 1);
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + 1);
  }

  const noteFor = (o: (typeof owners)[number]) =>
    o.isUnassigned
      ? "nobody assigned"
      : [o.isOtherRole && o.role ? (STAFF_ROLE_LABELS[o.role as never] ?? o.role) : null, o.isInactive ? "no longer active" : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-1 text-lg font-semibold text-ink">Monthly Registrations by Counselor</h2>
      <p className="mb-4 text-sm text-muted">
        Months run to Karachi time, and every row that holds a registration is shown &mdash; including staff who are not
        counselors by role, and anyone who has since left, so past months keep the totals they had.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Assigned to</th>
              {months.map((m) => (
                <th key={m.key} className="px-4 py-3 text-right">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => {
              const note = noteFor(o);
              return (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {o.name}
                    {note && <span className="ml-1 text-xs text-muted">— {note}</span>}
                  </td>
                  {months.map((m) => (
                    <td key={m.key} className="px-4 py-3 text-right tabular-nums">
                      {counts.get(`${o.id}:${m.key}`) ?? 0}
                    </td>
                  ))}
                </tr>
              );
            })}
            {owners.length === 0 && (
              <tr>
                <td colSpan={months.length + 1} className="px-4 py-10 text-center text-muted">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
          {owners.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-bg text-xs font-medium uppercase tracking-wide text-muted">
                <td className="px-4 py-3">All</td>
                {months.map((m) => (
                  <td key={m.key} className="px-4 py-3 text-right tabular-nums">
                    {monthTotals.get(m.key) ?? 0}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
