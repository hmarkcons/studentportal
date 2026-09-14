"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CredentialField } from "@/components/CredentialField";
import { portalLabelError, scholarshipPortalType, type ScholarshipPortal } from "@/lib/scholarshipPortal";

/**
 * The student's logins for the scholarship portals.
 *
 * Several, because there are several: the regional agency's own portal,
 * Universitaly, sometimes the university's. Each is named by the office and
 * then stored and read through exactly the same encrypted path as the visa
 * appointment login — nothing here holds a password itself, and nothing is
 * decrypted until somebody presses Show.
 *
 * Adding a portal is only naming it. The credential row appears when its
 * username and password are first saved, so a half-added portal leaves nothing
 * behind.
 */
export function ScholarshipPortals({
  studentId,
  portals,
  canManage,
  revalidateTo,
}: {
  studentId: string;
  portals: ScholarshipPortal[];
  canManage: boolean;
  revalidateTo: string;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Named but not yet saved, so its fields can be filled in.
  const [pendingPortals, setPendingPortals] = useState<ScholarshipPortal[]>([]);

  const all = [...portals, ...pendingPortals.filter((p) => !portals.some((e) => e.credentialType === p.credentialType))];

  function add() {
    const issue = portalLabelError(label, all.map((p) => p.label));
    if (issue) {
      setError(issue);
      return;
    }
    setPendingPortals((prev) => [...prev, { credentialType: scholarshipPortalType(label), label: label.trim() }]);
    setLabel("");
    setError(null);
    setAdding(false);
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">Scholarship portal logins</h3>
        {canManage && !adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            + Add a portal
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">
        The student&rsquo;s own accounts on the portals they have to use — the regional agency, Universitaly, the
        university&rsquo;s own. Encrypted, and shown to the student on their own Scholarship tab so they do not have to
        ring the office for their own password.
      </p>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Portal name
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError(null);
              }}
              placeholder="e.g. DSU Toscana"
              maxLength={60}
              autoFocus
            />
          </label>
          <Button type="button" variant="primary" size="sm" onClick={add}>
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(false);
              setLabel("");
              setError(null);
            }}
          >
            Cancel
          </Button>
          {error && <p className="w-full text-xs text-danger">{error}</p>}
        </div>
      )}

      {all.length === 0 ? (
        <p className="text-xs text-muted">
          No portal logins saved yet.{canManage ? " Add one once the student has registered on the agency's site." : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {all.map((p) => (
            <CredentialField
              key={p.credentialType}
              label={p.label}
              ownerType="student"
              ownerId={studentId}
              credentialType={p.credentialType}
              revalidateTo={revalidateTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
