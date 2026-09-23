"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { approveOffsiteAccess, denyOffsiteAccess, revokeOffsiteAccess } from "@/lib/actions/officeAccess";
import { DEFAULT_APPROVAL_DAYS } from "@/lib/officeAccess";
import { toast } from "@/lib/toast";

// Each decision moves the request out of the list it was pressed in, so the
// button is gone once it has worked: success is a toast, a refusal is said
// under the lists.
const DONE = { approve: "Approved.", deny: "Turned down.", revoke: "Ended." } as const;

export type AccessRow = {
  id: string;
  staffName: string;
  staffRole: string | null;
  requested_ip: string | null;
  requested_user_agent: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Who is asking to work from outside the office, and who currently may.
 *
 * The length is set at the moment of approving rather than fixed, because the
 * decision and the duration are the same thought: a day for somebody waiting
 * on a plumber, a fortnight for somebody on leave abroad.
 */
export function AccessRequests({
  pending,
  granted,
  history,
  canDecide,
}: {
  pending: AccessRow[];
  granted: AccessRow[];
  history: AccessRow[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, what: "approve" | "deny" | "revoke") {
    if (what === "revoke" && !confirm("End this approval now? They will be back on the waiting screen.")) return;
    setBusy(`${id}:${what}`);
    setError(null);
    const result =
      what === "approve"
        ? await approveOffsiteAccess(id, Number(days[id] ?? DEFAULT_APPROVAL_DAYS))
        : what === "deny"
          ? await denyOffsiteAccess(id)
          : await revokeOffsiteAccess(id);
    setBusy(null);
    if (result?.error) setError(result.error);
    else {
      toast(DONE[what]);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">
          Waiting {pending.length > 0 && <Badge tone="warning">{pending.length}</Badge>}
        </h3>
        {pending.length === 0 ? (
          <p className="text-xs text-muted">Nobody is waiting.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.staffName}</span>
                  {r.staffRole && <Badge tone="neutral">{r.staffRole.replace(/_/g, " ")}</Badge>}
                  <span className="text-xs text-muted">asked {when(r.created_at)}</span>
                </div>
                <p className="text-xs text-muted">
                  From <span className="font-mono text-ink">{r.requested_ip ?? "unknown address"}</span>
                </p>
                {r.reason && <p className="mt-1 text-sm text-ink">&ldquo;{r.reason}&rdquo;</p>}
                {r.requested_user_agent && (
                  <p className="mt-1 truncate text-[11px] text-muted" title={r.requested_user_agent}>
                    {r.requested_user_agent}
                  </p>
                )}

                {canDecide && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      For how many days
                      <Input
                        type="number"
                        min="1"
                        max="90"
                        value={days[r.id] ?? String(DEFAULT_APPROVAL_DAYS)}
                        onChange={(e) => setDays((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-24"
                      />
                    </label>
                    <Button type="button" variant="primary" size="sm" pending={busy === `${r.id}:approve`} onClick={() => run(r.id, "approve")}>
                      Approve
                    </Button>
                    <Button type="button" variant="outline" size="sm" pending={busy === `${r.id}:deny`} onClick={() => run(r.id, "deny")}>
                      Not now
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Currently allowed from outside the office</h3>
        {granted.length === 0 ? (
          <p className="text-xs text-muted">Nobody. Everyone else has to be on the office network.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {granted.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.staffName}</span>
                    <Badge tone="info">until {when(r.expires_at)}</Badge>
                  </div>
                  {r.reason && <p className="mt-0.5 text-xs text-muted">&ldquo;{r.reason}&rdquo;</p>}
                </div>
                {canDecide && (
                  <button
                    type="button"
                    onClick={() => run(r.id, "revoke")}
                    disabled={busy === `${r.id}:revoke`}
                    className="w-fit text-xs text-danger hover:underline disabled:opacity-40"
                  >
                    {busy === `${r.id}:revoke` ? "Ending…" : "End now"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted">{history.length} past requests</summary>
          <div className="mt-2 flex flex-col gap-1">
            {history.map((r) => (
              <p key={r.id} className="text-xs text-muted">
                <span className="text-ink">{r.staffName}</span> &middot; {r.status}
                {r.revoked_at ? ", then ended early" : r.status === "approved" ? ", now lapsed" : ""} &middot; asked{" "}
                {when(r.created_at)}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
