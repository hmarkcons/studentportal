"use client";

import { useState, useTransition } from "react";
import { setStaffPermissionOverride, resetStaffPermissionOverride } from "@/lib/actions/permissions";
import type { PermissionKey } from "@/lib/permissions";

type Def = { key: string; category: string; label: string; description: string; default_roles: string[] };

function Toggle({
  staffId,
  permKey,
  checked,
  source,
}: {
  staffId: string;
  permKey: PermissionKey;
  checked: boolean;
  source: "personal" | "role" | "default";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setStaffPermissionOverride(staffId, permKey, next);
      if (result?.error) setError(result.error);
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetStaffPermissionOverride(staffId, permKey);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={checked} disabled={pending} onChange={(e) => handleToggle(e.target.checked)} className="h-4 w-4 accent-primary" />
      <span className="text-[10px] uppercase tracking-wide text-muted">
        {source === "personal" ? "personal override" : source === "role" ? "role override" : "default"}
      </span>
      {source === "personal" && (
        <button type="button" onClick={handleReset} disabled={pending} className="text-[10px] text-muted underline hover:text-ink">
          reset to role
        </button>
      )}
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}

// Shared by /admin/permissions (Super Admin picks any staff member) and the
// staff-profile "Permissions" panel (already scoped to one person) — both
// pass in the same plain, serializable data computed server-side.
export function StaffPermissionsPanel({
  staffId,
  staffRole,
  definitions,
  roleOverrides,
  staffOverrides,
}: {
  staffId: string;
  staffRole: string;
  definitions: Def[];
  roleOverrides: Record<string, boolean>;
  staffOverrides: Record<string, boolean>;
}) {
  const categories = new Map<string, Def[]>();
  for (const d of definitions) {
    if (!categories.has(d.category)) categories.set(d.category, []);
    categories.get(d.category)!.push(d);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(categories.entries()).map(([category, defs]) => (
        <div key={category}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{category}</h4>
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {defs.map((d) => {
              const hasStaffOverride = Object.prototype.hasOwnProperty.call(staffOverrides, d.key);
              const hasRoleOverride = Object.prototype.hasOwnProperty.call(roleOverrides, d.key);
              const checked = hasStaffOverride ? staffOverrides[d.key] : hasRoleOverride ? roleOverrides[d.key] : d.default_roles.includes(staffRole);
              const source: "personal" | "role" | "default" = hasStaffOverride ? "personal" : hasRoleOverride ? "role" : "default";
              return (
                <div key={d.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm text-ink">{d.label}</p>
                    <p className="text-xs text-muted">{d.description}</p>
                  </div>
                  <Toggle staffId={staffId} permKey={d.key as PermissionKey} checked={checked} source={source} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
