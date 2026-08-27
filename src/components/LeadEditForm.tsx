"use client";

import { useActionState, useState } from "react";
import { updateLead } from "@/lib/actions/leads";
import { STUDY_LEVELS } from "@/lib/constants";

const inputClass = "rounded-md border border-border bg-card px-2 py-1.5 text-sm";

export type LeadEditable = {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  platform_source: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  home_phone?: string | null;
};

export function LeadEditForm({
  lead,
  revalidateTo,
  showRegistrationFields = false,
}: {
  lead: LeadEditable;
  revalidateTo: string;
  showRegistrationFields?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const action = updateLead.bind(null, lead.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">
        ✏️ Edit details
      </button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input name="full_name" defaultValue={lead.full_name} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact number
        <input name="contact_number" defaultValue={lead.contact_number ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" defaultValue={lead.email ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Platform / source
        <input name="platform_source" defaultValue={lead.platform_source ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Current qualification
        <input name="current_qualification" defaultValue={lead.current_qualification ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Applying for
        <select name="level_applying_for" defaultValue={lead.level_applying_for ?? ""} className={inputClass}>
          <option value="">—</option>
          {STUDY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Course of interest
        <input name="course_of_interest" defaultValue={lead.course_of_interest ?? ""} className={inputClass} />
      </label>
      {showRegistrationFields && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Date of birth
            <input name="date_of_birth" type="date" defaultValue={lead.date_of_birth ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Home phone
            <input name="home_phone" defaultValue={lead.home_phone ?? ""} className={inputClass} />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Address
            <input name="address" defaultValue={lead.address ?? ""} className={inputClass} />
          </label>
        </>
      )}
      <div className="col-span-full flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="col-span-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
