"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";

/**
 * Narrows the attendance table to one person.
 *
 * A plain GET form would need a submit button next to a dropdown, which nobody
 * presses; this navigates on change and keeps the month you were looking at.
 */
export function StaffFilter({
  staffList,
  selected,
  month,
}: {
  staffList: { id: string; full_name: string }[];
  selected: string;
  month: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selected}
      onChange={(e) => {
        const staff = e.target.value;
        router.push(`/admin/attendance?month=${month}${staff ? `&staff=${staff}` : ""}`);
      }}
      className="text-sm"
    >
      <option value="">Everyone</option>
      {staffList.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name}
        </option>
      ))}
    </Select>
  );
}
