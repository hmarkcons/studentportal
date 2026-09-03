"use client";

import { useActionState } from "react";
import { updateProfileDetails } from "@/lib/actions/portal-profile";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Profile = {
  passport_number: string | null;
  passport_expiry: string | null;
  cnic: string | null;
  financial_sponsor_name: string | null;
  financial_sponsor_relation: string | null;
  financial_details: {
    sponsor_contact_number?: string | null;
    sponsor_occupation?: string | null;
    sponsor_cnic?: string | null;
    monthly_income?: string | null;
    income_currency?: string | null;
  } | null;
} | null;

export function ProfileDetailsForm({ studentId, profile }: { studentId: string; profile: Profile }) {
  const action = updateProfileDetails.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const financial = profile?.financial_details;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Passport number
          <Input name="passport_number" defaultValue={profile?.passport_number ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Passport expiry
          <Input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          CNIC / B-Form number
          <Input name="cnic" defaultValue={profile?.cnic ?? ""} />
        </label>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Financial & sponsor details</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sponsor name
            <Input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sponsor relation
            <Input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sponsor contact number
            <Input name="sponsor_contact_number" defaultValue={financial?.sponsor_contact_number ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sponsor occupation
            <Input name="sponsor_occupation" defaultValue={financial?.sponsor_occupation ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sponsor CNIC
            <Input name="sponsor_cnic" defaultValue={financial?.sponsor_cnic ?? ""} />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Monthly income
              <Input name="monthly_income" type="number" step="0.01" defaultValue={financial?.monthly_income ?? ""} />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs text-muted">
              Currency
              <Select name="income_currency" defaultValue={financial?.income_currency ?? "PKR"}>
                <option value="PKR">PKR</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </Select>
            </label>
          </div>
        </div>
      </div>

      <div>
        {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
