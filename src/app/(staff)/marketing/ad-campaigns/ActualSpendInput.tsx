"use client";

import { updateAdCampaignActualSpend } from "@/lib/actions/marketing";
import { SpendInput } from "@/components/SpendInput";

export function ActualSpendInput({ id, actualSpend }: { id: string; actualSpend: number | null }) {
  return <SpendInput value={actualSpend} onSave={(next) => updateAdCampaignActualSpend(id, next)} />;
}
