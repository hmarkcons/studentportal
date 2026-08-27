"use client";

import { useActionState } from "react";
import { requestInventoryItem } from "@/lib/actions/inventory";
import { Input, Select } from "@/components/ui/Input";

export function RequestForm({ items }: { items: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(requestInventoryItem, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="item_id" required>
        <option value="">Item…</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </Select>
      <Input name="quantity" type="number" step="1" min="1" placeholder="Quantity" required className="w-28" />
      <Input name="notes" placeholder="Notes" />
      <button type="submit" disabled={pending} className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-50">
        Request
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
