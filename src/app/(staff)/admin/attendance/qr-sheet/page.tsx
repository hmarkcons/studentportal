import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

/**
 * The sheet that goes on the wall by the door.
 *
 * The attendance page has always shown the code, at 220px, between a clock-in
 * button and a month of records — printing that gives a thumbnail surrounded by
 * a table. Rotating the token invalidates every printed copy, and the page said
 * "reprint after you do" without there being anything to print.
 *
 * So: one page, one code, big enough to scan from arm's length, and everything
 * that is not the code hidden when it prints.
 */
export default async function QrSheetPage() {
  const supabase = await createClient();
  // Same gate as the code itself. Anyone who can read the token can clock in
  // from anywhere in the world, which is what 0157 was about.
  if (!(await hasPermission("attendance.qr_admin"))) redirect("/admin/attendance");

  const { data: qr } = await supabase.from("office_qr_tokens").select("token, updated_at").eq("id", true).maybeSingle();
  if (!qr) redirect("/admin/attendance");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const checkinUrl = `${origin}/attendance/checkin?token=${qr.token}`;

  // Large and high-correction: this is read from a phone at arm's length, on
  // paper that will be handled, in whatever light the doorway has.
  const qrImage = await QRCode.toDataURL(checkinUrl, { margin: 1, width: 900, errorCorrectionLevel: "H" });

  const rotated = new Date(qr.updated_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
  // Enough of the token to tell two printouts apart without putting the whole
  // secret on a wall — a sheet whose code does not match the one on screen is
  // the stale one.
  const fingerprint = String(qr.token).slice(0, 6).toUpperCase();

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/admin/attendance" className="text-sm text-primary hover:underline">
          ← Back to attendance
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-lg border border-border bg-card p-8 text-center print:max-w-none print:border-0 print:p-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/hmark-logo.png" alt="HMARK Consultants" className="mb-6 h-12 w-auto" />

        <h1 className="text-3xl font-bold tracking-tight text-ink">Scan to clock in or out</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Point your phone camera at the code. You must be signed in to the portal on your phone — it records the time
          against your own account.
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, not a file next/image can optimise */}
        <img
          src={qrImage}
          alt="Office check-in QR code"
          className="my-8 h-auto w-full max-w-md print:max-w-lg"
        />

        <ol className="mb-6 max-w-md text-left text-sm text-ink">
          <li className="mb-1">1. Open the camera on your phone.</li>
          <li className="mb-1">2. Point it at the code and tap the link.</li>
          <li className="mb-1">3. Sign in if you are asked to.</li>
          <li>4. The screen confirms the time it recorded.</li>
        </ol>

        {/* On the sheet itself, so a stale printout can be spotted on the wall
            rather than after somebody fails to clock in. */}
        <p className="text-xs text-muted">
          Code {fingerprint} · issued {rotated}
        </p>
        <p className="mt-1 text-xs text-muted">
          If this code stops working it has been replaced — print the current one from Admin &rsaquo; Attendance.
        </p>
      </div>
    </div>
  );
}
