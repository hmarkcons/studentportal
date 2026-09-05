"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { STAFF_ROLE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import { StaffActionsMenu } from "./StaffActionsMenu";
import type { StaffRecord } from "./StaffForm";

type PermissionDef = { key: string; category: string; label: string; description: string; default_roles: string[] };
type RoleOverrideRow = { role: string; permission_key: string; allowed: boolean };
type StaffOverrideRow = { staff_id: string; permission_key: string; allowed: boolean };

export function StaffTable({
  staff,
  photoUrls = {},
  canManagePermissions = false,
  permissionDefs = [],
  roleOverrides = [],
  staffOverrides = [],
  assignedStudentCounts = {},
}: {
  staff: StaffRecord[];
  photoUrls?: Record<string, string>;
  canManagePermissions?: boolean;
  permissionDefs?: PermissionDef[];
  roleOverrides?: RoleOverrideRow[];
  staffOverrides?: StaffOverrideRow[];
  assignedStudentCounts?: Record<string, number>;
}) {
  const [nameInput, setNameInput] = useState("");
  const [statusInput, setStatusInput] = useState("all");
  const [appliedName, setAppliedName] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");

  function search() {
    setAppliedName(nameInput.trim().toLowerCase());
    setAppliedStatus(statusInput);
  }

  function clear() {
    setNameInput("");
    setStatusInput("all");
    setAppliedName("");
    setAppliedStatus("all");
  }

  const rows = staff.filter((s) => {
    if (appliedName && !s.full_name.toLowerCase().includes(appliedName)) return false;
    if (appliedStatus === "active" && s.status !== "active") return false;
    if (appliedStatus === "inactive" && s.status === "active") return false;
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search staff name…"
        />
        <Select value={statusInput} onChange={(e) => setStatusInput(e.target.value)}>
          <option value="all">All Staff</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Button variant="primary" onClick={search}>
          Search
        </Button>
        <Button onClick={clear}>
          Clear
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Staff Name</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Mobile (Official)</th>
              <th className="px-4 py-3">Commission Rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {photoUrls[s.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrls[s.id]} alt="" className="h-7 w-7 rounded-full border border-border object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
                        —
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-ink">{s.full_name}</span>{" "}
                      <span className="text-xs text-muted">· {STAFF_ROLE_LABELS[s.role as never] ?? s.role}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink">{s.designation ?? "—"}</td>
                <td className="px-4 py-3 text-ink">{s.mobile_official ?? "—"}</td>
                <td className="px-4 py-3 text-ink">
                  {s.commission_rate_general != null
                    ? s.commission_type_general === "flat"
                      ? `${CURRENCY_SYMBOLS[s.currency] ?? s.currency} ${s.commission_rate_general}`
                      : `${s.commission_rate_general}%`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={s.status === "active" ? "success" : s.status === "suspended" ? "warning" : "neutral"}>
                    {s.status === "active" ? "Active" : s.status === "suspended" ? "Suspended" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <StaffActionsMenu
                    staff={s}
                    photoUrl={photoUrls[s.id]}
                    canManagePermissions={canManagePermissions}
                    permissionDefs={permissionDefs}
                    roleOverrides={roleOverrides.filter((o) => o.role === s.role)}
                    staffOverrides={staffOverrides.filter((o) => o.staff_id === s.id)}
                    allStaff={staff}
                    assignedStudentCount={assignedStudentCounts[s.id] ?? 0}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No staff match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
