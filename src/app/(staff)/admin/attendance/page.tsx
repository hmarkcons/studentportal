import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ClockButtons } from "./ClockButtons";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AttendancePage() {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("attendance_records")
    .select("id, work_date, clock_in, clock_out, late_flag, staff:staff(full_name)")
    .order("work_date", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Attendance</h2>
      <Card className="mb-6">
        <ClockButtons />
        <p className="mt-2 text-xs text-muted">QR code and biometric check-in are schema-ready but not wired up yet — button clock-in/out only for now.</p>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock in</th>
              <th className="px-4 py-3">Clock out</th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{one(r.staff)?.full_name}</td>
                <td className="px-4 py-3">{new Date(r.work_date).toLocaleDateString()}</td>
                <td className="px-4 py-3">{r.clock_in ? new Date(r.clock_in).toLocaleTimeString() : "—"}</td>
                <td className="px-4 py-3">{r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : "—"}</td>
              </tr>
            ))}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No attendance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
