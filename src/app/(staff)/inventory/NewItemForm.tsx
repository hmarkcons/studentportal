"use client";

import { useActionState } from "react";
import { createInventoryItem } from "@/lib/actions/inventory";

export function NewItemForm() {
  const [state, formAction, pending] = useActionState(createInventoryItem, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="Item name (e.g. Pens)" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="category" placeholder="Category" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="unit" placeholder="Unit (e.g. box)" className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="quantity_on_hand" type="number" step="1" placeholder="Qty on hand" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="low_stock_threshold" type="number" step="1" placeholder="Low-stock alert at" className="w-36 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add item
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
