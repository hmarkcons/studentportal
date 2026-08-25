"use client";

import { useActionState } from "react";
import { updateStudentProfile } from "@/lib/actions/students";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export function StudentProfileForm({
  studentId,
  profile,
}: {
  studentId: string;
  profile: {
    passport_number: string | null;
    passport_expiry: string | null;
    cnic: string | null;
    financial_sponsor_name: string | null;
    financial_sponsor_relation: string | null;
  } | null;
}) {
  const action = updateStudentProfile.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Passport number</label>
        <input name="passport_number" defaultValue={profile?.passport_number ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Passport expiry</label>
        <input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">CNIC</label>
        <input name="cnic" defaultValue={profile?.cnic ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Sponsor name</label>
        <input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} className={inputClass} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted">Sponsor relation</label>
        <input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} className={inputClass} />
      </div>
      {state?.error && <p className="col-span-2 text-xs text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="col-span-2 justify-self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Save profile
      </button>
    </form>
  );
}
