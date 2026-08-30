"use client";

import { useActionState, useState } from "react";
import { updateLead } from "@/lib/actions/leads";
import { STUDY_LEVELS, QUALIFICATION_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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
        <Input name="full_name" defaultValue={lead.full_name} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact number
        <Input name="contact_number" defaultValue={lead.contact_number ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <Input name="email" type="email" defaultValue={lead.email ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Platform / source
        <Input name="platform_source" defaultValue={lead.platform_source ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Current qualification
        <Select name="current_qualification" defaultValue={lead.current_qualification ?? ""}>
          <option value="">—</option>
          {lead.current_qualification && !(QUALIFICATION_LEVELS as readonly string[]).includes(lead.current_qualification) && (
            <option value={lead.current_qualification}>{lead.current_qualification}</option>
          )}
          {QUALIFICATION_LEVELS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Applying for
        <Select name="level_applying_for" defaultValue={lead.level_applying_for ?? ""}>
          <option value="">—</option>
          {STUDY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Course of interest
        <Input name="course_of_interest" defaultValue={lead.course_of_interest ?? ""} />
      </label>
      {showRegistrationFields && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Date of birth
            <Input name="date_of_birth" type="date" defaultValue={lead.date_of_birth ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Home phone
            <Input name="home_phone" defaultValue={lead.home_phone ?? ""} />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Address
            <Input name="address" defaultValue={lead.address ?? ""} />
          </label>
        </>
      )}
      <div className="col-span-full flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="col-span-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
