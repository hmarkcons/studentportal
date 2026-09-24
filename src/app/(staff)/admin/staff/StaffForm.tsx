"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createStaffAccount, updateStaffDetails, uploadStaffPhoto, deleteStaffPhoto } from "@/lib/actions/admin";
import { PhotoUpload } from "@/components/PhotoUpload";
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
  type StaffRole,
} from "@/lib/constants";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { dobBounds } from "@/lib/dateOfBirth";
import { phoneBounds } from "@/lib/phoneNumber";
import { staffRoles, ROLES_PRESENT_FIELD } from "@/lib/auth/roles";

const labelClass = "text-xs font-medium text-muted";

type ActionState =
  | { error: string; success?: undefined; email?: undefined; password?: undefined; restoredCount?: undefined; emailed?: undefined; warning?: undefined }
  | { success: boolean; error?: undefined; email?: string; password?: string; restoredCount?: number; emailed?: boolean; warning?: string }
  | undefined;

export type StaffRecord = {
  id: string;
  full_name: string;
  role: string;
  roles?: (string | null)[] | null;
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
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_days?: number[] | null;
  joined_on?: string | null;
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

/**
 * Field, but for a group of controls that each carry their own <label>.
 * Field itself IS a <label>, and a label inside a label is invalid HTML — the
 * browser resolves a click on the inner one against the outer's first control,
 * so ticking "Finance" could toggle something else entirely.
 */
function FieldGroup({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <fieldset className={`flex flex-col gap-1 border-0 p-0 ${full ? "sm:col-span-2" : ""}`}>
      <legend className={labelClass}>{label}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Roles, plural. One person commonly does two jobs here — counselling and
 * finance, processing and marketing — and with a single slot they had to be
 * given whichever role's access mattered most and worked around for the rest.
 */
function RolesField({
  selectedRoles,
  primary,
  canGrantSuperAdmin,
}: {
  selectedRoles: readonly StaffRole[];
  primary?: string;
  canGrantSuperAdmin: boolean;
}) {
  return (
    <FieldGroup label="Roles (system access)">
      <div className="flex flex-col gap-1 rounded-md border border-border bg-bg p-2">
        {STAFF_ROLES.map((r) => {
          const locked = r === "super_admin" && !canGrantSuperAdmin;
          return (
            <label
              key={r}
              className={`flex items-center gap-2 text-xs ${locked ? "text-muted" : "text-ink"}`}
              title={locked ? "Only a Super Admin can grant the Super Admin role." : undefined}
            >
              <input
                type="checkbox"
                name="roles"
                value={r}
                aria-label={STAFF_ROLE_LABELS[r]}
                defaultChecked={selectedRoles.includes(r)}
                disabled={locked}
              />
              <span>{STAFF_ROLE_LABELS[r]}</span>
              {locked && <span className="text-[10px] text-muted">(Super Admin only)</span>}
              {/* Named against the role that actually IS primary on the record,
                  not the first tick — the two differ, and guessing would label
                  the wrong row. */}
              {r === primary && selectedRoles.length > 1 && <span className="text-[10px] text-primary">primary</span>}
            </label>
          );
        })}
        {/* Carried through so the server can tell "unticked everything" from
            "this form has no roles field", and so a locked Super Admin tick is
            not silently dropped by the disabled input. */}
        <input type="hidden" name={ROLES_PRESENT_FIELD} value="1" />
        {!canGrantSuperAdmin && selectedRoles.includes("super_admin") && (
          <input type="hidden" name="roles" value="super_admin" />
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Tick at least one. Access is the sum of every role ticked. Their primary role — the one the staff
        list shows — stays as it is unless you untick it.
      </p>
    </FieldGroup>
  );
}

const WORK_DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function StaffForm({
  staff,
  photoUrl,
  onSuccess,
  allStaff = [],
  canGrantSuperAdmin = false,
  rolesOnly = false,
  assignedStudentCount = 0,
  canManagePhoto = false,
}: {
  staff?: StaffRecord;
  photoUrl?: string | null;
  onSuccess: () => void;
  allStaff?: StaffRecord[];
  assignedStudentCount?: number;
  /** Only a Super Admin may grant or remove the Super Admin role itself. */
  canGrantSuperAdmin?: boolean;
  /**
   * Render the roles alone. For a viewer who holds staff.assign_roles without
   * staff.manage: Management decides who does which job, and pay stays with
   * the Super Admin.
   */
  rolesOnly?: boolean;
  /**
   * A staff member's photo is the Super Admin's to set and to remove. Anyone
   * else editing this form sees the picture and no controls — the actions are
   * gated on staff.manage too, so this only stops them being offered a button
   * that would refuse them.
   */
  canManagePhoto?: boolean;
}) {
  const isEdit = Boolean(staff);
  const action = isEdit ? updateStaffDetails.bind(null, staff!.id) : createStaffAccount;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const currency = staff?.currency ?? "PKR";
  const [typeGeneral, setTypeGeneral] = useState(staff?.commission_type_general ?? "percentage");
  const [typePublic, setTypePublic] = useState(staff?.commission_type_public_universities ?? "percentage");
  const [bonusEligible, setBonusEligible] = useState(staff?.bonus_eligible ?? false);
  const [statusValue, setStatusValue] = useState(
    staff ? (staff.status === "suspended" ? "suspended" : staff.status === "active" ? "active" : "inactive") : "active"
  );

  const held = staffRoles(staff ?? null);
  const selectedRoles = STAFF_ROLES.filter((r) => held.includes(r));

  const needsReplacement = isEdit && statusValue === "inactive" && assignedStudentCount > 0;
  const replacementOptions = allStaff.filter((s) => s.id !== staff?.id && s.status === "active");

  // Somebody holding staff.assign_roles alone gets the roles and nothing else.
  // Showing them the full form would mean rows of blank pay and personal
  // fields — the page never fetched those values for them — which reads as
  // data loss and would post empties back if the action didn't ignore them.
  if (rolesOnly) {
    return (
      <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col">
        <p className="mb-4 text-sm text-ink">
          Roles for <span className="font-medium">{staff?.full_name}</span>
        </p>
        <div className="mb-6">
          <RolesField selectedRoles={selectedRoles} primary={staff?.role} canGrantSuperAdmin={canGrantSuperAdmin} />
        </div>
        {state?.error && <p className="mb-3 text-sm text-danger">{state.error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="lg" pending={pending} status={{ state, label: "Roles saved." }}>
            Save roles
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onSuccess}>
            {state?.success ? "Close" : "Cancel"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Its own form — a file input can't live inside the main form below
          without nesting <form> tags, which browsers don't support. */}
      {isEdit && (
        <div className="mb-6">
          <span className={labelClass}>Photo</span>
          <div className="mt-1">
            {canManagePhoto ? (
              <PhotoUpload
                action={uploadStaffPhoto.bind(null, staff!.id)}
                photoUrl={photoUrl ?? null}
                onDelete={deleteStaffPhoto.bind(null, staff!.id)}
                deleteLabel={`${staff!.full_name}'s photo`}
              />
            ) : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={`${staff!.full_name}'s photo`}
                className="h-20 w-20 rounded-full border border-border object-cover"
              />
            ) : (
              <p className="text-xs text-muted">No photo. Only a Super Admin can set one.</p>
            )}
          </div>
        </div>
      )}
      {/* React resets a form's native DOM controls after every action
          completion (success or error) unless this is blocked — for the
          Status <select>, that silently reverts its underlying DOM value
          back to "Active" after any failed submission (e.g. deactivating
          without picking a replacement), even though the controlled
          `statusValue` state React thinks is still current says
          "Inactive". A resubmission then submits status=active, silently
          skipping the reassignment guard and reporting a false "Saved." */}
      <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col">
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
        <RolesField selectedRoles={selectedRoles} primary={staff?.role} canGrantSuperAdmin={canGrantSuperAdmin} />
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
          <Input name="date_of_birth" type="date" defaultValue={staff?.date_of_birth ?? ""} {...dobBounds()} />
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
          <Input name="mobile_personal" defaultValue={staff?.mobile_personal ?? ""} {...phoneBounds()} />
        </Field>
        <Field label="Mobile (Official)">
          <Input name="mobile_official" defaultValue={staff?.mobile_official ?? ""} {...phoneBounds()} />
        </Field>
        <Field label="Email (Personal)">
          <Input name="email_personal" type="email" defaultValue={staff?.email_personal ?? ""} />
        </Field>
        <Field label={isEdit ? "Email (Official) — their sign-in email" : "Email (Official) — used to log in"}>
          {/* Changing it moves their login to the new address, so only a
              Super Admin may; everyone else sees it and cannot edit it.
              updateStaffDetails and 0274 refuse the change too. */}
          <Input
            name="email_official"
            type="email"
            required={!isEdit}
            defaultValue={staff?.email_official ?? ""}
            readOnly={isEdit && !canGrantSuperAdmin}
            aria-readonly={isEdit && !canGrantSuperAdmin}
            className={isEdit && !canGrantSuperAdmin ? "cursor-not-allowed opacity-60" : undefined}
            data-official-email-locked={isEdit && !canGrantSuperAdmin ? "" : undefined}
          />
          {isEdit && (
            <p className="mt-1 text-xs text-muted">
              {canGrantSuperAdmin
                ? "Changing this also changes the email they sign in with."
                : "Only a Super Admin can change this, because it is the email they sign in with."}
            </p>
          )}
        </Field>
        <Field label="Emergency contact number">
          <Input name="emergency_contact_number" defaultValue={staff?.emergency_contact_number ?? ""} {...phoneBounds()} />
        </Field>
        <Field label="Emergency contact name">
          <Input name="emergency_contact_name" defaultValue={staff?.emergency_contact_name ?? ""} />
        </Field>
        <Field label="Emergency contact relation">
          <Input name="emergency_contact_relation" defaultValue={staff?.emergency_contact_relation ?? ""} />
        </Field>
      </Section>

      {/* Hours are per person — that is the whole reason they are here and
          not only in Setup. Blank means the office default, so this only has
          to be filled in for somebody who differs from it. */}
      <Section title="Working hours">
        {/* Their leave year runs from each anniversary of it (0272). */}
        <Field label="Joining date">
          <Input name="joined_on" type="date" defaultValue={staff?.joined_on ?? ""} />
        </Field>
        <Field label="Starts">
          <Input name="work_start_time" type="time" defaultValue={(staff?.work_start_time ?? "").slice(0, 5)} />
        </Field>
        <Field label="Ends">
          <Input name="work_end_time" type="time" defaultValue={(staff?.work_end_time ?? "").slice(0, 5)} />
        </Field>
        <Field label="Working days">
          <div className="flex flex-wrap gap-2 pt-1">
            {WORK_DAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1 text-xs text-ink">
                <input
                  type="checkbox"
                  name="work_days"
                  value={d.value}
                  defaultChecked={(staff?.work_days ?? []).includes(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </Field>
        <p className="col-span-full text-xs text-muted">
          Leave blank to use the office hours set in Setup &rsaquo; Attendance policy. Lateness, absence and overtime
          are all measured against whichever applies.
        </p>
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
          <Select name="status" value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </Select>
          {statusValue === "suspended" && (
            <p className="mt-1 text-xs text-muted">
              Freezes the account — {staff?.full_name ?? "this staff member"} won&apos;t be able to log in, but nothing is reassigned. Their
              students and data stay exactly as they are.
            </p>
          )}
        </Field>
        {needsReplacement && (
          <Field label="Reassign their students to" full>
            <Select name="reassign_to_staff_id" required defaultValue="">
              <option value="" disabled>
                Choose a replacement…
              </option>
              {replacementOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              {staff!.full_name} has {assignedStudentCount} assigned student{assignedStudentCount === 1 ? "" : "s"}. Choose who takes over before
              deactivating.
            </p>
          </Field>
        )}
      </Section>

      {state?.error && <p className="mb-3 text-sm text-danger">{state.error}</p>}
      {/* The confirmation itself sits beside the button; the temp password is
          something to copy down rather than a confirmation, so it keeps a box
          of its own. */}
      {state?.success && !isEdit && (
        <div className="mb-3 rounded-md border border-success bg-success-bg px-3 py-2 text-sm text-success">
          <p>
            Sign in with <code>{state?.email ?? ""}</code> and password <code>{state?.password ?? ""}</code>
          </p>
          <p className="mt-1 text-xs">
            {state?.emailed ? `Emailed to ${state.email}. ` : ""}
            {/* Not claimed when the warning below says the copy failed. */}
            {!state?.warning?.includes("copy") &&
              "A copy is kept — a Super Admin can reveal it later from the staff member's Login panel."}
          </p>
          {state?.warning && <p className="mt-1 text-xs text-warning">{state.warning}</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          status={{
            state,
            label: isEdit
              ? `Saved.${state?.restoredCount ? ` ${state.restoredCount} student(s) reassigned back to them.` : ""}`
              : "Staff account created.",
          }}
        >
          {isEdit ? "Save changes" : "Create staff account"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onSuccess}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
      </form>
    </div>
  );
}
