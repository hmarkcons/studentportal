"use client";

import { useState } from "react";
import { updateAdCampaignActualSpend } from "@/lib/actions/marketing";
import { Input } from "@/components/ui/Input";

export function ActualSpendInput({ id, actualSpend }: { id: string; actualSpend: number | null }) {
  const [value, setValue] = useState(actualSpend?.toString() ?? "");

  return (
    <Input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== "" && updateAdCampaignActualSpend(id, Number(value))}
      placeholder="Actual spend"
      className="w-28"
    />
  );
}
