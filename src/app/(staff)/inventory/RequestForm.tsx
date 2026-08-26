"use client";

import { useActionState } from "react";
import { requestInventoryItem } from "@/lib/actions/inventory";

export function RequestForm({ items }: { items: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(requestInventoryItem, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="item_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Item…</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <input name="quantity" type="number" step="1" min="1" placeholder="Quantity" required className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="notes" placeholder="Notes" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-50">
        Request
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
