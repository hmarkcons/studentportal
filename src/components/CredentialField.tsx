"use client";

import { useActionState, useState } from "react";
import { storeCredentialAction, readCredentialAction } from "@/lib/actions/countryTracker";

export function CredentialField({
  label,
  ownerType,
  ownerId,
  credentialType,
  revalidateTo,
}: {
  label: string;
  ownerType: "student" | "application";
  ownerId: string;
  credentialType: string;
  revalidateTo: string;
}) {
  const action = storeCredentialAction.bind(null, ownerType, ownerId, credentialType, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function reveal() {
    setRevealing(true);
    const result = await readCredentialAction(ownerType, ownerId, credentialType);
    setRevealed(result);
    setRevealing(false);
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-xs font-medium text-ink">{label} (encrypted)</p>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input name="username" placeholder="Username / ID" className="w-36 rounded-md border border-border px-2 py-1 text-xs" />
        <input name="password" type="password" placeholder="Password" className="w-36 rounded-md border border-border px-2 py-1 text-xs" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={reveal} disabled={revealing} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg disabled:opacity-50">
          {revealing ? "Loading…" : "Reveal"}
        </button>
      </form>
      {revealed && (
        <p className="mt-2 text-xs text-muted">
          {revealed.username ? `Username: ${revealed.username}` : "No username set"}
          {revealed.password && ` · Password: ${revealed.password}`}
        </p>
      )}
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
