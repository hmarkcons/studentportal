"use client";

import { useActionState, useState } from "react";
import {
  inviteStudentToPortal,
  resetStudentPortalPassword,
  suspendStudentPortalAccess,
  activateStudentPortalAccess,
  deleteStudentPortalAccess,
} from "@/lib/actions/portal";
import { readCredentialAction } from "@/lib/actions/countryTracker";
import { Button } from "@/components/ui/Button";

type ActionState = { error?: string; success?: boolean; email?: string; password?: string; warning?: string } | undefined;

function ToggleButton({
  action,
  label,
  variant,
  confirmMessage,
}: {
  action: () => Promise<{ error?: string } | undefined>;
  label: string;
  variant: "outline" | "danger";
  confirmMessage?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setPending(true);
    setError(null);
    const result = await action();
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={variant} onClick={handleClick} pending={pending}>
        {label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function PortalAccessPanel({
  studentId,
  enabled,
  portalActive,
  isSuperAdmin,
}: {
  studentId: string;
  enabled: boolean;
  portalActive: boolean;
  isSuperAdmin: boolean;
}) {
  const action = enabled ? resetStudentPortalPassword.bind(null, studentId) : inviteStudentToPortal.bind(null, studentId);
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
        <div className="flex items-center gap-2">
          {enabled && (
            <Button type="button" onClick={reveal} pending={revealing}>
              Reveal credentials
            </Button>
          )}
          <form action={formAction}>
            <Button type="submit" pending={pending}>
              {enabled ? "Reset password" : "Create portal login"}
            </Button>
          </form>
          {isSuperAdmin && enabled && portalActive && (
            <ToggleButton
              action={() => suspendStudentPortalAccess(studentId)}
              label="Suspend"
              variant="outline"
              confirmMessage="Suspend this student's portal access? They'll be signed out immediately and can't log back in until reactivated."
            />
          )}
          {isSuperAdmin && enabled && !portalActive && (
            <ToggleButton action={() => activateStudentPortalAccess(studentId)} label="Activate" variant="outline" />
          )}
          {isSuperAdmin && enabled && (
            <ToggleButton
              action={() => deleteStudentPortalAccess(studentId)}
              label="Delete portal access"
              variant="danger"
              confirmMessage="Delete this student's portal login entirely? Their saved credentials will be removed and they'll need a brand new portal login created from scratch. This can't be undone."
            />
          )}
        </div>
      </div>

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
