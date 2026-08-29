"use client";

import { useState } from "react";
import { updateAdCampaignActualSpend } from "@/lib/actions/marketing";
import { Input } from "@/components/ui/Input";

export function ActualSpendInput({ id, actualSpend }: { id: string; actualSpend: number | null }) {
  const [value, setValue] = useState(actualSpend?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleBlur() {
    if (value === "") return;
    setError(null);
    const result = await updateAdCampaignActualSpend(id, Number(value));
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Actual spend"
        className="w-28"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
