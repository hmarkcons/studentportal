"use client";

import { Select } from "@/components/ui/Input";

function formatLabel(hour: number, minute: number) {
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push({ value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, label: formatLabel(h, m) });
  }
}

export function TimeSelect({
  name,
  defaultValue,
  value,
  onChange,
  className,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
}) {
  return (
    <Select name={name} defaultValue={value === undefined ? (defaultValue ?? "") : undefined} value={value} onChange={onChange} className={className}>
      <option value="">No specific time</option>
      {TIME_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
