import { loadMyLeave } from "@/lib/actions/leave";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { LeaveSummary } from "@/components/LeaveBits";
import { formatLeaveRange } from "@/lib/leaveEmail";
import { RequestLeaveForm } from "./RequestLeaveForm";
import { CancelLeaveButton } from "./CancelLeaveButton";

/**
 * A staff member's own leave: what they have left this leave year, a way to
 * ask for more, and what they have asked for. RLS shows them their own
 * requests and nobody else's (0272).
 */
export default async function MyLeavePage() {
  const data = await loadMyLeave();
  if (!data) return null;
  const { balance, requests } = data;

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">My leave</h2>
      <p className="mb-4 text-sm text-muted">
        Your leave year runs {formatLeaveRange(balance.year.start, balance.year.end)}. One allowance covers planned, sick and
        emergency leave; unused days lapse at the end of the year.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid leave a year" value={balance.allowance} icon="📅" />
        <StatCard label="Taken" value={balance.used} icon="🏖️" />
        <StatCard label="Left" value={balance.remaining} tone={balance.remaining > 0 ? "success" : "warning"} icon="✅" />
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Ask for leave</h3>
        <RequestLeaveForm />
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-medium text-ink">Your requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} data-leave-request={r.id} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <LeaveSummary {...r} />
                  {r.status === "pending" && <CancelLeaveButton id={r.id} />}
                </div>
                {r.reason && <p className="text-xs text-muted">{r.reason}</p>}
                {r.recordedForThem && <p className="text-xs text-muted">Recorded for you by HR.</p>}
                {r.decisionNote && <p className="text-xs text-muted">Note: “{r.decisionNote}”</p>}
                {r.certificateUrl && (
                  <a href={r.certificateUrl} target="_blank" rel="noreferrer" className="w-fit text-xs text-primary hover:underline">
                    Medical certificate
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
