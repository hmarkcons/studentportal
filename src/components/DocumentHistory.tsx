import { Badge } from "@/components/ui/Badge";
import { formatStamp } from "@/lib/activityStamp";

export type ArchivedUpload = {
  id: string;
  version: number;
  uploadedAt: string | null;
  uploadedByRole: string | null;
  previousStatus: string;
  rejectedReason: string | null;
  fileUrl?: string | null;
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
export function DocumentHistory({ versions, audience }: { versions: ArchivedUpload[]; audience: "staff" | "student" | "partner" }) {
  if (versions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-2">
      <p className="text-[11px] font-medium text-muted">
        {versions.length === 1 ? "Earlier version" : `${versions.length} earlier versions`}
      </p>
      {versions.map((v) => (
        <p key={v.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Badge tone={v.previousStatus === "rejected" ? "danger" : "neutral"}>
            {v.previousStatus === "rejected" ? "Rejected" : "Replaced"}
          </Badge>
          <span>v{v.version}</span>
          {v.uploadedAt && <span>· sent {formatStamp(v.uploadedAt)}</span>}
          {/* Why it was sent back, which is the reason this is kept at all. */}
          {v.rejectedReason && <span>· {v.rejectedReason}</span>}
          {v.fileUrl && (
            <a href={v.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {audience === "staff" ? "View" : "View what you sent"}
            </a>
          )}
        </p>
      ))}
    </div>
  );
}
