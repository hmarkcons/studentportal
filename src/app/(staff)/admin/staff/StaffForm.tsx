"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createStaffAccount, updateStaffDetails } from "@/lib/actions/admin";
import {
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  STAFF_DESIGNATIONS,
  GENDERS,
  MARITAL_STATUSES,
  STAFF_CURRENCIES,
  CURRENCY_SYMBOLS,
  COMMISSION_TYPES,
  COMMISSION_TYPE_LABELS,
  BONUS_RATE_OPTIONS,
} from "@/lib/constants";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const labelClass = "text-xs font-medium text-muted";

export type StaffRecord = {
  id: string;
  full_name: string;
  role: string;
  designation: string | null;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  cnic: string | null;
  address: string | null;
  mobile_personal: string | null;
  mobile_official: string | null;
  email_personal: string | null;
  email_official: string | null;
  emergency_contact_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  monthly_salary: number | null;
  currency: string;
  allowance: number | null;
  commission_rate_general: number | null;
  commission_rate_public_universities: number | null;
  commission_type_general: string;
  commission_type_public_universities: string;
  monthly_target: number | null;
  bonus_eligible: boolean;
  bonus_rate_percent: number | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h4 className="mb-3 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function StaffForm({ staff, onSuccess }: { staff?: StaffRecord; onSuccess: () => void }) {
  const isEdit = Boolean(staff);
  const action = isEdit ? updateStaffDetails.bind(null, staff!.id) : createStaffAccount;
  const [state, formAction, pending] = useActionState(action, undefined);
  const currency = staff?.currency ?? "PKR";
  const [typeGeneral, setTypeGeneral] = useState(staff?.commission_type_general ?? "percentage");
  const [typePublic, setTypePublic] = useState(staff?.commission_type_public_universities ?? "percentage");
  const [bonusEligible, setBonusEligible] = useState(staff?.bonus_eligible ?? false);

  return (
    <form action={formAction} className="flex flex-col">
      <Section title="Personal Information">
        <Field label="Staff name">
          <Input name="full_name" defaultValue={staff?.full_name ?? ""} required />
        </Field>
        <Field label="Designation">
          <Select name="designation" defaultValue={staff?.designation ?? ""}>
            <option value="">—</option>
            {STAFF_DESIGNATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Role (system access)">
          <Select name="role" defaultValue={staff?.role ?? ""} required>
            <option value="">—</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gender">
          <Select name="gender" defaultValue={staff?.gender ?? ""}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input name="date_of_birth" type="date" defaultValue={staff?.date_of_birth ?? ""} />
        </Field>
        <Field label="Marital status">
          <Select name="marital_status" defaultValue={staff?.marital_status ?? ""}>
            <option value="">—</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CNIC number">
          <Input name="cnic" placeholder="XXXXXX-XXXXXX-X" defaultValue={staff?.cnic ?? ""} />
        </Field>
        <Field label="Address" full>
          <Input name="address" defaultValue={staff?.address ?? ""} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Mobile (Personal)">
          <Input name="mobile_personal" defaultValue={staff?.mobile_personal ?? ""} />
        </Field>
        <Field label="Mobile (Official)">
          <Input name="mobile_official" defaultValue={staff?.mobile_official ?? ""} />
        </Field>
        <Field label="Email (Personal)">
          <Input name="email_personal" type="email" defaultValue={staff?.email_personal ?? ""} />
        </Field>
        <Field label={isEdit ? "Email (Official)" : "Email (Official) — used to log in"}>
          <Input name="email_official" type="email" required={!isEdit} defaultValue={staff?.email_official ?? ""} />
        </Field>
        <Field label="Emergency contact number">
          <Input name="emergency_contact_number" defaultValue={staff?.emergency_contact_number ?? ""} />
        </Field>
        <Field label="Emergency contact name">
          <Input name="emergency_contact_name" defaultValue={staff?.emergency_contact_name ?? ""} />
        </Field>
        <Field label="Emergency contact relation">
          <Input name="emergency_contact_relation" defaultValue={staff?.emergency_contact_relation ?? ""} />
        </Field>
      </Section>

      <Section title="Compensation">
        <Field label={`Monthly salary (${CURRENCY_SYMBOLS[currency] ?? currency})`}>
          <Input name="monthly_salary" type="number" step="0.01" defaultValue={staff?.monthly_salary ?? ""} />
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={currency}>
            {STAFF_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} ({CURRENCY_SYMBOLS[c]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Allowance (${CURRENCY_SYMBOLS[currency] ?? currency})`}>
          <Input name="allowance" type="number" step="0.01" defaultValue={staff?.allowance ?? ""} />
        </Field>
        <Field label="Private Universities — Commission Type">
          <Select name="commission_type_general" value={typeGeneral} onChange={(e) => setTypeGeneral(e.target.value)}>
            {COMMISSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {COMMISSION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            typeGeneral === "flat"
              ? `Private Universities — Flat Amount (${CURRENCY_SYMBOLS[currency] ?? currency})`
              : "Private Universities — Rate (%)"
          }
        >
          <Input name="commission_rate_general" type="number" step="0.01" defaultValue={staff?.commission_rate_general ?? ""} />
        </Field>
        <Field label="Public Universities — Commission Type">
          <Select name="commission_type_public_universities" value={typePublic} onChange={(e) => setTypePublic(e.target.value)}>
            {COMMISSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {COMMISSION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            typePublic === "flat"
              ? `Public Universities — Flat Amount (${CURRENCY_SYMBOLS[currency] ?? currency})`
              : "Public Universities — Rate (%)"
          }
        >
          <Input
            name="commission_rate_public_universities"
            type="number"
            step="0.01"
            defaultValue={staff?.commission_rate_public_universities ?? ""}
          />
        </Field>
        <Field label="Monthly target">
          <Input name="monthly_target" type="number" step="1" defaultValue={staff?.monthly_target ?? ""} />
        </Field>
        <Field label="Monthly bonus" full>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="bonus_eligible"
              checked={bonusEligible}
              onChange={(e) => setBonusEligible(e.target.checked)}
              className="h-4 w-4"
            />
            Eligible for a bonus when this staff member hits their monthly target
          </label>
        </Field>
        {bonusEligible && (
          <Field label="Bonus Rate">
            <Select name="bonus_rate_percent" defaultValue={String(staff?.bonus_rate_percent ?? BONUS_RATE_OPTIONS[0])}>
              {BONUS_RATE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}% increment in commission
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Section>

      <Section title="Status">
        <Field label="Status">
          <Select name="status" defaultValue={staff ? (staff.status === "active" ? "active" : "inactive") : "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </Section>

      {state?.error && <p className="mb-3 text-sm text-danger">{state.error}</p>}
      {state?.success && (
        <div className="mb-3 rounded-md border border-success bg-success-bg px-3 py-2 text-sm text-success">
          {isEdit ? (
            "Saved."
          ) : (
            <>
              Staff account created. Temp password:{" "}
              <code>{typeof state === "object" && state && "password" in state ? String((state as { password: unknown }).password) : ""}</code>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          {isEdit ? "Save changes" : "Create staff account"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onSuccess}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
