"use client";

import { useActionState } from "react";
import { registerPartnerAccount } from "@/lib/actions/partner-register";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

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
      <Input name="staff_name" placeholder="Your name" required />
      <Select name="university_id" required>
        <option value="">Your university…</option>
        {universities.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Input name="email" type="email" placeholder="Work email" required />
      <Input name="password" type="password" placeholder="Password" required minLength={6} />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending}>
        Register
      </Button>
    </form>
  );
}
