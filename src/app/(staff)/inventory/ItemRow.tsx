"use client";

import { useActionState, useState } from "react";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Item = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  quantity_on_hand: number;
  low_stock_threshold: number | null;
};

export function ItemRow({ item, canManage }: { item: Item; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const action = updateInventoryItem.bind(null, item.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  const low = item.low_stock_threshold != null && item.quantity_on_hand <= item.low_stock_threshold;

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={5} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <Input name="name" defaultValue={item.name} required />
            <Input name="category" defaultValue={item.category ?? ""} />
            <Input name="unit" defaultValue={item.unit ?? ""} className="w-28" />
            <Input name="quantity_on_hand" type="number" defaultValue={item.quantity_on_hand} className="w-28" />
            <Input name="low_stock_threshold" type="number" defaultValue={item.low_stock_threshold ?? ""} className="w-32" />
            <Button type="submit" variant="primary" size="sm" pending={pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">{item.name}</td>
      <td className="px-4 py-3 text-muted">{item.category ?? "—"}</td>
      <td className="px-4 py-3 text-muted">
        {item.quantity_on_hand} {item.unit ?? ""}
      </td>
      <td className="px-4 py-3">{low && <Badge tone="danger">Low stock</Badge>}</td>
      <td className="px-4 py-3">
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              ✏️
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete ${item.name}?`)) deleteInventoryItem(item.id);
              }}
            >
              🗑️
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
