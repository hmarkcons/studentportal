"use client";

import { useState, useTransition } from "react";
import { setLeadFollowUpDate } from "@/lib/actions/leads";
import { Input } from "@/components/ui/Input";

export function FollowUpDateCell({
  leadId,
  initialDate,
  revalidateTo,
}: {
  leadId: string;
  initialDate: string | null;
  revalidateTo: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await setLeadFollowUpDate(leadId, revalidateTo, value || null);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5">
      <Input
        type="date"
        defaultValue={initialDate ?? ""}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="w-36 text-xs"
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
