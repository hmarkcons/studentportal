import { Badge } from "@/components/ui/Badge";
import { LEAVE_KIND_LABEL, type LeaveKind } from "@/lib/leave";
import { formatLeaveRange } from "@/lib/leaveEmail";

export const STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;
export const STATUS_LABEL = { pending: "Waiting for approval", approved: "Approved", rejected: "Not approved", cancelled: "Withdrawn" } as const;

/** One line of leave: kind, dates, status and — once decided — how much of it is paid. */
export function LeaveSummary({
  kind,
  start,
  end,
  status,
  paidDays,
  unpaidDays,
}: {
  kind: LeaveKind;
  start: string;
  end: string;
  status: keyof typeof STATUS_TONE;
  paidDays: number;
  unpaidDays: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-ink">{LEAVE_KIND_LABEL[kind]}</span>
      <span className="text-muted">{formatLeaveRange(start, end)}</span>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      {status === "approved" && (
        <span className="text-xs text-muted">
          {paidDays} paid{unpaidDays ? ` · ${unpaidDays} unpaid` : ""}
        </span>
      )}
    </div>
  );
}
