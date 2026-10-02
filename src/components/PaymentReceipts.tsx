"use client";

import { useState, useTransition } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { uploadedLine } from "@/lib/activityStamp";
import { formatFileSize } from "@/lib/fileSize";
import { receiptButtonLabel, type ReceiptKind } from "@/lib/paymentReceipts";
import { listPaymentReceipts, removePaymentReceipt, uploadPaymentReceipt, type PaymentReceipt } from "@/lib/actions/paymentReceipts";

/**
 * The receipts on one payment (0308): a button saying how many there are, and
 * a pop-up listing them — each to open, with who uploaded it and when — with
 * a place to add another and a way to remove one attached by mistake.
 *
 * Shown only to whoever may handle that payment's receipts; the caller
 * decides, and the server and the database each check again. A receipt never
 * changes the payment's status.
 */
export function PaymentReceiptsButton({
  kind,
  paymentId,
  count,
  title,
  revalidateTo,
}: {
  kind: ReceiptKind;
  paymentId: string;
  /** How many are on file, as the page read them. */
  count: number;
  /** What the payment is, for the pop-up: "Instalment 2 — Ali Khan". */
  title: string;
  revalidateTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [receipts, setReceipts] = useState<PaymentReceipt[] | null>(null);
  // Kept here so the button is right the moment one is added or removed,
  // before the page has been read again.
  const [shown, setShown] = useState(count);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [uploading, startUploading] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // A fresh file field after each upload.
  const [fieldKey, setFieldKey] = useState(0);

  function openList() {
    setOpen(true);
    setError(null);
    startLoading(async () => {
      const result = await listPaymentReceipts(kind, paymentId);
      if ("error" in result) setError(result.error);
      else {
        setReceipts(result.receipts);
        setShown(result.receipts.length);
      }
    });
  }

  function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    startUploading(async () => {
      const result = await uploadPaymentReceipt(kind, paymentId, revalidateTo, data);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setReceipts((list) => [...(list ?? []), result.receipt]);
      setShown((n) => n + 1);
      setReady(false);
      setFieldKey((k) => k + 1);
    });
  }

  async function remove(id: string) {
    setRemovingId(id);
    setError(null);
    const result = await removePaymentReceipt(kind, id, revalidateTo);
    setRemovingId(null);
    setConfirmId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setReceipts((list) => (list ?? []).filter((r) => r.id !== id));
    setShown((n) => Math.max(0, n - 1));
  }

  return (
    <>
      <button
        type="button"
        onClick={openList}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          shown > 0 ? "border-primary text-primary hover:bg-primary/10" : "border-border text-muted hover:bg-bg hover:text-ink"
        }`}
        aria-label={shown > 0 ? `${shown} payment receipt${shown === 1 ? "" : "s"} for ${title}` : `Add a payment receipt for ${title}`}
        data-receipts-button={paymentId}
        data-receipts-count={shown}
      >
        <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {receiptButtonLabel(shown)}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Payment receipts — ${title}`}>
        <div className="flex flex-col gap-4" data-receipts-dialog={paymentId}>
          {receipts === null ? (
            <p className="text-sm text-muted">{loading ? "Loading…" : ""}</p>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted" data-receipts-empty>
              No receipt on file yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border" data-receipts-list>
              {receipts.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2" data-receipt={r.id}>
                  <div className="min-w-0">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        data-receipt-link
                      >
                        <FileText aria-hidden className="h-4 w-4 shrink-0" />
                        <span className="truncate">{r.fileName}</span>
                      </a>
                    ) : (
                      <span className="text-sm text-ink">{r.fileName}</span>
                    )}
                    <p className="mt-0.5 text-xs text-muted" data-receipt-meta>
                      {uploadedLine({ at: r.uploadedAt, byRole: "staff", audience: "staff", staffName: r.uploadedBy })}
                      {r.sizeBytes ? ` · ${formatFileSize(r.sizeBytes)}` : ""}
                    </p>
                  </div>
                  {confirmId === r.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="sm" variant="danger" pending={removingId === r.id} onClick={() => remove(r.id)}>
                        Remove
                      </Button>
                      <Button type="button" size="sm" onClick={() => setConfirmId(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(r.id)}
                      className="shrink-0 rounded p-1 text-muted hover:bg-bg hover:text-danger"
                      aria-label={`Remove ${r.fileName}`}
                      title="Remove this receipt"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              upload(e.currentTarget);
            }}
          >
            <FileField
              key={fieldKey}
              required
              hint="PDF or image"
              noun="receipt"
              className="min-w-0 flex-1"
              onChange={(s) => setReady(Boolean(s.file) && !s.busy && !s.error)}
            />
            <Button type="submit" variant="primary" size="sm" pending={uploading} disabled={!ready}>
              Upload receipt
            </Button>
          </form>
          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="text-xs text-muted">Adding or removing a receipt does not change whether the payment is marked paid.</p>
        </div>
      </Modal>
    </>
  );
}
