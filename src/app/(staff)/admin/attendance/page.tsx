import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClockButtons } from "./ClockButtons";
import { RotateQrButton } from "./RotateQrButton";
import { StaffFilter } from "./StaffFilter";
import { hasPermission } from "@/lib/auth/permissions";
import {
  punchTime,
  officeToday,
  monthOf,
  monthBounds,
  shiftMinutes,
  formatDuration,
  clockOutLabel,
  totalMinutes,
} from "@/lib/attendance";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const TONE_CLASS: Record<"normal" | "open" | "missing", string> = {
  normal: "text-ink",
  open: "text-primary",
  missing: "text-danger",
};

export default async function AttendancePage(props: { searchParams: Promise<{ month?: string; staff?: string }> }) {
  const { month: monthParam, staff: staffParam } = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A month at a time, rather than "the last 100 rows whoever they belong to".
  // With twenty staff and twenty-two working days a month, a flat hundred-row
  // limit showed about five days and there was no way to reach anything older —
  // an attendance record you cannot look back through is not one.
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : monthOf(officeToday());
  const { start, end } = monthBounds(month);

  let query = supabase
    .from("attendance_records")
    .select("id, staff_id, work_date, clock_in, clock_out, clock_out_missing, method, staff:staff(full_name)")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: false })
    .order("clock_in", { ascending: false });
  if (staffParam) query = query.eq("staff_id", staffParam);
  const { data: records } = await query;

  // Only the roles whose policy returns other people's rows get a staff
  // filter; for everyone else the list is their own by definition and a
  // one-name dropdown would be furniture.
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const seesEveryone = staffRow?.role === "super_admin" || staffRow?.role === "management";
  const { data: staffList } = seesEveryone
    ? await supabase.from("staff").select("id, full_name").eq("status", "active").order("full_name")
    : { data: null };

  const rows = records ?? [];
  const openShift = rows.find((r) => r.staff_id === user?.id && !r.clock_out && !r.clock_out_missing);

  const canAdminQr = await hasPermission("attendance.qr_admin");
  let qrImage: string | null = null;
  let checkinUrl: string | null = null;
  if (canAdminQr) {
    // Read only when it is going to be rendered. It used to be fetched on every
    // visit by every role, and the policy let all of them have it.
    const { data: qr } = await supabase.from("office_qr_tokens").select("token").eq("id", true).maybeSingle();
    if (qr) {
      const h = await headers();
      const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
      checkinUrl = `${origin}/attendance/checkin?token=${qr.token}`;
      qrImage = await QRCode.toDataURL(checkinUrl, { margin: 1, width: 220 });
    }
  }

  const monthTotal = totalMinutes(rows);
  const missing = rows.filter((r) => r.clock_out_missing).length;

  // Twelve months back is enough to reach any month anybody would ask about,
  // and short enough to stay a dropdown.
  const months: string[] = [];
  {
    const [y, m] = officeToday().split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Attendance</h2>
      <Card className="mb-6">
        <ClockButtons openSince={openShift?.clock_in ?? null} />
        <p className="mt-2 text-xs text-muted">
          Biometric check-in is schema-ready but not wired up (hardware purchase pending, per the doc).
        </p>
      </Card>

      {qrImage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Office QR code</h3>
          <p className="mb-3 text-xs text-muted">
            Print this and post it at the office entrance. Staff scan it on arrival/departure to clock in/out —
            tied to whichever account they&apos;re logged into on their phone. Only Super Admin can see this code;
            rotating it invalidates every printed copy, so reprint after you do.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImage} alt="Office check-in QR code" width={220} height={220} className="rounded-md border border-border" />
            <div className="flex flex-col gap-2">
              <p className="max-w-xs break-all text-xs text-muted">{checkinUrl}</p>
              <RotateQrButton />
            </div>
          </div>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Month</span>
          <div className="flex flex-wrap gap-1">
            {months.slice(0, 6).map((m) => (
              <Link
                key={m}
                href={`/admin/attendance?month=${m}${staffParam ? `&staff=${staffParam}` : ""}`}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  m === month ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"
                }`}
              >
                {formatDateOnly(`${m}-01`, { month: "short", year: "numeric" })}
              </Link>
            ))}
          </div>
        </div>
        {seesEveryone && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Staff</span>
            <StaffFilter staffList={staffList ?? []} selected={staffParam ?? ""} month={month} />
          </div>
        )}
        <p className="text-xs text-muted">
          {rows.length} {rows.length === 1 ? "shift" : "shifts"} · {formatDuration(monthTotal)} recorded
          {missing > 0 && (
            <>
              {" · "}
              <span className="text-danger">
                {missing} never clocked out
              </span>
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Clock in</th>
              <th className="px-4 py-3">Clock out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Method</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const out = clockOutLabel(r);
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{one(r.staff)?.full_name}</td>
                  <td className="px-4 py-3">{formatDateOnly(r.work_date)}</td>
                  {/* Karachi. These printed in the server's timezone — UTC on
                      Vercel — so every arrival read five hours early and a
                      9:00am clock-in showed as 4:00:00 AM. */}
                  <td className="px-4 py-3">{punchTime(r.clock_in)}</td>
                  <td className={`px-4 py-3 ${TONE_CLASS[out.tone]}`}>{out.text}</td>
                  <td className="px-4 py-3">{formatDuration(shiftMinutes(r))}</td>
                  <td className="px-4 py-3">
                    <Badge tone={r.method === "qr" ? "info" : "neutral"}>{r.method}</Badge>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No attendance recorded for {formatDateOnly(`${month}-01`, { month: "long", year: "numeric" })}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
