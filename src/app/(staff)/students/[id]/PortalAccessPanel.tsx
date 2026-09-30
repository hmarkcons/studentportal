"use client";

import { useActionState, useState } from "react";
import {
  inviteStudentToPortal,
  setStudentPortalPassword,
  suspendStudentPortalAccess,
  activateStudentPortalAccess,
  deleteStudentPortalAccess,
} from "@/lib/actions/portal";
import { SetPasswordForm } from "@/components/SetPasswordForm";
import { readCredentialAction } from "@/lib/actions/countryTracker";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

type ActionState = { error?: string; success?: boolean; email?: string; password?: string; warning?: string } | undefined;

function ToggleButton({
  action,
  label,
  done,
  variant,
  confirmMessage,
}: {
  action: () => Promise<{ error?: string } | undefined>;
  label: string;
  /** Said in a toast: each of these is replaced by another once it works. */
  done: string;
  variant: "outline" | "danger";
  confirmMessage?: string;
}) {
  const run = useButtonAction();

  async function handleClick() {
    if (confirmMessage && !confirm(confirmMessage)) return;
    await run.run(action, { toast: done });
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleClick}
      pending={run.pending}
      status={{ state: run.state, label: done, showError: true }}
    >
      {label}
    </Button>
  );
}

/**
 * A student's portal login. Anyone who manages the student can create it (it
 * gets a generated password, shown here and revealable later), but only a
 * Super Admin can set or reset its password afterwards — typed or generated,
 * the student emailed it and signed out everywhere (setStudentPortalPassword).
 */
export function PortalAccessPanel({
  studentId,
  studentName,
  email,
  enabled,
  portalActive,
  isSuperAdmin,
}: {
  studentId: string;
  studentName: string;
  /** Where a new password is emailed. */
  email: string | null;
  enabled: boolean;
  portalActive: boolean;
  isSuperAdmin: boolean;
}) {
  const action = inviteStudentToPortal.bind(null, studentId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function reveal() {
    setRevealing(true);
    const result = await readCredentialAction("student", studentId, "portal_login");
    setRevealed(result);
    setRevealing(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Portal access:{" "}
          {!enabled ? (
            <span className="text-zinc-400 dark:text-zinc-600">not set up</span>
          ) : portalActive ? (
            <span className="text-emerald-600 dark:text-emerald-400">enabled</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">suspended</span>
          )}
        </p>
        {/* Four buttons appear once portal access exists (reveal / reset /
            suspend / delete) — together they're wider than a phone, so let
            them wrap rather than push the page sideways. */}
        <div className="flex flex-wrap items-center gap-2">
          {enabled && (
            <Button type="button" onClick={reveal} pending={revealing}>
              Reveal credentials
            </Button>
          )}
          {!enabled && (
            <form action={formAction}>
              {/* The credentials themselves are shown below; this only says it worked. */}
              <Button type="submit" pending={pending} status={{ state, label: "Login created." }}>
                Create portal login
              </Button>
            </form>
          )}
          {isSuperAdmin && enabled && portalActive && (
            <ToggleButton
              action={() => suspendStudentPortalAccess(studentId)}
              label="Suspend"
              done="Suspended."
              variant="outline"
              confirmMessage="Suspend this student's portal access? They'll be signed out immediately and can't log back in until reactivated."
            />
          )}
          {isSuperAdmin && enabled && !portalActive && (
            <ToggleButton action={() => activateStudentPortalAccess(studentId)} label="Activate" done="Activated." variant="outline" />
          )}
          {isSuperAdmin && enabled && (
            <ToggleButton
              action={() => deleteStudentPortalAccess(studentId)}
              label="Delete portal access"
              done="Portal access deleted."
              variant="danger"
              confirmMessage="Delete this student's portal login entirely? Their saved credentials will be removed and they'll need a brand new portal login created from scratch. This can't be undone."
            />
          )}
        </div>
      </div>

      {enabled && isSuperAdmin && (
        <div className="mt-3" data-student-set-password>
          <SetPasswordForm
            name={studentName}
            email={email}
            action={(password) => setStudentPortalPassword(studentId, password)}
            onDone={() => setRevealed(null)}
          />
        </div>
      )}
      {enabled && !isSuperAdmin && (
        <p className="mt-2 text-xs text-muted">Only a Super Admin can reset or set a student&apos;s portal password.</p>
      )}

      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      {state?.success && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950">
          <p className="text-amber-800 dark:text-amber-300">Credentials (also revealable anytime via the button above):</p>
          {state.email && <p className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">{state.email}</p>}
          <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{state.password}</p>
          {state.warning && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{state.warning}</p>}
        </div>
      )}

      {revealed && (
        <div className="mt-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <p className="font-mono text-xs text-ink">{revealed.username || "No username stored"}</p>
          <p className="font-mono text-xs text-ink">{revealed.password || "No password stored"}</p>
        </div>
      )}
    </div>
  );
}
