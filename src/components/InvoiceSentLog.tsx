"use client";

import { useState, useTransition } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { listInvoiceEmailLog, type InvoiceEmailLogRow } from "@/lib/actions/invoices";
import { formatStamp } from "@/lib/activityStamp";

const KIND_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  overdue_reminder: "Overdue reminder",
};

type Loaded = { rows: InvoiceEmailLogRow[]; lastSentBeforeLog: string | null } | { error: string };

/**
 * "Sent log" on an invoice: every time it was emailed, newest first — the date
 * and time in Pakistan, the address it went to, what it was, whether it went,
 * and who sent it. Read when opened, so it is never out of date.
 */
export function InvoiceSentLogButton({ invoiceId, label }: { invoiceId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, startTransition] = useTransition();

  function show() {
    setOpen(true);
    setLoaded(null);
    startTransition(async () => {
      setLoaded(await listInvoiceEmailLog(invoiceId));
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={show} data-invoice-sent-log-open={invoiceId}>
        <History aria-hidden className="h-3.5 w-3.5 shrink-0" />
        Sent log
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Sent log${label ? ` — ${label}` : ""}`} className="max-w-2xl">
        <div data-invoice-sent-log={invoiceId}>
          {pending || !loaded ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : "error" in loaded ? (
            <p className="text-sm text-danger" role="alert">
              {loaded.error}
            </p>
          ) : loaded.rows.length === 0 && !loaded.lastSentBeforeLog ? (
            <p className="text-sm text-muted" data-invoice-sent-log-empty>
              This invoice has not been emailed yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">Date and time</th>
                    <th scope="col" className="px-3 py-2 font-medium">Sent to</th>
                    <th scope="col" className="px-3 py-2 font-medium">What</th>
                    <th scope="col" className="px-3 py-2 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top last:border-0" data-invoice-sent-log-row data-status={r.status}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink">{formatStamp(r.at)}</td>
                      <td className="break-all px-3 py-2 text-ink" data-sent-to>
                        {r.sentTo ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-ink">{KIND_LABEL[r.kind] ?? r.kind}</span>
                        {r.status === "failed" ? (
                          <span className="mt-0.5 block">
                            <Badge tone="danger">Not sent</Badge>
                            {r.error && <span className="mt-0.5 block text-xs text-danger">{r.error}</span>}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted">{r.sentBy ?? (r.kind === "overdue_reminder" ? "Automatic reminder" : "—")}</td>
                    </tr>
                  ))}
                  {loaded.lastSentBeforeLog && (
                    <tr className="align-top" data-invoice-sent-log-legacy>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink">{formatStamp(loaded.lastSentBeforeLog)}</td>
                      <td colSpan={3} className="px-3 py-2 text-xs text-muted">
                        Last sent before every email was logged — the address and anything earlier were not recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Times are Pakistan time.</p>
        </div>
      </Modal>
    </>
  );
}
