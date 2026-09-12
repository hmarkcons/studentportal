import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { MonthSummary, PayrollAdjustment } from "@/lib/attendancePayroll";

/**
 * The month's attendance, and what it comes to.
 *
 * Shown next to the pay figures it feeds rather than as a number that simply
 * appears in the overtime box: a deduction somebody cannot trace back to the
 * days it came from is a deduction they will dispute.
 */
export function AttendanceSummaryCard({
  summary,
  money,
  scheduleConfigured,
  start,
  end,
  usesOwnHours,
  currencySymbol,
  workedLabel,
  overtimeLabel,
}: {
  summary: MonthSummary;
  money: PayrollAdjustment;
  scheduleConfigured: boolean;
  start: string | null;
  end: string | null;
  usesOwnHours: boolean;
  currencySymbol: string;
  workedLabel: string;
  overtimeLabel: string;
}) {
  const amount = (n: number) => `${currencySymbol} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  return (
    <Card className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Attendance this month</h3>
        {scheduleConfigured ? (
          <span className="text-xs text-muted">
            {start?.slice(0, 5)}–{end?.slice(0, 5)}{" "}
            {usesOwnHours ? "· their own hours" : "· office default hours"}
          </span>
        ) : (
          <Badge tone="warning">No working hours set</Badge>
        )}
      </div>

      {/* Until there are hours on file nothing can be late or absent, because
          there is nothing to be late against. Said here rather than showing
          a confident zero. */}
      {!scheduleConfigured && (
        <p className="mb-3 text-sm text-warning">
          Hours worked are counted, but nobody can be late or absent until a working day is set.{" "}
          <Link href="/setup/attendance-policy" className="underline">
            Set the office hours
          </Link>
          , or give this person their own on their staff record.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Days present" value={String(summary.daysPresent)} />
        <Figure label="Hours worked" value={workedLabel} />
        <Figure
          label="Overtime"
          value={overtimeLabel}
          detail={money.ratesConfigured ? `+ ${amount(money.overtimePay)}` : undefined}
          tone={summary.overtimeMinutes > 0 ? "success" : undefined}
        />
        <Figure
          label="Late arrivals"
          value={String(summary.lateArrivals)}
          detail={money.ratesConfigured && money.lateDeduction > 0 ? `− ${amount(money.lateDeduction)}` : undefined}
          tone={summary.lateArrivals > 0 ? "warning" : undefined}
        />
        <Figure
          label="Absent days"
          value={String(summary.absentDays)}
          detail={money.ratesConfigured && money.absentDeduction > 0 ? `− ${amount(money.absentDeduction)}` : undefined}
          tone={summary.absentDays > 0 ? "danger" : undefined}
        />
        {/* A shift nobody closed is hours nobody can count — not zero hours,
            and not a full day either. It is shown so it can be corrected. */}
        {summary.unclosedShifts > 0 && (
          <Figure
            label="Never clocked out"
            value={String(summary.unclosedShifts)}
            detail="not counted as hours"
            tone="danger"
          />
        )}
      </div>

      {!money.ratesConfigured && (
        <p className="mt-3 text-xs text-muted">
          No rates are set, so none of this is added to or taken off the payslip yet.{" "}
          <Link href="/setup/attendance-policy" className="text-primary hover:underline">
            Set what overtime, lateness and absence are worth
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  );
}
