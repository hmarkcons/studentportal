"use client";

import { useActionState, useState, useTransition } from "react";
import { checkSendingDns, saveSendingDomain } from "@/lib/actions/emailSettings";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import type { ExpectedRecord, RecordCheck } from "@/lib/emailCampaigns/dnsCheck";

const STATUS = {
  pass: { label: "In place", tone: "success" },
  fail: { label: "Not found", tone: "danger" },
  waiting: { label: "Waiting for Amazon", tone: "warning" },
} as const;

/**
 * Settings › Sending domain: the records Amazon SES needs at the DNS host, and
 * a button that looks each one up and says whether it is right.
 */
export function SendingDomainCard({
  domain,
  saved,
  dkimTokens,
  records,
  canEdit,
}: {
  domain: string | null;
  saved: string | null;
  dkimTokens: string[];
  records: ExpectedRecord[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveSendingDomain, undefined);
  const [result, setResult] = useState<{ checks: RecordCheck[]; domain: string; checkedAt: string } | { error: string } | null>(null);
  const [checking, startCheck] = useTransition();
  const byName = new Map(result && "checks" in result ? result.checks.map((c) => [`${c.type}:${c.name}`, c]) : []);
  const passed = result && "checks" in result ? result.checks.filter((c) => c.status === "pass").length : 0;

  return (
    <div className="flex flex-col gap-4" data-sending-domain>
      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset disabled={!canEdit} className="contents">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sending domain <span className="text-[10px]">(a subdomain, so the main domain&rsquo;s reputation is protected)</span>
            <Input name="sending_domain" defaultValue={saved ?? ""} placeholder={domain ?? "news.hmarkconsultants.com"} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amazon&rsquo;s DKIM tokens <span className="text-[10px]">(the three codes from SES, one a line)</span>
            <Textarea name="dkim_tokens" rows={3} defaultValue={dkimTokens.join("\n")} className="font-mono text-xs" />
          </label>
        </fieldset>
        {canEdit && (
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" pending={pending} status={{ state, label: "Saved." }}>
              Save domain
            </Button>
          </div>
        )}
      </form>

      {!domain ? (
        <p className="text-sm text-muted">Give the sending domain (or a sender address on it) to see the records it needs.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink">
              Records to add for <strong>{domain}</strong>, where hmarkconsultants.com&rsquo;s DNS is managed:
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline-primary"
              pending={checking}
              onClick={() => startCheck(async () => setResult(await checkSendingDns()))}
              data-check-dns
            >
              Check DNS
            </Button>
            {result && "checks" in result && (
              <span className="text-xs text-muted" data-dns-summary>
                {passed} of {result.checks.length} in place
              </span>
            )}
            {result && "error" in result && <span className="text-xs text-danger">{result.error}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-dns-records>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Value</th>
                  <th className="py-1 pr-3 font-medium">Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((r) => {
                  const c = byName.get(`${r.type}:${r.name}`);
                  return (
                    <tr key={`${r.type}:${r.name}`} data-dns-record={r.kind}>
                      <td className="py-1.5 pr-3 align-top font-medium text-ink">{r.type}</td>
                      <td className="py-1.5 pr-3 align-top">
                        <code className="break-all text-ink">{r.name}</code>
                        <p className="text-[11px] text-muted">{r.why}</p>
                      </td>
                      <td className="py-1.5 pr-3 align-top">
                        <code className="break-all text-ink">{r.value}</code>
                      </td>
                      <td className="py-1.5 pr-3 align-top" data-dns-status={c?.status ?? "unchecked"}>
                        {c ? <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> : <span className="text-muted">—</span>}
                        {c?.note && <p className="mt-1 text-[11px] text-muted">{c.note}</p>}
                        {c && c.status === "fail" && c.found.length > 0 && (
                          <p className="mt-1 break-all text-[11px] text-muted">Found instead: {c.found.slice(0, 3).join(" · ")}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            A record can take up to a few hours to be seen after it is added. The check asks public DNS (Cloudflare and Google), as mail providers do.
          </p>
        </>
      )}
    </div>
  );
}
