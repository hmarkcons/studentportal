import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { ClockButtons } from "./ClockButtons";
import { RotateQrButton } from "./RotateQrButton";
import { hasPermission } from "@/lib/auth/permissions";

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

  const { data: qr } = await supabase.from("office_qr_tokens").select("token").eq("id", true).maybeSingle();
  const canAdminQr = await hasPermission("attendance.qr_admin");

  let qrImage: string | null = null;
  let checkinUrl: string | null = null;
  if (canAdminQr && qr) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    checkinUrl = `${origin}/attendance/checkin?token=${qr.token}`;
    qrImage = await QRCode.toDataURL(checkinUrl, { margin: 1, width: 220 });
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Attendance</h2>
      <Card className="mb-6">
        <ClockButtons />
        <p className="mt-2 text-xs text-muted">
          Biometric check-in is schema-ready but not wired up (hardware purchase pending, per the doc).
        </p>
      </Card>

      {qrImage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Office QR code</h3>
          <p className="mb-3 text-xs text-muted">
            Print this and post it at the office entrance. Staff scan it on arrival/departure to clock in/out —
            tied to whichever account they&apos;re logged into on their phone.
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
                <td className="px-4 py-3">{formatDateOnly(r.work_date)}</td>
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
