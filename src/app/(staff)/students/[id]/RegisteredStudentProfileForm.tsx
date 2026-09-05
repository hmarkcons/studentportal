"use client";

import { useActionState } from "react";
import { updateRegisteredStudentProfile } from "@/lib/actions/students";
import { STUDY_LEVELS, QUALIFICATION_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Lead = {
  full_name: string;
  contact_number: string | null;
  email: string | null;
  platform_source: string | null;
  current_qualification: string | null;
  level_applying_for: string | null;
  course_of_interest: string | null;
  date_of_birth: string | null;
  address: string | null;
  home_phone: string | null;
};

type Profile = {
  passport_number: string | null;
  passport_issue_date: string | null;
  passport_expiry: string | null;
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

export function RegisteredStudentProfileForm({
  studentId,
  revalidateTo,
  lead,
  profile,
}: {
  studentId: string;
  revalidateTo: string;
  lead: Lead;
  profile: Profile;
}) {
  const action = updateRegisteredStudentProfile.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const financial = profile?.financial_details;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Core details</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <label className="flex flex-col gap-1 text-xs text-muted">
            Date of birth
            <Input name="date_of_birth" type="date" defaultValue={lead.date_of_birth ?? ""} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Home phone
            <Input name="home_phone" defaultValue={lead.home_phone ?? ""} />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Address
            <Input name="address" defaultValue={lead.address ?? ""} />
          </label>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Passport & ID</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Passport number
            <Input name="passport_number" defaultValue={profile?.passport_number ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Passport issue date
            <Input name="passport_issue_date" type="date" defaultValue={profile?.passport_issue_date ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Passport expiry
            <Input name="passport_expiry" type="date" defaultValue={profile?.passport_expiry ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            CNIC
            <Input name="cnic" defaultValue={profile?.cnic ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Postal code
            <Input name="postal_code" defaultValue={profile?.postal_code ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Qualification grade (% / CGPA / Grade)
            <Input name="qualification_grade" defaultValue={profile?.qualification_grade ?? ""} />
          </label>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Emergency contact</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <Input name="emergency_contact_name" defaultValue={profile?.emergency_contact_name ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Relation
            <Input name="emergency_contact_relation" defaultValue={profile?.emergency_contact_relation ?? ""} />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Number
            <Input name="emergency_contact_number" defaultValue={profile?.emergency_contact_number ?? ""} />
          </label>
        </div>
      </div>

      <div>
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

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending} className="justify-self-start">
        Save
      </Button>
    </form>
  );
}
