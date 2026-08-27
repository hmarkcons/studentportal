"use client";

import { useActionState } from "react";
import { createUniversity } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewUniversityForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createUniversity, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="University name" required className="min-w-[220px] flex-1" />
      <Input name="city" placeholder="City (required)" required className="min-w-[140px]" />
      <Input name="region" placeholder="Region / state" className="min-w-[140px]" />
      <Select name="destination_id" required>
        <option value="">Destination…</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </Select>
      <Select name="type" required>
        <option value="public">Public</option>
        <option value="private">Private</option>
      </Select>
      <Button type="submit" variant="primary" pending={pending}>
        Add university
      </Button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
