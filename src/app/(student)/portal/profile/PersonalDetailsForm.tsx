"use client";

import { useActionState } from "react";
import { updatePersonalDetails } from "@/lib/actions/portal-profile";

type Student = {
  full_name: string;
  contact_number: string | null;
  date_of_birth: string | null;
  address: string | null;
  home_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_number: string | null;
};

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

export function PersonalDetailsForm({ studentId, student }: { studentId: string; student: Student }) {
  const action = updatePersonalDetails.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Full name
        <input name="full_name" defaultValue={student.full_name} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact number
        <input name="contact_number" defaultValue={student.contact_number ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Date of birth
        <input name="date_of_birth" type="date" defaultValue={student.date_of_birth ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Home phone
        <input name="home_phone" defaultValue={student.home_phone ?? ""} className={inputClass} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Address
        <input name="address" defaultValue={student.address ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Emergency contact name
        <input name="emergency_contact_name" defaultValue={student.emergency_contact_name ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Relation
        <input name="emergency_contact_relation" defaultValue={student.emergency_contact_relation ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Emergency contact number
        <input name="emergency_contact_number" defaultValue={student.emergency_contact_number ?? ""} className={inputClass} />
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
