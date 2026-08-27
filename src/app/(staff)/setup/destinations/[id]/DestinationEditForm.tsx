"use client";

import { useActionState } from "react";
import { updateDestination, deleteDestination } from "@/lib/actions/destinations";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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
          <Input name="country" defaultValue={destination.country} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Country code
          <Input name="country_code" defaultValue={destination.country_code} required maxLength={2} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Track
          <Select name="track" defaultValue={destination.track} required>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Currency
          <Input name="currency" defaultValue={destination.currency} required />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Display name
        <Input name="display_name" defaultValue={destination.display_name} required />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Visa type
        <Input name="visa_type" defaultValue={destination.visa_type ?? ""} />
      </label>
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Admin charge
          <Input name="admin_charge" type="number" step="0.01" defaultValue={destination.admin_charge} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Consultancy fee
          <Input name="consultancy_fee" type="number" step="0.01" defaultValue={destination.consultancy_fee} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Fee currency
          <Input name="consultancy_fee_currency" defaultValue={destination.consultancy_fee_currency} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Status
        <Select name="status" defaultValue={destination.status}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </label>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">Saved.</p>}
      <div className="flex items-center justify-between">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
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
