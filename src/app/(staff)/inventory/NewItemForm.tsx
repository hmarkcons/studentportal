"use client";

import { useActionState } from "react";
import { createInventoryItem } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function NewItemForm() {
  const [state, formAction, pending] = useActionState(createInventoryItem, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="Item name (e.g. Pens)" required />
      <Input name="category" placeholder="Category" />
      <Input name="unit" placeholder="Unit (e.g. box)" className="w-28" />
      <Input name="quantity_on_hand" type="number" step="1" placeholder="Qty on hand" className="w-32" />
      <Input name="low_stock_threshold" type="number" step="1" placeholder="Low-stock alert at" className="w-36" />
      <Button type="submit" variant="primary" pending={pending}>
        Add item
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
