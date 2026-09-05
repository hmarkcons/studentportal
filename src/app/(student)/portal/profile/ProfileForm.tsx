"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/portal-profile";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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

export function ProfileForm({ studentId, student, profile }: { studentId: string; student: Student; profile: Profile }) {
  const action = updateProfile.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const financial = profile?.financial_details;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="mb-3 text-sm font-medium text-ink">Passport & sponsor details</h4>
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

        <div className="mt-3">
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
