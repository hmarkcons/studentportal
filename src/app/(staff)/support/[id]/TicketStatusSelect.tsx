"use client";

import { useState } from "react";
import { useButtonAction } from "@/components/useButtonAction";
import { ActionStatus } from "@/components/ActionStatus";
import { updateTicketStatus } from "@/lib/actions/support";
import { Select } from "@/components/ui/Input";

export function TicketStatusSelect({ ticketId, status, revalidateTo }: { ticketId: string; status: string; revalidateTo: string }) {
  const [value, setValue] = useState(status);
  // Saves as it changes, so the confirmation — or the refusal — sits beside
  // it. Disabled while saving: a second change made mid-save would show on
  // screen and never be sent.
  const save = useButtonAction();

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    const result = await save.run(() => updateTicketStatus(ticketId, revalidateTo, next));
    if (result?.error) setValue(previous);
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <Select value={value} disabled={save.pending} onChange={(e) => handleChange(e.target.value)} className="text-xs">
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
      </Select>
      <ActionStatus state={save.state} pending={save.pending} label="Saved." showError />
    </div>
  );
}
