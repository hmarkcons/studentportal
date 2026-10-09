"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatStamp } from "@/lib/activityStamp";
import { useButtonAction } from "@/components/useButtonAction";
import { deleteDocumentVersion } from "@/lib/actions/documents";

export type ArchivedUpload = {
  id: string;
  version: number;
  uploadedAt: string | null;
  uploadedByRole: string | null;
  previousStatus: string;
  rejectedReason: string | null;
  fileUrl?: string | null;
  /** The name it was sent under. */
  fileName?: string | null;
};

/**
 * Everything previously sent against one requirement.
 *
 * A replacement used to overwrite what it replaced — in the row and, when the
 * filename matched, in storage as well. Keeping the old file is only half the
 * point: staff sent it back for a reason, and the thing they saw is the
 * evidence of why, so it has to be reachable.
 *
 * Deliberately quiet. This is history, not work: it sits under the current
 * document in small text rather than competing with it.
 */
/** Delete, for staff: the version goes from the history, its file kept 90 days and restorable. */
function DeleteVersion({ version, revalidateTo }: { version: ArchivedUpload; revalidateTo: string }) {
  const del = useButtonAction();
  const error = del.state && typeof del.state === "object" && "error" in del.state ? ((del.state as { error?: string }).error ?? null) : null;
  return (
    <>
      <button
        type="button"
        disabled={del.pending}
        onClick={() => {
          const what = version.fileName ? `"${version.fileName}"` : `version ${version.version}`;
          if (!confirm(`Delete ${what} from this document's history? It can be restored from the audit log for 90 days.`)) return;
          void del.run(() => deleteDocumentVersion(version.id, revalidateTo), { toast: "Earlier version deleted." });
        }}
        aria-label={`Delete ${version.fileName ?? `version ${version.version}`}`}
        title="Delete this earlier version"
        data-delete-version={version.id}
        className="inline-flex items-center gap-0.5 rounded px-1 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 aria-hidden className="h-3 w-3" />
        {del.pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-danger">{error}</span>}
    </>
  );
}

export function DocumentHistory({
  versions,
  audience,
  deletable = null,
}: {
  versions: ArchivedUpload[];
  audience: "staff" | "student" | "partner";
  /** Staff may delete an earlier version — replaced or sent back — at any time (0330). */
  deletable?: { revalidateTo: string } | null;
}) {
  if (versions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-2">
      <p className="text-[11px] font-medium text-muted">
        {versions.length === 1 ? "Earlier version" : `${versions.length} earlier versions`}
      </p>
      {versions.map((v) => (
        <p key={v.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted" data-history-version={v.id}>
          <Badge tone={v.previousStatus === "rejected" ? "danger" : "neutral"}>
            {v.previousStatus === "rejected" ? "Rejected" : "Replaced"}
          </Badge>
          <span>v{v.version}</span>
          {v.uploadedAt && <span>· sent {formatStamp(v.uploadedAt)}</span>}
          {/* Why it was sent back, which is the reason this is kept at all. */}
          {v.rejectedReason && <span>· {v.rejectedReason}</span>}
          {v.fileUrl ? (
            <a href={v.fileUrl} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline" data-history-file>
              {v.fileName ?? (audience === "staff" ? "View" : "View what you sent")}
            </a>
          ) : (
            v.fileName && <span className="break-all">{v.fileName}</span>
          )}
          {deletable && audience === "staff" && <DeleteVersion version={v} revalidateTo={deletable.revalidateTo} />}
        </p>
      ))}
    </div>
  );
}
