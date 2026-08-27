"use client";

import { useActionState } from "react";
import { updateStudentProfile } from "@/lib/actions/students";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function StudentProfileForm({
  studentId,
  profile,
  address,
}: {
  studentId: string;
  profile: {
    passport_number: string | null;
    passport_expiry: string | null;
    passport_issue_date: string | null;
    cnic: string | null;
    postal_code: string | null;
    emergency_contact_name: string | null;
    emergency_contact_number: string | null;
    emergency_contact_relation: string | null;
    qualification_grade: string | null;
    financial_sponsor_name: string | null;
    financial_sponsor_relation: string | null;
  } | null;
  address?: string | null;
}) {
  const action = updateStudentProfile.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Passport number</label>
        <Input name="passport_number" defaultValue={profile?.passport_number ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Passport expiry</label>
        <Input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Passport issue date</label>
        <Input name="passport_issue_date" type="date" defaultValue={profile?.passport_issue_date ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">CNIC</label>
        <Input name="cnic" defaultValue={profile?.cnic ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Postal code</label>
        <Input name="postal_code" defaultValue={profile?.postal_code ?? ""} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted">Address</label>
        <Input name="address" defaultValue={address ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Qualification grade (% / CGPA / Grade)</label>
        <Input name="qualification_grade" defaultValue={profile?.qualification_grade ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Emergency contact name</label>
        <Input name="emergency_contact_name" defaultValue={profile?.emergency_contact_name ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Emergency contact number</label>
        <Input name="emergency_contact_number" defaultValue={profile?.emergency_contact_number ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Emergency contact relation</label>
        <Input name="emergency_contact_relation" defaultValue={profile?.emergency_contact_relation ?? ""} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Sponsor name</label>
        <Input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted">Sponsor relation</label>
        <Input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} />
      </div>
      {state?.error && <p className="col-span-2 text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} className="col-span-2 justify-self-start">
        Save profile
      </Button>
    </form>
  );
}
