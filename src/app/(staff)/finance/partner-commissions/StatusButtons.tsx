"use client";

import { useState } from "react";
import { updatePartnerCommissionStatus } from "@/lib/actions/finance";
import { Select } from "@/components/ui/Input";
import { PARTNER_COMMISSION_STATUSES, PARTNER_COMMISSION_STATUS_LABELS } from "@/lib/constants";


export function StatusButtons({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (!value) return;
    setPending(true);
    setError(null);
    const result = await updatePartnerCommissionStatus(id, "/finance/partner-commissions", value);
    if (result?.error) setError(result.error);
    setPending(false);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-1">
      <Select defaultValue="" disabled={pending} onChange={handleChange} className="px-2 py-1 text-xs">
        <option value="">Change status…</option>
        {PARTNER_COMMISSION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PARTNER_COMMISSION_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
