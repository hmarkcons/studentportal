"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Input";

type Destination = { id: string; display_name: string };

/**
 * Which checklist is being edited. "All destinations" sits at the top as an
 * entry of its own, because that is where a shared requirement gets edited —
 * it is not a filter meaning "everything".
 */
export function DestinationPicker({
  destinations,
  selected,
  sectionCounts,
  allCount,
}: {
  destinations: Destination[];
  selected: string;
  sectionCounts: Record<string, number>;
  allCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("destination", value);
    else next.delete("destination");
    router.push(`/setup/create-doc-checklist?${next.toString()}`);
  }

  return (
    <label className="flex max-w-md flex-col gap-1 text-xs text-muted">
      Checklist for
      <Select value={selected} onChange={(e) => choose(e.target.value)}>
        <option value="">— choose a destination —</option>
        <option value="all">All destinations ({allCount} sections) — shared by every country</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name} ({sectionCounts[d.id] ?? 0} sections)
          </option>
        ))}
      </Select>
    </label>
  );
}
