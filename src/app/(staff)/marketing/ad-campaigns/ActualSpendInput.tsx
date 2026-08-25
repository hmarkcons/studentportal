"use client";

import { useState } from "react";
import { updateAdCampaignActualSpend } from "@/lib/actions/marketing";

export function ActualSpendInput({ id, actualSpend }: { id: string; actualSpend: number | null }) {
  const [value, setValue] = useState(actualSpend?.toString() ?? "");

  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== "" && updateAdCampaignActualSpend(id, Number(value))}
      placeholder="Actual spend"
      className="w-28 rounded-md border border-border px-2 py-1 text-xs"
    />
  );
}
