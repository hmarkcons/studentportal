"use client";

import { deleteStaffCommission } from "@/lib/actions/finance";

export function DeleteCommissionButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => {
        if (confirm("Delete this commission record?")) deleteStaffCommission(id);
      }}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-danger"
    >
      🗑️
    </button>
  );
}
