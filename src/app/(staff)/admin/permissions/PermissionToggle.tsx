"use client";

import { useState, useTransition } from "react";
import { setRolePermissionOverride, resetRolePermissionOverride } from "@/lib/actions/permissions";
import type { PermissionKey } from "@/lib/permissions";
import type { StaffRole } from "@/lib/constants";
import type { ActionResultLike } from "@/lib/actionStatus";
import { ActionStatus } from "@/components/ActionStatus";

export function PermissionToggle({
  role,
  permKey,
  checked,
  isOverride,
}: {
  role: StaffRole;
  permKey: PermissionKey;
  checked: boolean;
  isOverride: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // What the last change did, one object per result, so the "Saved." beside
  // the checkbox belongs to that change and not the next.
  const [done, setDone] = useState<{ state: ActionResultLike; label: string } | null>(null);

  function handleToggle(next: boolean) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await setRolePermissionOverride(role, permKey, next);
      if (result?.error) setError(result.error);
      else setDone({ state: { success: true }, label: "Saved." });
    });
  }

  function handleReset() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await resetRolePermissionOverride(role, permKey);
      if (result?.error) setError(result.error);
      else setDone({ state: { success: true }, label: "Reset." });
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="inline-flex items-center gap-1">
        <label className="inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={checked}
            disabled={pending}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </label>
        <ActionStatus state={done?.state} pending={pending} label={done?.label} />
      </span>
      {isOverride && (
        <button type="button" onClick={handleReset} disabled={pending} className="w-fit text-[10px] text-muted underline hover:text-ink">
          custom · reset
        </button>
      )}
      {error && <p className="max-w-[8rem] text-[10px] text-danger">{error}</p>}
    </div>
  );
}
