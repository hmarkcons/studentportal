"use client";

import { useEffect, useState } from "react";
import { lookUpAudience, restoreEmailAddress, type AudienceLookup } from "@/lib/actions/emailAudience";
import { CONTACT_STATUS_LABELS } from "@/lib/emailCampaigns/audience";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useButtonAction } from "@/components/useButtonAction";

const TONE = { subscribed: "success", unsubscribed: "neutral", bounced: "danger", complained: "danger", suppressed: "warning", invalid: "warning" } as const;

function Restore({ email, onDone }: { email: string; onDone: () => void }) {
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={run.pending}
      status={{ state: run.state, label: "Restored.", showError: true }}
      onClick={async () => {
        const r = await run.run(() => restoreEmailAddress(email));
        if (r && "success" in r) onDone();
      }}
    >
      Take off the do-not-email list
    </Button>
  );
}

export function AudienceLookupPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AudienceLookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const r = await lookUpAudience(query);
      if ("error" in r) setError(r.error);
      else {
        setError(null);
        setResults(r);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tick]);
  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="flex flex-col gap-3" data-audience-lookup>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="A name or an email address" className="max-w-md" />
      {error && <p className="text-xs text-danger">{error}</p>}
      {shown.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {shown.map((p) => (
            <li key={`${p.kind}:${p.id}`} className="flex flex-col gap-1 p-3 text-xs sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {p.name} <span className="text-muted">· {p.kind === "lead" ? "lead" : "imported contact"}</span>
                </p>
                <p className="break-all text-muted">{p.email ?? "No usable email address"}</p>
                <p className="text-muted">
                  Consent: {p.consentSource}
                  {p.consentAt ? `, ${new Date(p.consentAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}` : ""}
                </p>
                {p.statusReason && <p className="text-muted">{p.statusReason}</p>}
                {p.topics.length > 0 && <p className="text-muted">Topics: {p.topics.join(", ")}</p>}
                {p.lists.length > 0 && <p className="text-muted">Lists: {p.lists.join(", ")}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                <Badge tone={TONE[p.status]}>{CONTACT_STATUS_LABELS[p.status]}</Badge>
                {p.email && (p.status === "suppressed" || p.status === "bounced" || p.status === "invalid") && (
                  <Restore email={p.email} onDone={() => setTick((t) => t + 1)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && shown.length === 0 && !error && <p className="text-xs text-muted">No one found yet…</p>}
    </div>
  );
}
