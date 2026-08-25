"use client";

import { useActionState } from "react";
import { createDestination } from "@/lib/actions/destinations";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

export function NewDestinationForm() {
  const [state, formAction, pending] = useActionState(createDestination, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Country</label>
          <input name="country" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Country code</label>
          <input name="country_code" required maxLength={2} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Track</label>
          <select name="track" required className={inputClass}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Currency</label>
          <input name="currency" placeholder="EUR" required className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Display name (optional — auto-suggested)</label>
        <input name="display_name" placeholder="e.g. Italy (Public)" className={inputClass} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Admin charge</label>
          <input name="admin_charge" type="number" step="0.01" defaultValue={0} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Consultancy fee</label>
          <input name="consultancy_fee" type="number" step="0.01" defaultValue={0} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Fee currency</label>
          <input name="consultancy_fee_currency" defaultValue="EUR" className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Pipeline stages (comma-separated, in order — leave blank for the standard default)</label>
        <textarea name="pipeline_stages" rows={2} placeholder="documents pending, documents verified, application submitted, ..." className={inputClass} />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Saving…" : "Create destination"}
      </button>
    </form>
  );
}
