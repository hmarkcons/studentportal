"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clockInOut } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { punchTime } from "@/lib/attendance";
import type { ActionResultLike } from "@/lib/actionStatus";

/**
 * Clock in / clock out, showing which of the two you actually are.
 *
 * The pair used to be two buttons with no state at all: nothing on the page
 * said whether you were currently clocked in, and pressing the wrong one
 * reported success while doing nothing. The open shift now comes from the
 * page, so the button that cannot apply is disabled and the one that can is
 * the obvious one.
 */
export function ClockButtons({ openSince }: { openSince: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"in" | "out" | null>(null);
  // Which button last did what it says, kept as one object per result so the
  // status beside it can tell this punch from the next.
  const [done, setDone] = useState<{ action: "in" | "out"; state: ActionResultLike } | null>(null);

  async function handle(action: "in" | "out") {
    setPending(action);
    setError(null);
    setNotice(null);
    setDone(null);
    const result = await clockInOut(action);
    if (result?.error) setError(result.error);
    else {
      // "in"/"out" get "Clocked in." / "Clocked out." beside the button; the
      // other outcomes are the ones worth spelling out, because nothing was
      // punched and a confirmation would claim otherwise.
      if (result?.outcome && result.outcome !== "in" && result.outcome !== "out") {
        setNotice(result.message ?? null);
      } else {
        setDone({ action, state: { success: true } });
      }
      router.refresh();
    }
    setPending(null);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink">
        {openSince ? (
          <>
            Clocked in since <span className="font-medium">{punchTime(openSince)}</span>
          </>
        ) : (
          "Not clocked in."
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => handle("in")}
          variant="primary"
          pending={pending === "in"}
          disabled={Boolean(openSince)}
          status={{ state: done?.action === "in" ? done.state : undefined, label: "Clocked in." }}
        >
          Clock In
        </Button>
        <Button
          onClick={() => handle("out")}
          pending={pending === "out"}
          disabled={!openSince}
          status={{ state: done?.action === "out" ? done.state : undefined, label: "Clocked out." }}
        >
          Clock Out
        </Button>
      </div>
      {notice && <p className="mt-1 text-xs text-warning">{notice}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
