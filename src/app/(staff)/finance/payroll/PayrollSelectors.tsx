"use client";

import { useRouter, usePathname } from "next/navigation";
import { Input, Select } from "@/components/ui/Input";

export function PayrollSelectors({
  staffList,
  selectedStaffId,
  month,
}: {
  staffList: { id: string; full_name: string }[];
  selectedStaffId: string;
  month: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function go(staffId: string, m: string) {
    const params = new URLSearchParams();
    if (staffId) params.set("staff", staffId);
    if (m) params.set("month", m);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Staff</span>
        <Select
          value={selectedStaffId}
          onChange={(e) => go(e.target.value, month)}
          className="px-3 py-2"
        >
          <option value="">Choose staff…</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Payroll month</span>
        <Input
          type="month"
          value={month}
          onChange={(e) => go(selectedStaffId, e.target.value)}
          className="px-3 py-2"
        />
      </label>
    </div>
  );
}
