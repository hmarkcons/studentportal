"use client";

import { hasRole } from "@/lib/auth/roles";
import { useState } from "react";
import { deleteStaffAccount } from "@/lib/actions/admin";
import { useButtonAction } from "@/components/useButtonAction";
import { useAnchoredMenu } from "@/components/useAnchoredMenu";
import { SlideOver } from "@/components/ui/SlideOver";
import { STAFF_ROLE_LABELS } from "@/lib/constants";
import { StaffForm, type StaffRecord } from "./StaffForm";
import { StaffDetails } from "./StaffDetails";
import { StaffPermissionsPanel } from "../permissions/StaffPermissionsPanel";
import { StaffLoginPanel, type StaffLoginSummary } from "./StaffLoginPanel";
import { StaffAgreementsPanel } from "@/components/StaffAgreementsPanel";

type PermissionDef = { key: string; category: string; label: string; description: string; default_roles: string[] };
type RoleOverrideRow = { role: string; permission_key: string; allowed: boolean };
type StaffOverrideRow = { staff_id: string; permission_key: string; allowed: boolean };


export function StaffActionsMenu({
  staff,
  photoUrl,
  canManagePermissions = false,
  canManagePhoto = false,
  canGrantSuperAdmin = false,
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
  const { anchor, menu, style: menuStyle, portal } = useAnchoredMenu(menuOpen, () => setMenuOpen(false));

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
      {menuOpen &&
        portal(
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
                ✏️ Edit
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
              <button onClick={handleDelete} disabled={del.pending} data-full-width className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-bg">
                🗑️ Delete
              </button>
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
        <StaffDetails staff={staff} photoUrl={photoUrl} />
      </SlideOver>

      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${staff.full_name}`}>
        <StaffForm staff={staff} photoUrl={photoUrl} onSuccess={() => setEditOpen(false)} allStaff={allStaff} assignedStudentCount={assignedStudentCount} canManagePhoto={canManagePhoto} canGrantSuperAdmin={canGrantSuperAdmin} />
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
