"use client";

import { useActionState } from "react";
import { updateProfileDetails } from "@/lib/actions/portal-profile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Profile = {
  passport_number: string | null;
  passport_expiry: string | null;
  cnic: string | null;
  financial_sponsor_name: string | null;
  financial_sponsor_relation: string | null;
} | null;

export function ProfileDetailsForm({ studentId, profile }: { studentId: string; profile: Profile }) {
  const action = updateProfileDetails.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <label className="flex flex-col gap-1 text-xs text-muted">
        Financial sponsor name
        <Input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Sponsor relation
        <Input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
