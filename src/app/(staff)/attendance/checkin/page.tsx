"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { checkinViaQr } from "@/lib/actions/admin";

type Status = "checking" | "in" | "out" | "invalid_token" | "not_staff" | "error";

const MESSAGES: Record<Exclude<Status, "checking">, string> = {
  in: "Clocked in. Have a great day!",
  out: "Clocked out. See you tomorrow!",
  invalid_token: "This QR code is no longer valid — ask a Super Admin to reprint it.",
  not_staff: "This login isn't an active staff account, so it can't be used to clock in.",
  error: "Something went wrong recording your attendance — please try scanning again.",
};

export default function OfficeCheckinPage() {
  return (
    <Suspense>
      <CheckinRunner />
    </Suspense>
  );
}

function CheckinRunner() {
  const token = useSearchParams().get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "checking" : "invalid_token");

  useEffect(() => {
    if (!token) return;
    checkinViaQr(token).then((r) => setStatus(r.status));
  }, [token]);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-ink">Office Check-in</h2>
      <p className="text-sm text-muted">{status === "checking" ? "Recording your attendance…" : MESSAGES[status]}</p>
      <Link href="/admin/attendance" className="text-sm text-primary hover:underline">
        View attendance
      </Link>
    </div>
  );
}
