import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from "@/lib/constants";
import type { PermissionKey } from "@/lib/permissions";
import { PermissionToggle } from "./PermissionToggle";

type PermissionDefRow = {
  key: string;
  category: string;
  label: string;
  description: string;
  default_roles: StaffRole[];
  sort_order: number;
};

const EDITABLE_ROLES = STAFF_ROLES.filter((r) => r !== "super_admin");

export default async function RolePermissionsPage() {
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.role !== "super_admin") redirect("/dashboard");

  const [{ data: defs }, { data: overrides }] = await Promise.all([
    supabase.from("permission_definitions").select("key, category, label, description, default_roles, sort_order").order("sort_order"),
    supabase.from("role_permission_overrides").select("role, permission_key, allowed"),
  ]);

  const overrideMap = new Map((overrides ?? []).map((o) => [`${o.role}:${o.permission_key}`, o.allowed]));

  const categories = new Map<string, PermissionDefRow[]>();
  for (const d of (defs ?? []) as PermissionDefRow[]) {
    if (!categories.has(d.category)) categories.set(d.category, []);
    categories.get(d.category)!.push(d);
  }

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Role Permissions</h2>
      <p className="mb-4 text-sm text-muted">
        Standard permissions come from each role&apos;s normal duties. Toggle a box to grant or revoke a specific role&apos;s access to a
        major functionality — Super Admin always has full access and isn&apos;t shown here. Some overrides can only widen access as far as
        each feature&apos;s underlying database security allows; if a grant doesn&apos;t take effect, that role&apos;s permission still
        blocks it at the data layer.
      </p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Functionality</th>
              {EDITABLE_ROLES.map((role) => (
                <th key={role} className="px-2 py-2 text-center font-medium">
                  {STAFF_ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(categories.entries()).map(([category, rows]) => (
              <Fragment key={category}>
                <tr className="bg-bg">
                  <td colSpan={EDITABLE_ROLES.length + 1} className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {category}
                  </td>
                </tr>
                {rows.map((d) => (
                  <tr key={d.key} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 align-top">
                      <p className="font-medium text-ink">{d.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{d.description}</p>
                    </td>
                    {EDITABLE_ROLES.map((role) => {
                      const overrideKey = `${role}:${d.key}`;
                      const hasOverride = overrideMap.has(overrideKey);
                      const checked = hasOverride ? overrideMap.get(overrideKey)! : d.default_roles.includes(role);
                      return (
                        <td key={role} className="px-2 py-3 text-center align-top">
                          <PermissionToggle
                            role={role}
                            permKey={d.key as PermissionKey}
                            checked={checked}
                            isOverride={hasOverride}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
