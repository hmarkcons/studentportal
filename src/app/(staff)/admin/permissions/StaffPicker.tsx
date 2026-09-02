"use client";

import { useRouter } from "next/navigation";

export function StaffPicker({
  staffList,
  selectedStaffId,
}: {
  staffList: { id: string; label: string }[];
  selectedStaffId: string | null;
}) {
  const router = useRouter();

  return (
    <select
      defaultValue={selectedStaffId ?? ""}
      onChange={(e) => router.push(e.target.value ? `/admin/permissions?staff=${e.target.value}` : "/admin/permissions")}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-ink"
    >
      <option value="">Choose a staff member…</option>
      {staffList.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
