"use client";

import { useState } from "react";
import { deleteStaffAccount } from "@/lib/actions/admin";
import { formatDateOnly } from "@/lib/formatDate";
import { SlideOver } from "@/components/ui/SlideOver";
import { STAFF_ROLE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import { StaffForm, type StaffRecord } from "./StaffForm";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value ?? "—"}</span>
    </div>
  );
}

export function StaffActionsMenu({ staff }: { staff: StaffRecord }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete ${staff.full_name}? This fails if they have historical records — use Inactive status instead if so.`)) return;
    const result = await deleteStaffAccount(staff.id);
    if (result?.error) setDeleteError(result.error);
    setMenuOpen(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button onClick={() => setMenuOpen((v) => !v)} className="rounded-md px-2 py-1 text-lg text-muted hover:bg-bg hover:text-ink" aria-label="Actions">
        ⋮
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
            <button
              onClick={() => {
                setViewOpen(true);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
            >
              👁️ View
            </button>
            <button
              onClick={() => {
                setEditOpen(true);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
            >
              ✏️ Edit
            </button>
            <button onClick={handleDelete} className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg">
              🗑️ Delete
            </button>
          </div>
        </>
      )}
      {deleteError && <p className="absolute right-0 mt-1 w-56 text-xs text-danger">{deleteError}</p>}

      <SlideOver open={viewOpen} onClose={() => setViewOpen(false)} title={staff.full_name}>
        <div className="flex flex-col">
          <h4 className="mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Personal Information</h4>
          <Row label="Designation" value={staff.designation} />
          <Row label="Role" value={STAFF_ROLE_LABELS[staff.role as never] ?? staff.role} />
          <Row label="Gender" value={staff.gender} />
          <Row label="Date of birth" value={staff.date_of_birth ? formatDateOnly(staff.date_of_birth) : null} />
          <Row label="Marital status" value={staff.marital_status} />
          <Row label="CNIC" value={staff.cnic} />
          <Row label="Address" value={staff.address} />

          <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Contact</h4>
          <Row label="Mobile (Personal)" value={staff.mobile_personal} />
          <Row label="Mobile (Official)" value={staff.mobile_official} />
          <Row label="Email (Personal)" value={staff.email_personal} />
          <Row label="Email (Official)" value={staff.email_official} />
          <Row label="Emergency contact" value={staff.emergency_contact_name} />
          <Row label="Emergency number" value={staff.emergency_contact_number} />
          <Row label="Emergency relation" value={staff.emergency_contact_relation} />

          <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Compensation</h4>
          <Row
            label="Monthly salary"
            value={staff.monthly_salary != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.monthly_salary}` : null}
          />
          <Row label="Allowance" value={staff.allowance != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.allowance}` : null} />
          <Row label="Commission rate (general)" value={staff.commission_rate_general != null ? `${staff.commission_rate_general}%` : null} />
          <Row
            label="Commission rate (public universities)"
            value={staff.commission_rate_public_universities != null ? `${staff.commission_rate_public_universities}%` : null}
          />
          <Row label="Monthly target" value={staff.monthly_target} />

          <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Status</h4>
          <Row label="Status" value={staff.status === "active" ? "Active" : "Inactive"} />
        </div>
      </SlideOver>

      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${staff.full_name}`}>
        <StaffForm staff={staff} onSuccess={() => setEditOpen(false)} />
      </SlideOver>
    </div>
  );
}
