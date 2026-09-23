"use client";

import { useState } from "react";
import { useButtonAction } from "@/components/useButtonAction";
import { ActionStatus } from "@/components/ActionStatus";
import { advanceSocialPostStatus } from "@/lib/actions/marketing";
import { Select } from "@/components/ui/Input";
import { SOCIAL_POST_STATUSES, socialPostStatusLabel } from "@/lib/marketing";

export function StatusAdvance({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  // Saves as it changes, so the confirmation — or the refusal — sits beside
  // it. Disabled while saving: a second change made mid-save would show on
  // screen and never be sent.
  const save = useButtonAction();

  async function handleChange(next: string) {
    const previous = value;
    setValue(next);
    const result = await save.run(() => advanceSocialPostStatus(id, next));
    if (result?.error) setValue(previous);
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <Select value={value} disabled={save.pending} onChange={(e) => handleChange(e.target.value)} className="text-xs">
        {SOCIAL_POST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {socialPostStatusLabel(s)}
          </option>
        ))}
      </Select>
      <ActionStatus state={save.state} pending={save.pending} label="Saved." showError />
    </div>
  );
}
