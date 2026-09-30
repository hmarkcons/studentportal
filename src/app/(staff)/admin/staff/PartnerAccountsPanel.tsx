"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { revealPartnerCredentials, setPartnerPassword } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { CredentialsBox, SetPasswordForm } from "@/components/SetPasswordForm";

/** A partner university account, as a Super Admin manages its login. */
export type PartnerAccountRow = {
  id: string;
  name: string;
  university: string;
  status: string;
  loginEmail: string | null;
  lastSignInAt: string | null;
  /** When a copy of its password was kept; null when none is (they chose their own at sign-up). */
  copyKeptAt: string | null;
};

const WHEN: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", WHEN);

function PartnerLogin({ row }: { row: PartnerAccountRow }) {
  const reveal = useButtonAction();
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const [nothingKept, setNothingKept] = useState(false);

  async function handleReveal() {
    const result = await reveal.run(() => revealPartnerCredentials(row.id));
    if (result && "success" in result && result.success) {
      setNothingKept(!result.credentials);
      setRevealed(result.credentials ? { email: result.credentials.email, password: result.credentials.password } : null);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Signs in with</dt>
        <dd className="break-all text-ink">{row.loginEmail ?? "—"}</dd>
        <dt className="text-muted">Last signed in</dt>
        <dd className={row.lastSignInAt ? "text-ink" : "text-warning"}>{row.lastSignInAt ? when(row.lastSignInAt) : "Never"}</dd>
        <dt className="text-muted">Password copy</dt>
        <dd className="text-ink">{row.copyKeptAt ? `Kept — set ${when(row.copyKeptAt)}` : "None kept — they chose their own when they registered"}</dd>
      </dl>
      {row.copyKeptAt && (
        <div>
          {revealed ? (
            <Button type="button" size="sm" onClick={() => setRevealed(null)}>
              Hide password
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleReveal} pending={reveal.pending} status={{ state: reveal.state, label: "Shown below.", showError: true }}>
              Reveal password
            </Button>
          )}
          {revealed && <CredentialsBox credentials={revealed} />}
          {nothingKept && <p className="mt-1 text-xs text-muted">No copy is kept — set a password instead.</p>}
        </div>
      )}
      {row.loginEmail ? (
        <SetPasswordForm
          name={row.name}
          email={row.loginEmail}
          action={(password) => setPartnerPassword(row.id, password)}
          onDone={() => setRevealed(null)}
        />
      ) : (
        <p className="text-xs text-muted">This account has no login.</p>
      )}
    </div>
  );
}

/**
 * Every partner university account, for a Super Admin to manage its login:
 * who signs in, when they last did, the kept copy of the password and a way
 * to set a new one. Approving a new account stays in the list above.
 */
export function PartnerAccountsPanel({ rows }: { rows: PartnerAccountRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No partner university accounts yet.</p>;
  return (
    <div className="flex flex-col divide-y divide-border" data-partner-accounts>
      {rows.map((row) => (
        <details key={row.id} className="group" data-partner-account={row.id}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
              <span className="truncate text-ink">
                {row.name} · <span className="text-muted">{row.university}</span>
              </span>
            </span>
            <Badge tone={row.status === "active" ? "success" : row.status === "pending" ? "warning" : "neutral"}>{row.status}</Badge>
          </summary>
          <div className="pl-6">
            <PartnerLogin row={row} />
          </div>
        </details>
      ))}
    </div>
  );
}
