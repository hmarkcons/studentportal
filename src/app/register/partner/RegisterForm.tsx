"use client";

import { useActionState } from "react";
import { registerPartnerAccount } from "@/lib/actions/partner-register";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm";

export function RegisterForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(registerPartnerAccount, undefined);

  if (state?.success) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm text-ink">{state.success}</p>
        <a href="/login" className="text-sm font-medium text-primary underline">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input name="staff_name" placeholder="Your name" required className={inputClass} />
      <select name="university_id" required className={inputClass}>
        <option value="">Your university…</option>
        {universities.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <input name="email" type="email" placeholder="Work email" required className={inputClass} />
      <input name="password" type="password" placeholder="Password" required minLength={6} className={inputClass} />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Submitting…" : "Register"}
      </button>
    </form>
  );
}
