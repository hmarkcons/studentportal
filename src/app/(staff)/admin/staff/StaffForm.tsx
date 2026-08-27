"use client";

import { useActionState } from "react";
import { createStaffAccount, updateStaffDetails } from "@/lib/actions/admin";
import { STAFF_ROLES, STAFF_ROLE_LABELS, STAFF_DESIGNATIONS, GENDERS, MARITAL_STATUSES, STAFF_CURRENCIES, CURRENCY_SYMBOLS } from "@/lib/constants";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";
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
  monthly_target: number | null;
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

  return (
    <form action={formAction} className="flex flex-col">
      <Section title="Personal Information">
        <Field label="Staff name">
          <input name="full_name" defaultValue={staff?.full_name ?? ""} required className={inputClass} />
        </Field>
        <Field label="Designation">
          <select name="designation" defaultValue={staff?.designation ?? ""} className={inputClass}>
            <option value="">—</option>
            {STAFF_DESIGNATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role (system access)">
          <select name="role" defaultValue={staff?.role ?? ""} required className={inputClass}>
            <option value="">—</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gender">
          <select name="gender" defaultValue={staff?.gender ?? ""} className={inputClass}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date of birth">
          <input name="date_of_birth" type="date" defaultValue={staff?.date_of_birth ?? ""} className={inputClass} />
        </Field>
        <Field label="Marital status">
          <select name="marital_status" defaultValue={staff?.marital_status ?? ""} className={inputClass}>
            <option value="">—</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="CNIC number">
          <input name="cnic" placeholder="XXXXXX-XXXXXX-X" defaultValue={staff?.cnic ?? ""} className={inputClass} />
        </Field>
        <Field label="Address" full>
          <input name="address" defaultValue={staff?.address ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Mobile (Personal)">
          <input name="mobile_personal" defaultValue={staff?.mobile_personal ?? ""} className={inputClass} />
        </Field>
        <Field label="Mobile (Official)">
          <input name="mobile_official" defaultValue={staff?.mobile_official ?? ""} className={inputClass} />
        </Field>
        <Field label="Email (Personal)">
          <input name="email_personal" type="email" defaultValue={staff?.email_personal ?? ""} className={inputClass} />
        </Field>
        <Field label={isEdit ? "Email (Official)" : "Email (Official) — used to log in"}>
          <input name="email_official" type="email" required={!isEdit} defaultValue={staff?.email_official ?? ""} className={inputClass} />
        </Field>
        <Field label="Emergency contact number">
          <input name="emergency_contact_number" defaultValue={staff?.emergency_contact_number ?? ""} className={inputClass} />
        </Field>
        <Field label="Emergency contact name">
          <input name="emergency_contact_name" defaultValue={staff?.emergency_contact_name ?? ""} className={inputClass} />
        </Field>
        <Field label="Emergency contact relation">
          <input name="emergency_contact_relation" defaultValue={staff?.emergency_contact_relation ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Compensation">
        <Field label={`Monthly salary (${CURRENCY_SYMBOLS[currency] ?? currency})`}>
          <input name="monthly_salary" type="number" step="0.01" defaultValue={staff?.monthly_salary ?? ""} className={inputClass} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={currency} className={inputClass}>
            {STAFF_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} ({CURRENCY_SYMBOLS[c]})
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Allowance (${CURRENCY_SYMBOLS[currency] ?? currency})`}>
          <input name="allowance" type="number" step="0.01" defaultValue={staff?.allowance ?? ""} className={inputClass} />
        </Field>
        <Field label="Commission rate — general (%)">
          <input name="commission_rate_general" type="number" step="0.01" defaultValue={staff?.commission_rate_general ?? ""} className={inputClass} />
        </Field>
        <Field label="Commission rate — public universities (%)">
          <input
            name="commission_rate_public_universities"
            type="number"
            step="0.01"
            defaultValue={staff?.commission_rate_public_universities ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Monthly target">
          <input name="monthly_target" type="number" step="1" defaultValue={staff?.monthly_target ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Status">
        <Field label="Status">
          <select name="status" defaultValue={staff ? (staff.status === "active" ? "active" : "inactive") : "active"} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
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
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create staff account"}
        </button>
        <button type="button" onClick={onSuccess} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-ink">
          {state?.success ? "Close" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
