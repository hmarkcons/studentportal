"use client";

import { useState, useTransition } from "react";
import { setLeadFollowUpDate } from "@/lib/actions/leads";
import { Input } from "@/components/ui/Input";

export function FollowUpDateCell({
  leadId,
  initialDate,
  initialNote,
  revalidateTo,
}: {
  leadId: string;
  initialDate: string | null;
  initialNote?: string | null;
  revalidateTo: string;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(nextDate: string, nextNote: string) {
    setError(null);
    startTransition(async () => {
      const result = await setLeadFollowUpDate(leadId, revalidateTo, nextDate || null, nextNote || null);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5">
      <Input
        type="date"
        value={date}
        disabled={pending}
        onChange={(e) => {
          setDate(e.target.value);
          save(e.target.value, note);
        }}
        className="w-36 text-xs"
      />
      <Input
        type="text"
        placeholder="Remark"
        value={note}
        disabled={pending}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => save(date, note)}
        className="w-36 text-xs"
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
