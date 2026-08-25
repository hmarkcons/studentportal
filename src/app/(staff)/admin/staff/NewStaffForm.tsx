"use client";

import { useActionState } from "react";
import { createStaffAccount } from "@/lib/actions/admin";
import { STAFF_ROLES, STAFF_ROLE_LABELS } from "@/lib/constants";

export function NewStaffForm() {
  const [state, formAction, pending] = useActionState(createStaffAccount, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="full_name" placeholder="Full name" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="email" type="email" placeholder="Email" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="role" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {STAFF_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Create account
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && (
        <p className="text-xs text-success">
          Created. Temp password: <code>{state.password}</code>
        </p>
      )}
    </form>
  );
}
