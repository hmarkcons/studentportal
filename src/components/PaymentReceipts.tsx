"use client";

import { useState, useTransition } from "react";
import { FileText, History, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { formatStamp, uploadedLine } from "@/lib/activityStamp";
import { formatFileSize } from "@/lib/fileSize";
import { receiptButtonLabel, type ReceiptKind } from "@/lib/paymentReceipts";
import { listPaymentReceipts, removePaymentReceipt, uploadPaymentReceipt, type PaymentReceipt } from "@/lib/actions/paymentReceipts";

// The receipts on one payment (0308, 0309): proof of what was paid, each file
// with who uploaded it and when. Anyone who handles the payment's receipts
// adds one, or replaces one — the old file then stays listed beneath as an
// earlier version, with who replaced it and when. Only a Super Admin deletes,
// and may delete any of them. None of it changes the payment's status.
//
// Shown only to whoever may handle that payment's receipts; the caller
// decides, and the server and the database each check again.

type Props = {
  kind: ReceiptKind;
  paymentId: string;
  /** What the payment is, for the pop-up: "Instalment 2 — Ali Khan". */
  title: string;
  revalidateTo: string;
};

/**
 * The pop-up, and what opens it. `show()` opens it on the list; `show(id)`
 * opens it straight into replacing that receipt.
 */
function useReceiptsDialog({ kind, paymentId, title, revalidateTo }: Props) {
  const [open, setOpen] = useState(false);
  const [receipts, setReceipts] = useState<PaymentReceipt[] | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [uploading, startUploading] = useTransition();
  /** The receipt a replacement is being chosen for; null for a new one. */
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // A fresh file field after each upload.
  const [fieldKey, setFieldKey] = useState(0);

  function show(replacing: string | null = null) {
    setOpen(true);
    setError(null);
    setReplacingId(replacing);
    setReady(false);
    startLoading(async () => {
      const result = await listPaymentReceipts(kind, paymentId);
      if ("error" in result) setError(result.error);
      else {
        setReceipts(result.receipts);
        setCanDelete(result.canDelete);
      }
    });
  }

  function upload(form: HTMLFormElement, replaces: string | null) {
    const data = new FormData(form);
    setError(null);
    startUploading(async () => {
      const result = await uploadPaymentReceipt(kind, paymentId, revalidateTo, data, replaces);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setReceipts((list) => [...(list ?? []).map((r) => (r.id === replaces ? { ...r, isCurrent: false } : r)), result.receipt]);
      setReplacingId(null);
      setReady(false);
      setFieldKey((k) => k + 1);
    });
  }

  async function remove(receipt: PaymentReceipt) {
    if (!confirm(`Delete ${receipt.fileName}? This cannot be undone.`)) return;
    setDeletingId(receipt.id);
    setError(null);
    const result = await removePaymentReceipt(kind, receipt.id, revalidateTo);
    setDeletingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Deleting a replacement brings back the receipt it replaced.
    setReceipts((list) =>
      (list ?? []).filter((r) => r.id !== receipt.id).map((r) => (r.id === receipt.replaces && receipt.isCurrent ? { ...r, isCurrent: true } : r))
    );
  }

  const current = (receipts ?? []).filter((r) => r.isCurrent);
  const byId = new Map((receipts ?? []).map((r) => [r.id, r]));
  const replacedBy = new Map((receipts ?? []).filter((r) => r.replaces).map((r) => [r.replaces as string, r]));
  // Each current receipt's earlier versions, newest first.
  const historyOf = (r: PaymentReceipt) => {
    const out: PaymentReceipt[] = [];
    for (let prior = r.replaces ? byId.get(r.replaces) : undefined; prior; prior = prior.replaces ? byId.get(prior.replaces) : undefined) {
      if (out.includes(prior)) break;
      out.push(prior);
    }
    return out;
  };
  const shownInHistory = new Set(current.flatMap((r) => historyOf(r).map((h) => h.id)));
  // Earlier versions whose replacement has itself been deleted from the middle of a chain.
  const loose = (receipts ?? []).filter((r) => !r.isCurrent && !shownInHistory.has(r.id));

  const fileForm = (replaces: string | null) => (
    <form
      className={`flex flex-wrap items-end gap-2 ${replaces ? "mt-2 rounded-md bg-bg p-2" : "border-t border-border pt-3"}`}
      onSubmit={(e) => {
        e.preventDefault();
        upload(e.currentTarget, replaces);
      }}
      data-replace-form={replaces ?? undefined}
    >
      <FileField
        key={`${replaces ?? "new"}-${fieldKey}`}
        required
        hint="PDF or image"
        noun="receipt"
        className="min-w-0 flex-1"
        onChange={(s) => setReady(Boolean(s.file) && !s.busy && !s.error)}
      />
      <Button type="submit" variant="primary" size="sm" pending={uploading} disabled={!ready}>
        {replaces ? "Upload replacement" : "Upload receipt"}
      </Button>
      {replaces && (
        <Button type="button" size="sm" onClick={() => setReplacingId(null)}>
          Cancel
        </Button>
      )}
    </form>
  );

  const fileLine = (r: PaymentReceipt, earlier: boolean) => (
    <div className="min-w-0">
      {r.url ? (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex max-w-full items-center gap-1.5 font-medium hover:underline ${earlier ? "text-xs text-muted" : "text-sm text-primary"}`}
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
      {earlier && replacedBy.get(r.id) && (
        <p className="text-xs text-muted" data-receipt-replaced>
          Replaced {formatStamp(replacedBy.get(r.id)!.uploadedAt)} by {replacedBy.get(r.id)!.uploadedBy ?? "a colleague"}
        </p>
      )}
    </div>
  );

  const deleteButton = (r: PaymentReceipt) =>
    canDelete && (
      <button
        type="button"
        onClick={() => remove(r)}
        disabled={deletingId === r.id}
        className="shrink-0 rounded p-1 text-muted hover:bg-bg hover:text-danger disabled:opacity-50"
        aria-label={`Delete ${r.fileName}`}
        title="Delete this receipt (Super Admin)"
      >
        <Trash2 aria-hidden className="h-4 w-4" />
      </button>
    );

  const dialog = (
    <Modal open={open} onClose={() => setOpen(false)} title={`Payment receipts — ${title}`}>
      <div className="flex flex-col gap-4" data-receipts-dialog={paymentId}>
        {receipts === null ? (
          <p className="text-sm text-muted">{loading ? "Loading…" : ""}</p>
        ) : current.length === 0 && loose.length === 0 ? (
          <p className="text-sm text-muted" data-receipts-empty>
            No receipt on file yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border" data-receipts-list>
            {current.map((r) => (
              <li key={r.id} className="px-3 py-2" data-receipt={r.id}>
                <div className="flex items-start justify-between gap-3">
                  {fileLine(r, false)}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingId(replacingId === r.id ? null : r.id);
                        setReady(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg"
                      aria-label={`Replace ${r.fileName}`}
                      data-receipt-replace={r.id}
                    >
                      <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                      Replace
                    </button>
                    {deleteButton(r)}
                  </div>
                </div>
                {replacingId === r.id && fileForm(r.id)}
                {historyOf(r).length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2 border-l-2 border-border pl-3" data-receipt-history={r.id}>
                    {historyOf(r).map((h) => (
                      <li key={h.id} className="flex items-start justify-between gap-3" data-receipt-earlier={h.id}>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Earlier version</p>
                          {fileLine(h, true)}
                        </div>
                        {deleteButton(h)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {loose.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 px-3 py-2" data-receipt-earlier={h.id}>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Earlier version</p>
                  {fileLine(h, true)}
                </div>
                {deleteButton(h)}
              </li>
            ))}
          </ul>
        )}

        {receipts !== null && replacingId === null && fileForm(null)}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">
          Replacing a receipt keeps the old file as an earlier version. {canDelete ? "As a Super Admin you can delete any receipt." : "Only a Super Admin can delete one."}{" "}
          None of this changes whether the payment is marked paid.
        </p>
      </div>
    </Modal>
  );

  return { show, dialog, receipts, current };
}

/** The receipts on a payment as one button — "Receipts (2)" — that opens them. */
export function PaymentReceiptsButton({ count, ...props }: Props & { /** Current receipts on file, as the page read them. */ count: number }) {
  const { show, dialog, receipts, current } = useReceiptsDialog(props);
  // The page's count until the pop-up has read the list; the list's after.
  const shown = receipts === null ? count : current.length;
  return (
    <>
      <button
        type="button"
        onClick={() => show()}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          shown > 0 ? "border-primary text-primary hover:bg-primary/10" : "border-border text-muted hover:bg-bg hover:text-ink"
        }`}
        aria-label={shown > 0 ? `${shown} payment receipt${shown === 1 ? "" : "s"} for ${props.title}` : `Add a payment receipt for ${props.title}`}
        data-receipts-button={props.paymentId}
        data-receipts-count={shown}
      >
        <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {receiptButtonLabel(shown)}
      </button>
      {dialog}
    </>
  );
}

export type CellReceipt = { id: string; fileName: string; url: string | null };

/**
 * An instalment's receipt where it sits in a table: the file itself, to open,
 * with Replace and — for a Super Admin — Delete beside it, and the full list
 * with earlier versions a click away. With none yet, an Upload button.
 */
export function ReceiptCell({
  receipts,
  canDelete,
  ...props
}: Props & {
  /** The current receipts, as the page read them. */
  receipts: CellReceipt[];
  canDelete: boolean;
}) {
  const { show, dialog } = useReceiptsDialog(props);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = receipts[0];

  async function deleteFirst() {
    if (!first || !confirm(`Delete ${first.fileName}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    // The page is read again by the action, so the cell shows what is left.
    const result = await removePaymentReceipt(props.kind, first.id, props.revalidateTo);
    setDeleting(false);
    if ("error" in result) setError(result.error);
  }

  const icon = "inline-flex shrink-0 items-center rounded p-1 text-muted hover:bg-bg hover:text-ink";
  return (
    <div className="flex flex-col gap-0.5" data-receipt-cell={props.paymentId} data-receipts-count={receipts.length}>
      {first ? (
        <div className="flex items-center gap-0.5">
          {first.url ? (
            <a
              href={first.url}
              target="_blank"
              rel="noreferrer"
              title={first.fileName}
              className="inline-flex min-w-0 max-w-[9rem] items-center gap-1 text-xs font-medium text-primary hover:underline"
              data-receipt-link
            >
              <FileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{first.fileName}</span>
            </a>
          ) : (
            <span className="max-w-[9rem] truncate text-xs text-ink">{first.fileName}</span>
          )}
          {receipts.length > 1 && (
            <button type="button" onClick={() => show()} className="rounded px-1 text-xs text-primary hover:underline" title="Every receipt on this instalment">
              +{receipts.length - 1}
            </button>
          )}
          <button type="button" onClick={() => show(first.id)} className={icon} aria-label={`Replace ${first.fileName}`} title="Replace — the old file is kept as an earlier version" data-cell-replace>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={deleteFirst}
              disabled={deleting}
              className={`${icon} hover:text-danger disabled:opacity-50`}
              aria-label={`Delete ${first.fileName}`}
              title="Delete (Super Admin)"
              data-cell-delete
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => show()} className={icon} aria-label={`All receipts for ${props.title}`} title="All receipts and earlier versions" data-cell-all>
            <History aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => show()}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted hover:border-primary hover:text-primary"
          aria-label={`Upload a receipt for ${props.title}`}
          data-cell-upload
        >
          <Paperclip aria-hidden className="h-3.5 w-3.5" />
          Upload receipt
        </button>
      )}
      {error && <p className="max-w-[12rem] whitespace-normal text-xs text-danger">{error}</p>}
      {dialog}
    </div>
  );
}
