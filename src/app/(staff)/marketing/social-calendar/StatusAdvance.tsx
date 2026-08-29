"use client";

import { useState } from "react";
import { advanceSocialPostStatus } from "@/lib/actions/marketing";
import { Select } from "@/components/ui/Input";

const STATUSES = ["brief_sent", "in_design", "ready_for_review", "approved", "scheduled", "posted"];

export function StatusAdvance({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    const result = await advanceSocialPostStatus(id, next);
    if (result?.error) {
      setError(result.error);
      setValue(previous);
    }
  }

  return (
    <div>
      <Select value={value} onChange={(e) => handleChange(e.target.value)} className="text-xs">
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </Select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
