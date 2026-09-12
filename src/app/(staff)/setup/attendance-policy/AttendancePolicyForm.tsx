"use client";

import { useActionState } from "react";
import { updateAttendancePolicy } from "@/lib/actions/attendancePolicy";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export type PolicyRow = {
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[];
  grace_minutes: number;
  overtime_rate_per_hour: number;
  late_deduction: number;
  absent_deduction: number;
};

/** A "09:00:00" from Postgres is "09:00" to a time input. */
const forInput = (t: string | null) => (t ? t.slice(0, 5) : "");

export function AttendancePolicyForm({ policy }: { policy: PolicyRow }) {
  const [state, formAction, pending] = useActionState(updateAttendancePolicy, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">Default working hours</h3>
        <p className="text-xs text-muted">
          Hours differ per person, so these are the hours anybody without their own schedule is held to — a new joiner
          is covered without anybody filling in a form. Set one person&rsquo;s own hours on their staff record.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Starts
            <Input name="work_start_time" type="time" defaultValue={forInput(policy.work_start_time)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Ends
            <Input name="work_end_time" type="time" defaultValue={forInput(policy.work_end_time)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Grace before &ldquo;late&rdquo; (minutes)
            <Input name="grace_minutes" type="number" min="0" max="240" defaultValue={policy.grace_minutes} className="w-28" />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Working days</span>
          <div className="flex flex-wrap gap-3">
            {DAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" name="work_days" value={d.value} defaultChecked={policy.work_days.includes(d.value)} />
                {d.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            A working day with no attendance record at all counts as an absence — but never today, and never a day off.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-ink">What it is worth</h3>
        <p className="text-xs text-muted">
          In each staff member&rsquo;s own currency. Every rate starts at zero and nothing is added to or taken off a
          payslip until you set it — the payroll counts the hours either way and says the rates are unset.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Overtime, per hour
            <Input
              name="overtime_rate_per_hour"
              type="number"
              step="0.01"
              min="0"
              defaultValue={policy.overtime_rate_per_hour}
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Deduction per late arrival
            <Input name="late_deduction" type="number" step="0.01" min="0" defaultValue={policy.late_deduction} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Deduction per absent day
            <Input name="absent_deduction" type="number" step="0.01" min="0" defaultValue={policy.absent_deduction} className="w-32" />
          </label>
        </div>
        <p className="text-xs text-muted">
          Overtime is time past the end of that person&rsquo;s own day, paid to the minute rather than rounded up to the
          hour. A shift nobody clocked out of earns none: the time they left is not recorded anywhere.
        </p>
      </section>

      <div>
        {state?.error && <p className="mb-1 text-xs text-danger">{state.error}</p>}
        {state?.success && <p className="mb-1 text-xs text-success">Saved.</p>}
        <Button type="submit" variant="primary" pending={pending}>
          Save policy
        </Button>
      </div>
    </form>
  );
}
