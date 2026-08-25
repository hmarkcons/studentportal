"use client";

import { useActionState } from "react";
import { createAdCampaign } from "@/lib/actions/marketing";

export function NewAdCampaignForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAdCampaign, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="platform" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="Meta">Meta</option>
        <option value="Google">Google Ads</option>
        <option value="TikTok">TikTok</option>
        <option value="LinkedIn">LinkedIn</option>
      </select>
      <input name="country" placeholder="Target country" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="university_id" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Target university (optional)</option>
        {universities.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <select name="budget_period" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <input name="planned_spend" type="number" step="0.01" placeholder="Planned spend" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="start_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="end_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add campaign
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
