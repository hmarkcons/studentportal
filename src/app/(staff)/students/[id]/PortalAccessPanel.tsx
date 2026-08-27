"use client";

import { useActionState, useState } from "react";
import { inviteStudentToPortal, resetStudentPortalPassword } from "@/lib/actions/portal";
import { readCredentialAction } from "@/lib/actions/countryTracker";

type ActionState = { error?: string; success?: boolean; email?: string; password?: string } | undefined;

export function PortalAccessPanel({ studentId, enabled }: { studentId: string; enabled: boolean }) {
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Portal access: {enabled ? <span className="text-emerald-600 dark:text-emerald-400">enabled</span> : <span className="text-zinc-400 dark:text-zinc-600">not set up</span>}
        </p>
        <div className="flex items-center gap-2">
          {enabled && (
            <button
              type="button"
              onClick={reveal}
              disabled={revealing}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {revealing ? "Loading…" : "Reveal credentials"}
            </button>
          )}
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {pending ? "Working…" : enabled ? "Reset password" : "Create portal login"}
            </button>
          </form>
        </div>
      </div>

      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      {state?.success && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950">
          <p className="text-amber-800 dark:text-amber-300">Credentials (also revealable anytime via the button above):</p>
          {state.email && <p className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">{state.email}</p>}
          <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{state.password}</p>
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
