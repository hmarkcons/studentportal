"use client";

import { useActionState } from "react";
import { saveTrackerFields } from "@/lib/actions/countryTracker";
import { CredentialField } from "@/components/CredentialField";
import type { TrackerFieldDef } from "@/lib/countryTrackers";

export function CountryTrackerForm({
  applicationId,
  fields,
  values,
  revalidateTo,
}: {
  applicationId: string;
  fields: TrackerFieldDef[];
  values: Record<string, string>;
  revalidateTo: string;
}) {
  const plainFields = fields.filter((f) => f.type !== "credential");
  const credentialFields = fields.filter((f) => f.type === "credential");

  const action = saveTrackerFields.bind(
    null,
    applicationId,
    revalidateTo,
    plainFields.map((f) => ({ key: f.key, type: f.type }))
  );
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plainFields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs text-muted">{f.label}</label>
            {f.type === "boolean" ? (
              <input type="checkbox" name={f.key} defaultChecked={values[f.key] === "true"} className="h-4 w-4 self-start" />
            ) : f.type === "select" ? (
              <select name={f.key} defaultValue={values[f.key] ?? ""} className="rounded-md border border-border px-2 py-1.5 text-sm">
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "date" ? "date" : "text"}
                name={f.key}
                defaultValue={values[f.key] ?? ""}
                className="rounded-md border border-border px-2 py-1.5 text-sm"
              />
            )}
          </div>
        ))}
        <div className="col-span-full">
          {state?.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}
          <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
            Save tracker fields
          </button>
        </div>
      </form>

      {credentialFields.length > 0 && (
        <div className="flex flex-col gap-3">
          {credentialFields.map((f) => (
            <CredentialField
              key={f.key}
              label={f.label}
              ownerType="application"
              ownerId={applicationId}
              credentialType={f.credentialType ?? f.key}
              revalidateTo={revalidateTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
