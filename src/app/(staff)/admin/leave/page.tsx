import { loadLeaveAdmin } from "@/lib/actions/leave";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LeaveSummary } from "@/components/LeaveBits";
import { LEAVE_KIND_LABEL } from "@/lib/leave";
import { formatLeaveRange } from "@/lib/leaveEmail";
import { DecideButtons } from "./DecideButtons";
import { RecordLeaveForm } from "./RecordLeaveForm";

/**
 * Leave, for whoever holds leave.approve — Management and Super Admin until
 * the Role Permissions screen says otherwise. Each pending request is shown
 * as it would be approved now: how many of its days are paid and why any are
 * not, so the approver knows what the payslip will say before deciding.
 */
export default async function LeaveAdminPage() {
  const data = await loadLeaveAdmin();
  if (!data) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-muted">You don&apos;t have permission to approve leave.</p>
      </Card>
    );
  }

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Leave</h2>
      <p className="mb-4 text-sm text-muted">
        Approved leave is paid on payroll automatically; unpaid days are deducted like an absence. Nobody can decide their
        own leave.
      </p>

      <Card className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-ink">Waiting for a decision ({data.pending.length})</h3>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">No requests waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.pending.map((r) => (
              <li key={r.id} data-leave-pending={r.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.staffName}</span>
                  <span className="text-muted">
                    {LEAVE_KIND_LABEL[r.kind]} · {formatLeaveRange(r.start, r.end)} · {r.workingDays} working day
                    {r.workingDays === 1 ? "" : "s"}
                  </span>
                  {r.shortNotice && <Badge tone="warning">Less than a month&apos;s notice</Badge>}
                </div>
                <p className="text-xs text-muted">
                  If approved: <strong className="text-ink">{r.wouldBePaid} paid</strong>
                  {r.wouldBeUnpaid > 0 && (
                    <>
                      , <strong className="text-danger">{r.wouldBeUnpaid} unpaid</strong> (
                      {r.unpaidReason === "certificate" ? "no medical certificate" : "past their allowance"})
                    </>
                  )}
                  . They have {r.remainingBefore} paid day{r.remainingBefore === 1 ? "" : "s"} left.
                </p>
                {r.reason && <p className="text-xs text-muted">“{r.reason}”</p>}
                {r.certificateUrl && (
                  <a href={r.certificateUrl} target="_blank" rel="noreferrer" className="w-fit text-xs text-primary hover:underline">
                    Medical certificate
                  </a>
                )}
                {r.staffId === data.meId ? (
                  <p className="text-xs text-muted">Your own request — someone else has to decide it.</p>
                ) : (
                  <DecideButtons id={r.id} staffName={r.staffName} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Record leave for someone</h3>
        <RecordLeaveForm staff={data.staffOptions} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-ink">Balances this leave year</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-4 font-medium">Staff</th>
                <th className="py-2 pr-4 font-medium">Leave year</th>
                <th className="py-2 pr-4 font-medium">Allowance</th>
                <th className="py-2 pr-4 font-medium">Taken</th>
                <th className="py-2 font-medium">Left</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((b) => (
                <tr key={b.staffId} data-leave-balance={b.staffId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-ink">{b.name}</td>
                  <td className="py-2 pr-4 text-muted">
                    {formatLeaveRange(b.year.start, b.year.end)}
                    {!b.joinedOn && <span className="ml-1 text-warning">(no joining date — set it on their record)</span>}
                  </td>
                  <td className="py-2 pr-4">{b.allowance}</td>
                  <td className="py-2 pr-4">{b.used}</td>
                  <td className="py-2">{b.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-medium text-ink">Recently decided</h3>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.staffName}</span>
                  <LeaveSummary {...r} />
                  {r.recordedForThem && <span className="text-xs text-muted">recorded by HR</span>}
                </div>
                {r.decisionNote && <p className="text-xs text-muted">“{r.decisionNote}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
