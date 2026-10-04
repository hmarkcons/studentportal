"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { dobBounds } from "@/lib/dateOfBirth";
import { phoneBounds } from "@/lib/phoneNumber";
import { EMERGENCY_RELATIONS, REGISTRATION_PERSONAL_FIELDS, type RegistrationPersonal } from "@/lib/registrationPersonal";

const labelClass = "text-sm font-medium text-ink";
const max = Object.fromEntries(REGISTRATION_PERSONAL_FIELDS.map((f) => [f.key, f.maxLength])) as Record<keyof RegistrationPersonal, number>;

/**
 * Date of birth, address and the emergency contact — the five a student is
 * registered with, all required (src/lib/registrationPersonal.ts). The same
 * fields, with the same names, on the Register student form and behind
 * "Register this lead"; whatever is already on file is filled in.
 */
export function RegistrationPersonalFields({ defaults = {} }: { defaults?: Partial<Record<keyof RegistrationPersonal, string | null>> }) {
  const relations = useId();
  const required = <span className="text-danger">*</span>;
  return (
    <fieldset className="flex flex-col gap-4" data-registration-personal>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Date of birth {required}</span>
          <Input name="date_of_birth" type="date" required defaultValue={defaults.date_of_birth ?? ""} {...dobBounds()} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Address {required}</span>
          <Input name="address" required maxLength={max.address} defaultValue={defaults.address ?? ""} autoComplete="street-address" />
        </label>
      </div>
      <p className="-mb-2 text-sm font-semibold text-ink">Emergency contact</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Name {required}</span>
          <Input name="emergency_contact_name" required maxLength={max.emergency_contact_name} defaultValue={defaults.emergency_contact_name ?? ""} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Relation {required}</span>
          <Input
            name="emergency_contact_relation"
            required
            maxLength={max.emergency_contact_relation}
            list={relations}
            placeholder="Father, Mother…"
            defaultValue={defaults.emergency_contact_relation ?? ""}
          />
          <datalist id={relations}>
            {EMERGENCY_RELATIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Number {required}</span>
          <Input
            name="emergency_contact_number"
            required
            maxLength={max.emergency_contact_number}
            defaultValue={defaults.emergency_contact_number ?? ""}
            {...phoneBounds()}
          />
        </label>
      </div>
    </fieldset>
  );
}
