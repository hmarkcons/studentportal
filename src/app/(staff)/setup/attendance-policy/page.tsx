import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { hasPermission } from "@/lib/auth/permissions";
import { AttendancePolicyForm, type PolicyRow } from "./AttendancePolicyForm";

export default async function AttendancePolicyPage() {
  const supabase = await createClient();
  const canEdit = await hasPermission("attendance.qr_admin");

  const { data: policy } = await supabase
    .from("attendance_policy")
    .select("work_start_time, work_end_time, work_days, grace_minutes, overtime_rate_per_hour, late_deduction, absent_deduction")
    .eq("id", true)
    .maybeSingle();

  const row: PolicyRow = {
    work_start_time: policy?.work_start_time ?? null,
    work_end_time: policy?.work_end_time ?? null,
    work_days: policy?.work_days ?? [1, 2, 3, 4, 5, 6],
    grace_minutes: policy?.grace_minutes ?? 15,
    overtime_rate_per_hour: Number(policy?.overtime_rate_per_hour ?? 0),
    late_deduction: Number(policy?.late_deduction ?? 0),
    absent_deduction: Number(policy?.absent_deduction ?? 0),
  };

  const configured = Boolean(row.work_start_time && row.work_end_time);

  return (
    <div className="w-full max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Attendance policy</h2>
      <p className="mb-4 text-sm text-muted">
        What a working day is, and what late, absent and overtime are worth on a payslip.
      </p>

      {/* Said plainly rather than left to be discovered on a payslip: until
          the hours are set, nothing can be late or absent, because there is
          nothing to be late against. */}
      {!configured && (
        <Card className="mb-4 bg-warning-bg">
          <p className="text-sm font-medium text-warning">No working hours set yet</p>
          <p className="mt-1 text-sm text-warning">
            Attendance is being recorded, but until there are hours on file nobody can be counted late or absent —
            there is nothing to be late against. Set the office default below, then give anybody on different hours
            their own on their staff record.
          </p>
        </Card>
      )}

      <Card>
        {canEdit ? (
          <AttendancePolicyForm policy={row} />
        ) : (
          <p className="text-sm text-muted">
            Only Super Admin can change the attendance policy. The office day is{" "}
            {configured ? `${row.work_start_time?.slice(0, 5)}–${row.work_end_time?.slice(0, 5)}` : "not set yet"}.
          </p>
        )}
      </Card>
    </div>
  );
}
