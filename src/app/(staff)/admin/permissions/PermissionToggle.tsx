"use client";

import { useState, useTransition } from "react";
import { setRolePermissionOverride, resetRolePermissionOverride } from "@/lib/actions/permissions";
import type { PermissionKey } from "@/lib/permissions";
import type { StaffRole } from "@/lib/constants";

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

  function handleToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setRolePermissionOverride(role, permKey, next);
      if (result?.error) setError(result.error);
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetRolePermissionOverride(role, permKey);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <label className="inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => handleToggle(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
      </label>
      {isOverride && (
        <button type="button" onClick={handleReset} disabled={pending} className="text-[10px] text-muted underline hover:text-ink">
          custom · reset
        </button>
      )}
      {error && <p className="max-w-[8rem] text-[10px] text-danger">{error}</p>}
    </div>
  );
}
