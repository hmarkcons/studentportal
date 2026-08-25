"use client";

import { updateStaffStatus } from "@/lib/actions/admin";

export function StaffStatusSelect({ id, status }: { id: string; status: string }) {
  return (
    <select defaultValue={status} onChange={(e) => updateStaffStatus(id, e.target.value)} className="rounded-md border border-border px-2 py-1 text-xs">
      <option value="active">Active</option>
      <option value="suspended">Suspended</option>
      <option value="deactivated">Deactivated</option>
    </select>
  );
}
