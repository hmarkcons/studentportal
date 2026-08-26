"use client";

import { useActionState } from "react";
import { createUniversity } from "@/lib/actions/universities";

export function NewUniversityForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createUniversity, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="University name" required className="min-w-[220px] flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm" />
      <input name="city" placeholder="City (required)" required className="min-w-[140px] rounded-md border border-border bg-card px-3 py-2 text-sm" />
      <input name="region" placeholder="Region / state" className="min-w-[140px] rounded-md border border-border bg-card px-3 py-2 text-sm" />
      <select name="destination_id" required className="rounded-md border border-border bg-card px-3 py-2 text-sm">
        <option value="">Destination…</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </select>
      <select name="type" required className="rounded-md border border-border bg-card px-3 py-2 text-sm">
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add university
      </button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
