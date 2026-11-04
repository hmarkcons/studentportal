"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/Input";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

  // A month and a year, each its own list, rather than <input type="month">:
  // desktop Safari and Firefox have no month picker and show a bare text box
  // for it, so on a Mac the payroll month could only be typed as "2026-11".
  const [year, mm] = /^\d{4}-\d{2}$/.test(month) ? month.split("-") : ["", ""];
  const thisYear = new Date().getFullYear();
  const years = Array.from(new Set([...Array.from({ length: thisYear + 2 - 2024 }, (_, i) => String(2024 + i)), ...(year ? [year] : [])])).sort();
  const pick = (y: string, m: string) => go(selectedStaffId, y && m ? `${y}-${m}` : "");

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
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-muted">Payroll month</legend>
        <div className="flex gap-2">
          <Select aria-label="Payroll month" value={mm} onChange={(e) => pick(year || String(thisYear), e.target.value)} className="px-3 py-2">
            <option value="">Month…</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>
                {name}
              </option>
            ))}
          </Select>
          <Select aria-label="Payroll year" value={year} onChange={(e) => pick(e.target.value, mm || String(new Date().getMonth() + 1).padStart(2, "0"))} className="px-3 py-2">
            <option value="">Year…</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>
    </div>
  );
}
