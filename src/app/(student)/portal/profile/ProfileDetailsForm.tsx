"use client";

import { useActionState } from "react";
import { updateProfileDetails } from "@/lib/actions/portal-profile";

type Profile = {
  passport_number: string | null;
  passport_expiry: string | null;
  cnic: string | null;
  financial_sponsor_name: string | null;
  financial_sponsor_relation: string | null;
} | null;

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

export function ProfileDetailsForm({ studentId, profile }: { studentId: string; profile: Profile }) {
  const action = updateProfileDetails.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Passport number
        <input name="passport_number" defaultValue={profile?.passport_number ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Passport expiry
        <input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        CNIC / B-Form number
        <input name="cnic" defaultValue={profile?.cnic ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Financial sponsor name
        <input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Sponsor relation
        <input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} className={inputClass} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
