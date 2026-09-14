"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { ActionStatus } from "@/components/ActionStatus";
import { formatFileSize } from "@/lib/fileSize";
import { formatDateOnly } from "@/lib/formatDate";
import { uploadScholarshipProof, deleteScholarshipProof, type ScholarshipProof } from "@/lib/actions/scholarshipProofs";

/**
 * The evidence that this scholarship application was actually submitted.
 *
 * Several files, because an agency gives you several: the submission receipt,
 * the protocol number, the ISEE acknowledgement. A disputed application is
 * argued with the receipt, so this is the one part of the scholarship tab that
 * has to survive a year of nobody looking at it.
 */
export function ScholarshipProofs({
  scholarshipId,
  studentId,
  proofs,
  canManage,
}: {
  scholarshipId: string;
  studentId: string;
  proofs: ScholarshipProof[];
  canManage: boolean;
}) {
  const action = uploadScholarshipProof.bind(null, scholarshipId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove(proof: ScholarshipProof) {
    if (!confirm(`Remove "${proof.fileName}"? This deletes the file, and it is the evidence the application was submitted.`)) {
      return;
    }
    setRemoving(proof.id);
    setRemoveError(null);
    const result = await deleteScholarshipProof(proof.id, studentId);
    if (result?.error) setRemoveError(result.error);
    setRemoving(null);
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium text-ink">
        Proof of submission
        {proofs.length > 0 && <span className="ml-1.5 font-normal text-muted">{proofs.length} file{proofs.length === 1 ? "" : "s"}</span>}
      </p>

      {proofs.length === 0 ? (
        <p className="mb-2 text-xs text-muted">Nothing attached yet — the submission receipt, protocol number or ISEE acknowledgement goes here.</p>
      ) : (
        <ul className="mb-2 flex flex-col divide-y divide-border">
          {proofs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 text-xs text-ink">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    📄 {p.fileName}
                  </a>
                ) : (
                  <>📄 {p.fileName}</>
                )}
                <span className="ml-2 text-muted">
                  {p.fileSize != null && `${formatFileSize(p.fileSize)} · `}
                  {formatDateOnly(p.uploadedAt.slice(0, 10))}
                </span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={removing === p.id}
                  className="shrink-0 rounded border border-border px-1.5 text-xs text-danger hover:bg-danger-bg disabled:opacity-40"
                >
                  {removing === p.id ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeError && <p className="mb-2 text-xs text-danger">{removeError}</p>}

      {canManage && (
        <form action={formAction} className="flex flex-wrap items-start gap-2">
          <FileField hint="PDF or image" onChange={(s) => setReady(Boolean(s.file))} />
          <Button type="submit" size="sm" pending={pending} disabled={!ready} className="mt-0.5">
            Attach proof
          </Button>
          <ActionStatus state={state} pending={pending} label="Attached." className="mt-1.5" />
          {state?.error && <p className="mt-1.5 text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
