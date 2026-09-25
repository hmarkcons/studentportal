"use client";

import { hasRole, staffRoles } from "@/lib/auth/roles";
import { useState } from "react";
import { deleteStaffAccount } from "@/lib/actions/admin";
import { useButtonAction } from "@/components/useButtonAction";
import { useAnchoredMenu } from "@/components/useAnchoredMenu";
import { formatDateOnly } from "@/lib/formatDate";
import { SlideOver } from "@/components/ui/SlideOver";
import { STAFF_ROLE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import { StaffForm, type StaffRecord } from "./StaffForm";
import { StaffPermissionsPanel } from "../permissions/StaffPermissionsPanel";
import { StaffLoginPanel, type StaffLoginSummary } from "./StaffLoginPanel";
import { StaffAgreementsPanel } from "@/components/StaffAgreementsPanel";

type PermissionDef = { key: string; category: string; label: string; description: string; default_roles: string[] };
type RoleOverrideRow = { role: string; permission_key: string; allowed: boolean };
type StaffOverrideRow = { staff_id: string; permission_key: string; allowed: boolean };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value ?? "—"}</span>
    </div>
  );
}

export function StaffActionsMenu({
  staff,
  photoUrl,
  canManagePermissions = false,
  canManagePhoto = false,
  canGrantSuperAdmin = false,
  rolesOnly = false,
  permissionDefs = [],
  roleOverrides = [],
  staffOverrides = [],
  allStaff = [],
  assignedStudentCount = 0,
  login,
  canManageAgreements = false,
}: {
  staff: StaffRecord;
  photoUrl?: string | null;
  canManagePermissions?: boolean;
  canManagePhoto?: boolean;
  /** Only a Super Admin may grant or remove the Super Admin role. */
  canGrantSuperAdmin?: boolean;
  /** Roles-only editing, for a viewer without staff.manage. */
  rolesOnly?: boolean;
  permissionDefs?: PermissionDef[];
  roleOverrides?: RoleOverrideRow[];
  staffOverrides?: StaffOverrideRow[];
  allStaff?: StaffRecord[];
  assignedStudentCount?: number;
  /** Given only to a Super Admin viewer — its presence is what shows the Login item. */
  login?: StaffLoginSummary;
  /** staff_agreements.manage — a Super Admin's until granted to a role. */
  canManageAgreements?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [agreementsOpen, setAgreementsOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const del = useButtonAction();
  const showPermissions = canManagePermissions && !hasRole(staff, "super_admin");
  // On the screen rather than in the row: the staff table scrolls in its own
  // window, which cut a menu opened near its bottom edge short.
  const { anchor, menu, style: menuStyle } = useAnchoredMenu(menuOpen, () => setMenuOpen(false));

  async function handleDelete() {
    if (!confirm(`Delete ${staff.full_name}? This fails if they have historical records — use Inactive status instead if so.`)) return;
    setDeleteError(null);
    // The row goes with the account, so success is a toast; a refusal is
    // said under the menu, as before.
    const result = await del.run(() => deleteStaffAccount(staff.id), { toast: "Staff account deleted." });
    if (result?.error) setDeleteError(result.error);
    setMenuOpen(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button ref={anchor} onClick={() => setMenuOpen((v) => !v)} className="rounded-md px-2 py-1 text-lg text-muted hover:bg-bg hover:text-ink" aria-label="Actions">
        ⋮
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div ref={menu} style={menuStyle} data-menu className="z-20 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
            <button
              onClick={() => {
                setViewOpen(true);
                setMenuOpen(false);
              }}
              data-full-width
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
            >
              👁️ View
            </button>
            <button
              onClick={() => {
                setEditOpen(true);
                setMenuOpen(false);
              }}
              data-full-width
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
            >
              {rolesOnly ? "🔑 Roles" : "✏️ Edit"}
            </button>
            {showPermissions && (
              <button
                onClick={() => {
                  setPermissionsOpen(true);
                  setMenuOpen(false);
                }}
                data-full-width
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
              >
                🔑 Permissions
              </button>
            )}
            {canManageAgreements && (
              <button
                onClick={() => {
                  setAgreementsOpen(true);
                  setMenuOpen(false);
                }}
                data-full-width
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
              >
                📄 Agreements
              </button>
            )}
            {login && (
              <button
                onClick={() => {
                  setLoginOpen(true);
                  setMenuOpen(false);
                }}
                data-full-width
                className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
              >
                🔐 Login
              </button>
            )}
            {/* Deleting a staff account is not a role change — it belongs
                with staff.manage, same as the action behind it. */}
            {!rolesOnly && (
              <button onClick={handleDelete} disabled={del.pending} data-full-width className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg">
                🗑️ Delete
              </button>
            )}
          </div>
        </>
      )}
      {deleteError && <p className="absolute right-0 mt-1 w-56 text-xs text-danger">{deleteError}</p>}

      {canManageAgreements && (
        <SlideOver open={agreementsOpen} onClose={() => setAgreementsOpen(false)} title={`Agreements — ${staff.full_name}`} wide>
          <StaffAgreementsPanel staffId={staff.id} staffName={staff.full_name} />
        </SlideOver>
      )}

      {login && (
        <SlideOver open={loginOpen} onClose={() => setLoginOpen(false)} title={`Login — ${staff.full_name}`}>
          <StaffLoginPanel
            staffId={staff.id}
            staffName={staff.full_name}
            officialEmail={staff.email_official ?? null}
            status={staff.status ?? "active"}
            login={login}
          />
        </SlideOver>
      )}

      <SlideOver open={viewOpen} onClose={() => setViewOpen(false)} title={staff.full_name}>
        <div className="flex flex-col">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="mb-4 h-20 w-20 rounded-full border border-border object-cover" />
          )}
          <h4 className="mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Personal Information</h4>
          <Row label="Designation" value={staff.designation} />
          <Row
            label={staffRoles(staff).length > 1 ? "Roles" : "Role"}
            value={staffRoles(staff).map((r) => STAFF_ROLE_LABELS[r] ?? r).join(", ")}
          />
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

          {/* Withheld, not blanked: the page doesn't fetch pay for a
              roles-only viewer, so every row here would read "—" and look like
              missing data rather than data that isn't theirs. */}
          {!rolesOnly && (
            <>
            <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Compensation</h4>
            <Row
              label="Monthly salary"
              value={staff.monthly_salary != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.monthly_salary}` : null}
            />
            <Row label="Allowance" value={staff.allowance != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.allowance}` : null} />
            <Row
              label="Commission — private universities"
              value={
                staff.commission_rate_general != null
                  ? staff.commission_type_general === "flat"
                    ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.commission_rate_general} (flat)`
                    : `${staff.commission_rate_general}%`
                  : null
              }
            />
            <Row
              label="Commission — public universities"
              value={
                staff.commission_rate_public_universities != null
                  ? staff.commission_type_public_universities === "flat"
                    ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.commission_rate_public_universities} (flat)`
                    : `${staff.commission_rate_public_universities}%`
                  : null
              }
            />
            <Row label="Monthly target" value={staff.monthly_target} />
            <Row
              label="Monthly bonus"
              value={staff.bonus_eligible ? `Eligible — ${staff.bonus_rate_percent}% increment when target is hit` : "Not eligible"}
            />
            </>
          )}

          <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Status</h4>
          <Row label="Status" value={staff.status === "active" ? "Active" : staff.status === "suspended" ? "Suspended" : "Inactive"} />
        </div>
      </SlideOver>

      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title={`${rolesOnly ? "Roles" : "Edit"} — ${staff.full_name}`}>
        <StaffForm staff={staff} photoUrl={photoUrl} onSuccess={() => setEditOpen(false)} allStaff={allStaff} assignedStudentCount={assignedStudentCount} canManagePhoto={canManagePhoto} canGrantSuperAdmin={canGrantSuperAdmin} rolesOnly={rolesOnly} />
      </SlideOver>

      {showPermissions && (
        <SlideOver open={permissionsOpen} onClose={() => setPermissionsOpen(false)} title={`Permissions — ${staff.full_name}`}>
          <p className="mb-4 text-xs text-muted">
            Overrides set here apply only to {staff.full_name} and win over their role&apos;s ({STAFF_ROLE_LABELS[staff.role as never] ?? staff.role})
            standard or overridden permissions.
          </p>
          <StaffPermissionsPanel
            staffId={staff.id}
            staffRole={staff.role}
            definitions={permissionDefs}
            roleOverrides={Object.fromEntries(roleOverrides.map((o) => [o.permission_key, o.allowed]))}
            staffOverrides={Object.fromEntries(staffOverrides.map((o) => [o.permission_key, o.allowed]))}
          />
        </SlideOver>
      )}
    </div>
  );
}
