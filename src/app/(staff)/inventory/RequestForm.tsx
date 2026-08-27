"use client";

import { useActionState } from "react";
import { requestInventoryItem } from "@/lib/actions/inventory";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
      <Button type="submit" variant="outline-primary" pending={pending}>
        Request
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
