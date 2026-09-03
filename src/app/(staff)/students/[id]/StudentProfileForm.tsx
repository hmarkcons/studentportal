"use client";

import { useActionState } from "react";
import { updateStudentProfile } from "@/lib/actions/students";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function StudentProfileForm({
  studentId,
  profile,
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
    financial_details: {
      sponsor_contact_number?: string | null;
      sponsor_occupation?: string | null;
      sponsor_cnic?: string | null;
      monthly_income?: string | null;
      income_currency?: string | null;
    } | null;
  } | null;
}) {
  const action = updateStudentProfile.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const financial = profile?.financial_details;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Passport & ID</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Passport number</label>
            <Input name="passport_number" defaultValue={profile?.passport_number ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Passport issue date</label>
            <Input name="passport_issue_date" type="date" defaultValue={profile?.passport_issue_date ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Passport expiry</label>
            <Input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">CNIC</label>
            <Input name="cnic" defaultValue={profile?.cnic ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Postal code</label>
            <Input name="postal_code" defaultValue={profile?.postal_code ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Qualification grade (% / CGPA / Grade)</label>
            <Input name="qualification_grade" defaultValue={profile?.qualification_grade ?? ""} />
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Emergency contact</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Name</label>
            <Input name="emergency_contact_name" defaultValue={profile?.emergency_contact_name ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Relation</label>
            <Input name="emergency_contact_relation" defaultValue={profile?.emergency_contact_relation ?? ""} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-muted">Number</label>
            <Input name="emergency_contact_number" defaultValue={profile?.emergency_contact_number ?? ""} />
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Financial & sponsor details</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Sponsor name</label>
            <Input name="financial_sponsor_name" defaultValue={profile?.financial_sponsor_name ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Sponsor relation</label>
            <Input name="financial_sponsor_relation" defaultValue={profile?.financial_sponsor_relation ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Sponsor contact number</label>
            <Input name="sponsor_contact_number" defaultValue={financial?.sponsor_contact_number ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Sponsor occupation</label>
            <Input name="sponsor_occupation" defaultValue={financial?.sponsor_occupation ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Sponsor CNIC</label>
            <Input name="sponsor_cnic" defaultValue={financial?.sponsor_cnic ?? ""} />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted">Monthly income</label>
              <Input name="monthly_income" type="number" step="0.01" defaultValue={financial?.monthly_income ?? ""} />
            </div>
            <div className="flex w-24 flex-col gap-1">
              <label className="text-xs text-muted">Currency</label>
              <Select name="income_currency" defaultValue={financial?.income_currency ?? "PKR"}>
                <option value="PKR">PKR</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} className="justify-self-start">
        Save profile
      </Button>
    </form>
  );
}
