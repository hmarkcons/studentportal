"use client";

import { useActionState } from "react";
import { createDestination } from "@/lib/actions/destinations";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

export function NewDestinationForm() {
  const [state, formAction, pending] = useActionState(createDestination, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Country</label>
          <Input name="country" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Country code</label>
          <Input name="country_code" required maxLength={2} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Track</label>
          <Select name="track" required>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Currency</label>
          <Input name="currency" placeholder="EUR" required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Display name (optional — auto-suggested)</label>
        <Input name="display_name" placeholder="e.g. Italy (Public)" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Admin charge</label>
          <Input name="admin_charge" type="number" step="0.01" min="0" defaultValue={0} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Consultancy fee</label>
          <Input name="consultancy_fee" type="number" step="0.01" min="0" defaultValue={0} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Fee currency</label>
          <Input name="consultancy_fee_currency" defaultValue="EUR" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Installment plan (optional)</label>
        <Input name="installment_plan" placeholder="e.g. 2 installments" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          University application pipeline stages (comma-separated, in order — leave blank for the standard default)
        </label>
        <p className="text-xs text-muted">Tracks a single application&apos;s progress at one university (Documents Pending → ... → Enrolled).</p>
        <Textarea name="pipeline_stages" rows={2} placeholder="documents pending, documents verified, application submitted, ..." />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          Dashboard pipeline stages (one per line, as &quot;Label: option1/option2&quot; — leave blank for the standard default)
        </label>
        <p className="text-xs text-muted">
          Tracks the registered student&apos;s overall progress toward this country, shown on their Dashboard. A single option (e.g.
          &quot;Completed&quot;) is a checkbox; &quot;Date&quot; is a date field; 2+ options is a dropdown staff picks from.
        </p>
        <Textarea
          name="dashboard_pipeline_stages"
          rows={6}
          placeholder={"Admission Docs: Completed\nAdmission: In process/Issued\nVisa Status: Granted/Rejected\nTravel: Date"}
        />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Create destination"}
      </Button>
    </form>
  );
}
