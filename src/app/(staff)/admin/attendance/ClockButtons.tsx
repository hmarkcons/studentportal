"use client";

import { clockInOut } from "@/lib/actions/admin";

export function ClockButtons() {
  return (
    <div className="flex gap-2">
      <button onClick={() => clockInOut("in")} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
        Clock In
      </button>
      <button onClick={() => clockInOut("out")} className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-bg">
        Clock Out
      </button>
    </div>
  );
}
