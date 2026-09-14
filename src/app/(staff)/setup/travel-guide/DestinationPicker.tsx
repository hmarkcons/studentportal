"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Input";

/** Which country's guide is being edited. */
export function DestinationPicker({
  destinations,
  selected,
}: {
  destinations: { id: string; display_name: string; sections: number }[];
  selected: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("destination", value);
    else next.delete("destination");
    router.push(`/setup/travel-guide?${next.toString()}`);
  }

  return (
    <label className="flex max-w-md flex-col gap-1 text-xs text-muted">
      Guide for
      <Select value={selected} onChange={(e) => choose(e.target.value)}>
        <option value="">— choose a destination —</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
            {d.sections > 0 ? ` (${d.sections} sections)` : " — no guide yet"}
          </option>
        ))}
      </Select>
    </label>
  );
}
