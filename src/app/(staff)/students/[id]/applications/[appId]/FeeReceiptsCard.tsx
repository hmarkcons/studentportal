"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removeFeeReceipt, setFeeReceiptsVisible, uploadFeeReceipts } from "@/lib/actions/applicationFeeReceipts";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";
import { uploadedLine } from "@/lib/activityStamp";
import { stageFile } from "@/lib/stageFile";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { MAX_UPLOAD_BYTES, formatFileSize } from "@/lib/fileSize";
import { MAX_FEE_RECEIPTS_AT_ONCE } from "@/lib/applicationFeeReceipts";

export type FeeReceipt = { id: string; name: string; url: string | null; uploadedAt: string | null };

type Chosen = { key: string; name: string; size: number; ref: string | null; error: string | null; staging: boolean };

/**
 * An application's fee receipts (0365): each its own file, uploaded several
 * at a time or one by one, and a switch that shows them to the student —
 * hidden until it is ticked. Processing manages them; anyone else who opens
 * the application sees them, read only.
 */
export function FeeReceiptsCard({
  studentId,
  applicationId,
  receipts,
  visible,
  canManage,
}: {
  studentId: string;
  applicationId: string;
  receipts: FeeReceipt[];
  visible: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const upload = useButtonAction();
  const remove = useButtonAction();
  const toggle = useButtonAction();
  const [removing, setRemoving] = useState<string | null>(null);
  const [shown, setShown] = useState(visible);
  const [shownFor, setShownFor] = useState(visible);
  // The server's answer wins once it changes (a reload, another tab).
  if (visible !== shownFor) {
    setShownFor(visible);
    setShown(visible);
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, Math.max(0, MAX_FEE_RECEIPTS_AT_ONCE - chosen.length));
    const added: Chosen[] = list.map((f) => ({
      key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
      ref: null,
      error: f.size > MAX_UPLOAD_BYTES ? `Over the ${formatFileSize(MAX_UPLOAD_BYTES)} limit.` : null,
      staging: f.size <= MAX_UPLOAD_BYTES,
    }));
    setChosen((all) => [...all, ...added]);
    if (input.current) input.current.value = "";
    // Each staged on its own, so each stays a file of its own.
    await Promise.all(
      list.map(async (f, i) => {
        if (f.size > MAX_UPLOAD_BYTES) return;
        const r = await stageFile(f);
        setChosen((all) => all.map((c) => (c.key === added[i].key ? { ...c, staging: false, ref: r.ok ? r.ref : null, error: r.ok ? null : r.error } : c)));
      })
    );
  }

  const ready = chosen.filter((c) => c.ref && !c.error);
  const staging = chosen.some((c) => c.staging);

  async function send() {
    const fd = new FormData();
    for (const c of ready) fd.append("files", c.ref!);
    const r = await upload.run(() => uploadFeeReceipts(studentId, applicationId, undefined, fd));
    if (r && "success" in r) {
      setChosen([]);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4" data-fee-receipts>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">Application fee receipts</h3>
          <p className="text-[11px] text-muted">Kept in the student&rsquo;s Documents › Application Fee, each as its own file.</p>
        </div>
        {canManage ? (
          <label className="flex items-start gap-2 text-xs text-ink" data-fee-receipts-visible>
            <input
              type="checkbox"
              checked={shown}
              disabled={toggle.pending}
              onChange={async (e) => {
                const next = e.target.checked;
                setShown(next);
                const r = await toggle.run(() => setFeeReceiptsVisible(studentId, applicationId, next));
                if (r && "error" in r && r.error) setShown(!next);
                else router.refresh();
              }}
              className="mt-0.5"
            />
            <span>
              Show to the student
              <span className="block text-[11px] text-muted">
                {shown ? "They see them on this application and in their Documents." : "Hidden from the student until ticked; they are told when it is."}
              </span>
            </span>
          </label>
        ) : (
          <span className="text-[11px] text-muted" data-fee-receipts-visible={shown ? "shown" : "hidden"}>
            {shown ? "Shown to the student" : "Hidden from the student"}
          </span>
        )}
      </div>
      <ActionStatus state={toggle.state} pending={toggle.pending} label={shown ? "Shown to the student." : "Hidden from the student."} showError />

      {receipts.length ? (
        <ul className="flex flex-col gap-1.5" data-fee-receipt-list>
          {receipts.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5" data-fee-receipt={f.id}>
              <span className="min-w-0">
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="break-all text-xs font-medium text-primary hover:underline">
                    {f.name}
                  </a>
                ) : (
                  <span className="break-all text-xs text-ink">{f.name}</span>
                )}
                {f.uploadedAt && <span className="ml-2 text-[11px] text-muted">{uploadedLine({ at: f.uploadedAt, byRole: "staff", audience: "staff" })}</span>}
              </span>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  pending={remove.pending && removing === f.id}
                  disabled={remove.pending}
                  onClick={async () => {
                    if (!confirm(`Remove "${f.name}"?`)) return;
                    setRemoving(f.id);
                    const r = await remove.run(() => removeFeeReceipt(studentId, applicationId, f.id));
                    if (r && "success" in r) router.refresh();
                  }}
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No receipts yet.</p>
      )}
      <ActionStatus state={remove.state} pending={remove.pending} label="Removed." showError />

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3" data-fee-receipt-upload>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENT_ACCEPT}
              onChange={(e) => void pick(e.target.files)}
              className="text-xs"
              aria-label="Choose receipt files"
              disabled={chosen.length >= MAX_FEE_RECEIPTS_AT_ONCE}
            />
          </div>
          <p className="text-[11px] text-muted">
            PDF, Word or image, up to {formatFileSize(MAX_UPLOAD_BYTES)} each. Choose several at once or one at a time (up to {MAX_FEE_RECEIPTS_AT_ONCE}), then upload.
          </p>
          {chosen.length > 0 && (
            <ul className="flex flex-col gap-1" data-fee-receipt-chosen>
              {chosen.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 break-all text-ink">
                    {c.name} <span className="text-muted">({formatFileSize(c.size)})</span>
                    {c.staging && <span className="ml-1 text-muted">— getting it ready…</span>}
                    {c.error && <span className="ml-1 text-danger">— {c.error}</span>}
                  </span>
                  <button type="button" className="text-muted hover:text-danger" onClick={() => setChosen((all) => all.filter((x) => x.key !== c.key))} aria-label={`Leave out ${c.name}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              pending={upload.pending}
              disabled={!ready.length || staging}
              onClick={send}
              status={{ state: upload.state, label: "Uploaded.", showError: true }}
              data-fee-receipt-submit
            >
              {ready.length > 1 ? `Upload ${ready.length} receipts` : "Upload receipt"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
