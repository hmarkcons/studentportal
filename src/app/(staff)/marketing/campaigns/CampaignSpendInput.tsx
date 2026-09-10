"use client";

import { updateCampaignActualSpend } from "@/lib/actions/marketing";
import { SpendInput } from "@/components/SpendInput";

export function CampaignSpendInput({ id, actualSpend }: { id: string; actualSpend: number | null }) {
  return (
    <SpendInput
      value={actualSpend}
      onSave={(next) => updateCampaignActualSpend(id, next)}
      placeholder="Spend so far"
      className="w-24"
    />
  );
}
