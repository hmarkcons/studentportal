"use client";

import { useActionState } from "react";
import { updateDestination, deleteDestination } from "@/lib/actions/destinations";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

type Destination = {
  id: string;
  country: string;
  country_code: string;
  track: string;
  currency: string;
  display_name: string;
  visa_type: string | null;
  admin_charge: number;
  consultancy_fee: number;
  consultancy_fee_currency: string;
  status: string;
};

export function DestinationEditForm({ destination }: { destination: Destination }) {
  const action = updateDestination.bind(null, destination.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Country
          <input name="country" defaultValue={destination.country} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Country code
          <input name="country_code" defaultValue={destination.country_code} required maxLength={2} className={inputClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Track
          <select name="track" defaultValue={destination.track} required className={inputClass}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Currency
          <input name="currency" defaultValue={destination.currency} required className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Display name
        <input name="display_name" defaultValue={destination.display_name} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Visa type
        <input name="visa_type" defaultValue={destination.visa_type ?? ""} className={inputClass} />
      </label>
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Admin charge
          <input name="admin_charge" type="number" step="0.01" defaultValue={destination.admin_charge} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Consultancy fee
          <input name="consultancy_fee" type="number" step="0.01" defaultValue={destination.consultancy_fee} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Fee currency
          <input name="consultancy_fee_currency" defaultValue={destination.consultancy_fee_currency} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Status
        <select name="status" defaultValue={destination.status} className={inputClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">Saved.</p>}
      <div className="flex items-center justify-between">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${destination.display_name}? This also deletes all its universities and programs.`)) {
              deleteDestination(destination.id);
            }
          }}
          className="text-sm text-danger hover:underline"
        >
          Delete destination
        </button>
      </div>
    </form>
  );
}
