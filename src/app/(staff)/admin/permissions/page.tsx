import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from "@/lib/constants";
import type { PermissionKey } from "@/lib/permissions";
import { PermissionToggle } from "./PermissionToggle";
import { StaffPermissionsPanel } from "./StaffPermissionsPanel";

type PermissionDefRow = {
  key: string;
  category: string;
  label: string;
  description: string;
  default_roles: StaffRole[];
  sort_order: number;
};

const EDITABLE_ROLES = STAFF_ROLES.filter((r) => r !== "super_admin");

export default async function RolePermissionsPage(props: { searchParams: Promise<{ staff?: string }> }) {
  const { staff: selectedStaffId } = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  if (!staff || staff.role !== "super_admin") redirect("/dashboard");

  const [{ data: defs }, { data: overrides }, { data: allStaff }] = await Promise.all([
    supabase.from("permission_definitions").select("key, category, label, description, default_roles, sort_order").order("sort_order"),
    supabase.from("role_permission_overrides").select("role, permission_key, allowed"),
    supabase.from("staff").select("id, full_name, role").neq("role", "super_admin").order("full_name"),
  ]);

  const overrideMap = new Map((overrides ?? []).map((o) => [`${o.role}:${o.permission_key}`, o.allowed]));

  const selectedStaff = (allStaff ?? []).find((s) => s.id === selectedStaffId) ?? null;
  const { data: staffOverrideRows } = selectedStaff
    ? await supabase.from("staff_permission_overrides").select("permission_key, allowed").eq("staff_id", selectedStaff.id)
    : { data: [] };
  const staffOverrideRecord = Object.fromEntries((staffOverrideRows ?? []).map((o) => [o.permission_key, o.allowed]));
  const roleOverrideRecordForSelected = selectedStaff
    ? Object.fromEntries((overrides ?? []).filter((o) => o.role === selectedStaff.role).map((o) => [o.permission_key, o.allowed]))
    : {};

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
            <tr className="sticky top-0 z-10 border-b border-border bg-card text-left text-xs uppercase tracking-wide text-muted">
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

      <h2 className="mt-8 mb-1 text-lg font-semibold text-ink">Per-Staff Overrides</h2>
      <p className="mb-4 text-sm text-muted">
        Pick a specific staff member to grant or revoke a permission for them individually — this wins over their role&apos;s standard or
        overridden setting, and only affects that one person.
      </p>

      <Card>
        <form method="GET" className="mb-4 flex items-center gap-2">
          <select
            name="staff"
            defaultValue={selectedStaffId ?? ""}
            onChange={(e) => e.currentTarget.form?.submit()}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-ink"
          >
            <option value="">Choose a staff member…</option>
            {(allStaff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} · {STAFF_ROLE_LABELS[s.role as StaffRole] ?? s.role}
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm text-ink">
              Go
            </button>
          </noscript>
        </form>

        {selectedStaff ? (
          <StaffPermissionsPanel
            staffId={selectedStaff.id}
            staffRole={selectedStaff.role}
            definitions={(defs ?? []).map((d) => ({ ...d, default_roles: d.default_roles as unknown as string[] }))}
            roleOverrides={roleOverrideRecordForSelected}
            staffOverrides={staffOverrideRecord}
          />
        ) : (
          <p className="text-sm text-muted">No staff member selected yet.</p>
        )}
      </Card>
    </div>
  );
}
