"use client";

import { useActionState } from "react";
import { updatePersonalDetails } from "@/lib/actions/portal-profile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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

export function PersonalDetailsForm({ studentId, student }: { studentId: string; student: Student }) {
  const action = updatePersonalDetails.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Full name
        <Input name="full_name" defaultValue={student.full_name} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact number
        <Input name="contact_number" defaultValue={student.contact_number ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Date of birth
        <Input name="date_of_birth" type="date" defaultValue={student.date_of_birth ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Home phone
        <Input name="home_phone" defaultValue={student.home_phone ?? ""} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Address
        <Input name="address" defaultValue={student.address ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Emergency contact name
        <Input name="emergency_contact_name" defaultValue={student.emergency_contact_name ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Relation
        <Input name="emergency_contact_relation" defaultValue={student.emergency_contact_relation ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Emergency contact number
        <Input name="emergency_contact_number" defaultValue={student.emergency_contact_number ?? ""} />
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
