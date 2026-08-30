"use client";

import { useState } from "react";
import { updateTicketStatus } from "@/lib/actions/support";
import { Select } from "@/components/ui/Input";

export function TicketStatusSelect({ ticketId, status, revalidateTo }: { ticketId: string; status: string; revalidateTo: string }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    const result = await updateTicketStatus(ticketId, revalidateTo, next);
    if (result?.error) {
      setError(result.error);
      setValue(previous);
    }
  }

  return (
    <div>
      <Select value={value} onChange={(e) => handleChange(e.target.value)} className="text-xs">
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
      </Select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
