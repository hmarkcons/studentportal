"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ActionStatus } from "@/components/ActionStatus";
import { addOfficeNetwork, removeOfficeNetwork } from "@/lib/actions/officeAccess";

export type NetworkRow = { id: string; label: string; network: string; note: string | null };

/**
 * The addresses treated as the office.
 *
 * The address of whoever is looking is shown with a button that fills the form
 * in, because that is how this is really used: somebody sits at the office
 * and says "this one". Typing an address from memory is how the wrong range
 * ends up on the list.
 */
export function OfficeNetworkPanel({
  networks,
  currentIp,
  canEdit,
}: {
  networks: NetworkRow[];
  currentIp: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(addOfficeNetwork, undefined);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const alreadyListed = currentIp ? networks.some((n) => n.network === `${currentIp}/32` || n.network === currentIp) : false;

  async function remove(id: string, label: string) {
    if (!confirm(`Remove ${label} from the office network?`)) return;
    setBusy(id);
    setError(null);
    const result = await removeOfficeNetwork(id);
    setBusy(null);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {networks.length === 0 ? (
        <div className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
          <p className="font-medium">The gate is switched off.</p>
          <p className="mt-1">
            With no network on this list, nothing is enforced and every staff member can sign in from anywhere &mdash;
            exactly as before. It starts working the moment you add the office&rsquo;s address, and not before, so that
            adding this feature could not lock the office out of its own portal.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {networks.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{n.label}</span>
                  <Badge tone="neutral">
                    <span className="font-mono">{n.network}</span>
                  </Badge>
                  {currentIp && (n.network === `${currentIp}/32` || n.network === currentIp) && (
                    <Badge tone="success">You are on this one</Badge>
                  )}
                </div>
                {n.note && <p className="mt-0.5 text-xs text-muted">{n.note}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(n.id, n.label)}
                  disabled={busy === n.id}
                  className="text-xs text-danger hover:underline disabled:opacity-40"
                >
                  {busy === n.id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          ))}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}

      {canEdit && (
        <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Name
              <Input name="label" placeholder="Main office (Karachi)" maxLength={80} required className="w-56" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Address or range
              <Input
                name="network"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="203.0.113.47 or 203.0.113.0/24"
                required
                className="w-56 font-mono"
              />
            </label>
            <Button type="submit" variant="primary" pending={pending}>
              Add
            </Button>
            <ActionStatus state={state} pending={pending} label="Added." />
          </div>

          {currentIp && (
            <p className="text-xs text-muted">
              You are connecting from <span className="font-mono text-ink">{currentIp}</span>.{" "}
              {alreadyListed ? (
                "It is already on the list."
              ) : (
                <button type="button" onClick={() => setValue(currentIp)} className="font-medium text-primary hover:underline">
                  Use this address
                </button>
              )}
            </p>
          )}
          {!currentIp && (
            <p className="text-xs text-muted">
              Your address could not be read from this request, so it cannot be filled in for you.
            </p>
          )}
          <p className="text-[11px] text-muted">
            A single address is stored as a /32. A range like 203.0.113.0/24 covers every address in it &mdash; use one
            only if the whole range is yours.
          </p>
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
