"use client";

import { useState } from "react";
import { Download, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatStamp } from "@/lib/activityStamp";
import { phoneBounds } from "@/lib/phoneNumber";
import { saveGmailRecovery, revealGmailRecovery, removeGmailRecoveryPart } from "@/lib/actions/gmailRecovery";
import {
  BACKUP_CODES_ACCEPT,
  PART_LABELS,
  codesDownloadName,
  countBackupCodes,
  onFileSummary,
  partsOnFile,
  type GmailRecoveryDetails,
  type GmailRecoveryStatus,
  type RecoveryPart,
} from "@/lib/gmailRecovery";

const WHO = "a Super Admin and the student's processing officer";

/**
 * The Gmail account's recovery details (0332), under its login: the backup
 * codes file, the recovery email and the recovery mobile. A Super Admin and
 * the student's processing officer add, see, replace and remove them; anyone
 * else is told only what is on file.
 */
export function GmailRecoveryBlock({ studentId, initial }: { studentId: string; initial: GmailRecoveryStatus | null }) {
  const [status, setStatus] = useState(initial);
  const [details, setDetails] = useState<GmailRecoveryDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"save" | "reveal" | RecoveryPart | null>(null);
  // Empties the form after a save, file and all.
  const [formKey, setFormKey] = useState(0);

  if (!status) return null;
  const summary = onFileSummary(status);
  const stamp = status.updatedAt ? `Updated ${formatStamp(status.updatedAt)}${status.updatedByName ? ` by ${status.updatedByName}` : ""}.` : null;

  if (!status.canOpen) {
    return (
      <div className="rounded-md border border-dashed border-border bg-bg/50 p-3 text-xs text-muted" data-gmail-recovery="locked">
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <Lock aria-hidden className="h-3.5 w-3.5" />
          Gmail recovery
        </p>
        <p className="mt-1">
          {summary ? `${summary} on file.` : "Nothing on file yet."} Only {WHO} can see{summary ? "" : " or add"} these.
        </p>
      </div>
    );
  }

  async function save(formData: FormData) {
    setBusy("save");
    setError(null);
    setSaved(false);
    const result = await saveGmailRecovery(studentId, formData);
    setBusy(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStatus(result.status);
    if (details) setDetails(result.details);
    setSaved(true);
    setFormKey((k) => k + 1);
  }

  async function reveal() {
    if (details) {
      setDetails(null);
      return;
    }
    setBusy("reveal");
    setError(null);
    const result = await revealGmailRecovery(studentId);
    setBusy(null);
    if ("error" in result) setError(result.error);
    else setDetails(result.details);
  }

  async function remove(part: RecoveryPart) {
    if (!confirm(`Remove the ${PART_LABELS[part].toLowerCase()} for this student's Gmail? This cannot be undone.`)) return;
    setBusy(part);
    setError(null);
    setSaved(false);
    const result = await removeGmailRecoveryPart(studentId, part);
    setBusy(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStatus(result.status);
    if (details) setDetails(result.details);
  }

  function download() {
    if (!details?.codes) return;
    const url = URL.createObjectURL(new Blob([details.codes.replace(/\n/g, "\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = codesDownloadName(details);
    a.click();
    URL.revokeObjectURL(url);
  }

  const parts = partsOnFile(status);
  return (
    <div className="rounded-md border border-border p-3" data-gmail-recovery="open">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <Lock aria-hidden className="h-3.5 w-3.5" />
          Gmail recovery (encrypted) — seen only by {WHO}
        </p>
        {stamp && <p className="text-[11px] text-muted">{stamp}</p>}
      </div>

      {parts.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" data-gmail-recovery-parts>
          <span className="text-[11px] text-muted">On file:</span>
          {parts.map((part) => (
            <span key={part} className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
              {PART_LABELS[part]}
              <button
                type="button"
                onClick={() => remove(part)}
                disabled={busy !== null}
                aria-label={`Remove ${PART_LABELS[part].toLowerCase()}`}
                className="rounded-full hover:bg-success/15 disabled:opacity-50"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        key={formKey}
        // Not action={save}: React empties a form after its action, and an
        // address typed wrong would go with the error that says so.
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget));
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Input name="recovery_email" type="text" inputMode="email" placeholder="Recovery email" aria-label="Recovery email" className="w-48" />
        <Input name="recovery_phone" {...phoneBounds()} placeholder="Recovery mobile number" aria-label="Recovery mobile number" className="w-44" />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span className="whitespace-nowrap">Backup codes (.txt)</span>
          <input
            name="backup_codes"
            type="file"
            accept={BACKUP_CODES_ACCEPT}
            aria-label="Backup codes file"
            className="max-w-56 text-xs text-muted file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs file:text-ink"
          />
        </label>
        <Button type="submit" variant="primary" size="sm" pending={busy === "save"} disabled={busy !== null && busy !== "save"}>
          Save
        </Button>
        <Button type="button" size="sm" onClick={reveal} pending={busy === "reveal"} disabled={parts.length === 0 || (busy !== null && busy !== "reveal")}>
          {details ? "Hide" : "Reveal"}
        </Button>
        {saved && <span className="text-xs text-success">Saved.</span>}
      </form>
      <p className="mt-1 text-[11px] text-muted">A field left blank keeps what is saved; a new file replaces the backup codes.</p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {details && (
        <div className="mt-2 rounded-md bg-bg p-2 text-xs" data-gmail-recovery-details>
          <p className="text-muted">
            Recovery email: <span className="text-ink">{details.email ?? "none saved"}</span>
            {" · "}
            Recovery mobile: <span className="text-ink">{details.phone ?? "none saved"}</span>
          </p>
          {details.codes ? (
            <>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted">
                  Backup codes — {countBackupCodes(details.codes)} in {details.codesFileName ?? "the file"}. Each works once.
                </p>
                <Button type="button" size="sm" onClick={download}>
                  <Download aria-hidden className="h-3.5 w-3.5" />
                  Download .txt
                </Button>
              </div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 font-mono text-[11px] text-ink">
                {details.codes}
              </pre>
            </>
          ) : (
            <p className="mt-1 text-muted">No backup codes saved.</p>
          )}
        </div>
      )}
    </div>
  );
}
