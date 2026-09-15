"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Input";

/** Which country's visa page is being built. */
export function DestinationPicker({
  destinations,
  selected,
}: {
  destinations: { id: string; display_name: string; blocks: number }[];
  selected: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function choose(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("destination", value);
    else next.delete("destination");
    router.push(`/setup/visa-page-builder?${next.toString()}`);
  }

  return (
    <label className="flex max-w-md flex-col gap-1 text-xs text-muted">
      Visa page for
      <Select value={selected} onChange={(e) => choose(e.target.value)}>
        <option value="">— choose a destination —</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
            {d.blocks > 0 ? ` (${d.blocks} on the page)` : " — nothing yet"}
          </option>
        ))}
      </Select>
    </label>
  );
}
