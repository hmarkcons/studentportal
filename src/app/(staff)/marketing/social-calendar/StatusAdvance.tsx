"use client";

import { advanceSocialPostStatus } from "@/lib/actions/marketing";
import { Select } from "@/components/ui/Input";

const STATUSES = ["brief_sent", "in_design", "ready_for_review", "approved", "scheduled", "posted"];

export function StatusAdvance({ id, status }: { id: string; status: string }) {
  return (
    <Select
      defaultValue={status}
      onChange={(e) => advanceSocialPostStatus(id, e.target.value)}
      className="text-xs"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
