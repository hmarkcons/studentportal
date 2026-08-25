"use client";

import { useActionState } from "react";
import { createCampaign } from "@/lib/actions/marketing";

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaign, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="type" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="event">Event / fair</option>
        <option value="digital">Digital</option>
      </select>
      <input name="name" placeholder="Campaign name" required className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="city" placeholder="City" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="event_date_start" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="budget" type="number" step="0.01" placeholder="Budget" className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add campaign
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
