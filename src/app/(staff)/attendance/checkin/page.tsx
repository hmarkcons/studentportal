"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { checkinViaQr } from "@/lib/actions/admin";

type Status = "checking" | "in" | "out" | "already_in" | "not_in" | "invalid_token" | "not_staff" | "error";

// The wording for the ordinary outcomes. Anything the database has something
// specific to say about — "you are already clocked in since 9:04 AM" — uses
// that instead, since it carries the time.
const MESSAGES: Record<Exclude<Status, "checking">, string> = {
  in: "Clocked in. Have a great day!",
  out: "Clocked out. See you tomorrow!",
  already_in: "You were already clocked in — nothing has changed.",
  not_in: "You were not clocked in, so there was nothing to clock out of.",
  invalid_token: "This QR code is no longer valid — ask a Super Admin to reprint it.",
  not_staff: "This login isn't an active staff account, so it can't be used to clock in.",
  error: "Something went wrong recording your attendance — please try scanning again.",
};

const TONE: Record<Exclude<Status, "checking">, string> = {
  in: "text-success",
  out: "text-ink",
  already_in: "text-warning",
  not_in: "text-warning",
  invalid_token: "text-danger",
  not_staff: "text-danger",
  error: "text-danger",
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
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    checkinViaQr(token).then((r) => {
      setStatus(r.status);
      setDetail(r.detail ?? null);
    });
  }, [token]);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-ink">Office Check-in</h2>
      {status === "checking" ? (
        <p className="text-sm text-muted">Recording your attendance…</p>
      ) : (
        <>
          <p className={`text-sm font-medium ${TONE[status]}`}>{MESSAGES[status]}</p>
          {/* Only when it adds something the line above does not, which for
              "already clocked in" is the time it happened. */}
          {detail && status === "already_in" && <p className="text-xs text-muted">{detail}</p>}
        </>
      )}
      <Link href="/admin/attendance" className="text-sm text-primary hover:underline">
        View attendance
      </Link>
    </div>
  );
}
