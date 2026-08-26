"use client";

import { useActionState, useState } from "react";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/actions/inventory";
import { Badge } from "@/components/ui/Badge";

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
            <input name="name" defaultValue={item.name} required className="rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="category" defaultValue={item.category ?? ""} className="rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="unit" defaultValue={item.unit ?? ""} className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="quantity_on_hand" type="number" defaultValue={item.quantity_on_hand} className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
            <input name="low_stock_threshold" type="number" defaultValue={item.low_stock_threshold ?? ""} className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
              Cancel
            </button>
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
            <button onClick={() => setEditing(true)} className="rounded p-1 text-muted hover:text-primary">
              ✏️
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${item.name}?`)) deleteInventoryItem(item.id);
              }}
              className="rounded p-1 text-muted hover:text-danger"
            >
              🗑️
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
