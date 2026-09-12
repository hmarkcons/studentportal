"use client";

import { useActionState, useState } from "react";
import { updateDestination, deleteDestination } from "@/lib/actions/destinations";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

type Destination = {
  id: string;
  country: string;
  country_code: string;
  track: string;
  currency: string;
  display_name: string;
  visa_type: string | null;
  finalize_action_label?: string | null;
  intake_mode?: string | null;
  intake_seasons?: string[] | null;
  finalized_badge_label?: string | null;
  admin_charge: number;
  consultancy_fee: number;
  consultancy_fee_currency: string;
  installment_plan: string | null;
  status: string;
};

export function DestinationEditForm({ destination }: { destination: Destination }) {
  const action = updateDestination.bind(null, destination.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete ${destination.display_name}? This also deletes all its universities and programs.`)) return;
    setDeleteError(null);
    // deleteDestination redirects on success (it throws internally, it
    // never returns) — this only resolves to a value on the error path.
    const result = await deleteDestination(destination.id);
    if (result?.error) setDeleteError(result.error);
  }

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

      {/* Choosing the university a student will actually apply for a visa with
          is one step under different names — Italy calls it pre-enrolment. The
          documentation tracker reads whichever application carries it, so the
          wording lives here rather than in a country-code comparison in the
          code. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Wording for finalising a university (button)
          <Input
            name="finalize_action_label"
            defaultValue={destination.finalize_action_label ?? "Finalize for visa"}
            maxLength={40}
            placeholder="Finalize for visa"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Wording once it is done (badge)
          <Input
            name="finalized_badge_label"
            defaultValue={destination.finalized_badge_label ?? "Finalized for visa"}
            maxLength={40}
            placeholder="Finalized for visa"
          />
        </label>
      </div>
      {/* One free text box on every form is how the intake column came to
          hold both "Fall 27" and "Fall 2027" — the same intake, which no
          filter or report can group. Italy, France and Finland run a single
          intake a year; Austria, Germany and Turkey run two and a student is
          sometimes offered both; the UK runs several and is written out. Set
          here so a destination added next year needs no code. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          How the intake is entered
          <Select name="intake_mode" defaultValue={destination.intake_mode ?? "free_text"}>
            <option value="single">One intake a year — staff choose only the year</option>
            <option value="multi">Two or more — tick one or several, then the year</option>
            <option value="free_text">Typed out — many intakes, or none fixed</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          The intakes, one per line
          <Textarea
            name="intake_seasons"
            rows={3}
            defaultValue={(destination.intake_seasons ?? []).join("\n")}
            placeholder={"Spring/Summer\nFall/Winter"}
          />
          <span className="text-[11px] text-muted">
            Written onto agreements and invoices exactly as spelled here, with the year after it — “Fall/Winter 2027”.
            Leave empty when the intake is typed out.
          </span>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Admin charge
          <Input name="admin_charge" type="number" step="0.01" min="0" defaultValue={destination.admin_charge} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Consultancy fee
          <Input name="consultancy_fee" type="number" step="0.01" min="0" defaultValue={destination.consultancy_fee} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Fee currency
          <Input name="consultancy_fee_currency" defaultValue={destination.consultancy_fee_currency} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Installment plan
        <Input
          name="installment_plan"
          defaultValue={destination.installment_plan ?? ""}
          placeholder="e.g. 2 installments"
        />
      </label>
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
        <button type="button" onClick={handleDelete} className="text-sm text-danger hover:underline">
          Delete destination
        </button>
      </div>
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
    </form>
  );
}
