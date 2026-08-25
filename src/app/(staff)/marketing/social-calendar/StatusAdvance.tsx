"use client";

import { advanceSocialPostStatus } from "@/lib/actions/marketing";

const STATUSES = ["brief_sent", "in_design", "ready_for_review", "approved", "scheduled", "posted"];

export function StatusAdvance({ id, status }: { id: string; status: string }) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => advanceSocialPostStatus(id, e.target.value)}
      className="rounded-md border border-border px-2 py-1 text-xs"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
