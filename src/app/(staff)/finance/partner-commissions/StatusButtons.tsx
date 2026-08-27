"use client";

import { updatePartnerCommissionStatus } from "@/lib/actions/finance";
import { Select } from "@/components/ui/Input";

const STATUSES = ["not_yet_due", "pending", "received", "partially_received", "overdue", "disputed"];

export function StatusButtons({ id }: { id: string }) {
  return (
    <Select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) updatePartnerCommissionStatus(id, "/finance/partner-commissions", e.target.value);
      }}
      className="px-2 py-1 text-xs"
    >
      <option value="">Change status…</option>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
