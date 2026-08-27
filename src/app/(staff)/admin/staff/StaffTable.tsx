"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { STAFF_ROLE_LABELS } from "@/lib/constants";
import { StaffActionsMenu } from "./StaffActionsMenu";
import type { StaffRecord } from "./StaffForm";

export function StaffTable({ staff }: { staff: StaffRecord[] }) {
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
                  <span className="font-medium text-ink">{s.full_name}</span>{" "}
                  <span className="text-xs text-muted">· {STAFF_ROLE_LABELS[s.role as never] ?? s.role}</span>
                </td>
                <td className="px-4 py-3 text-ink">{s.designation ?? "—"}</td>
                <td className="px-4 py-3 text-ink">{s.mobile_official ?? "—"}</td>
                <td className="px-4 py-3 text-ink">{s.commission_rate_general != null ? `${s.commission_rate_general}%` : "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status === "active" ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <StaffActionsMenu staff={s} />
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
