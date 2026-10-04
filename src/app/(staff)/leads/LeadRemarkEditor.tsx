"use client";

import { useEffect, useState } from "react";
import { markListsStale } from "@/components/RefreshIfStale";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { listLeadRemarks, saveLeadRemark, type RemarkVersion } from "@/lib/actions/leadRemarks";
import { REMARK_MAX, remarkChanged, remarkWhen } from "@/lib/leadRemarks";

/**
 * A lead's remark, whole, to read and to edit — with every earlier version
 * beneath it, who wrote each and when (0306). Shared by the leads list's
 * pop-up and the lead's own page, so the two cannot differ.
 *
 * Saving adds a version rather than overwriting one; the same words again
 * write nothing. Clearing the box clears the remark, and that is kept as a
 * version too.
 */
export function LeadRemarkEditor({
  leadId,
  remark: initialRemark,
  updatedAt,
  updatedBy,
  startEditing = false,
  onSaved,
}: {
  leadId: string;
  remark: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Opened to add one: straight into the box. */
  startEditing?: boolean;
  onSaved?: (remark: string | null, at: string | null, by: string | null) => void;
}) {
  const [remark, setRemark] = useState(initialRemark);
  const [meta, setMeta] = useState<{ at: string | null; by: string | null }>({ at: updatedAt, by: updatedBy });
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(initialRemark ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<RemarkVersion[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // The history, once, when the remark is first shown.
  useEffect(() => {
    let live = true;
    void listLeadRemarks(leadId).then((result) => {
      if (live) setVersions("error" in result ? [] : result.versions);
    });
    return () => {
      live = false;
    };
  }, [leadId]);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveLeadRemark(leadId, draft);
    setSaving(false);
    if ("error" in result) return setError(result.error);
    setRemark(result.remark);
    setEditing(false);
    if (result.version) {
      const version = result.version;
      setMeta({ at: version.createdAt, by: version.writtenBy });
      setVersions((current) => [version, ...(current ?? [])]);
    }
    onSaved?.(result.remark, result.version?.createdAt ?? meta.at, result.version ? result.version.writtenBy : meta.by);
    // The list held for Back no longer shows this remark. The list on screen
    // shows it already (RemarkCell), and its search and export ask the server.
    markListsStale();
  }

  // The newest version is the remark above; the rest is the history.
  const earlier = (versions ?? []).slice(versions && versions.length > 0 && meta.at ? 1 : 0);

  return (
    <div className="flex flex-col gap-3" data-remark-editor={leadId}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            maxLength={REMARK_MAX}
            autoFocus
            placeholder="e.g. Wants Italy for masters, budget tight — call after Eid"
            aria-label="Remark"
            data-remark-input
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={save} pending={saving} disabled={!remarkChanged(remark, draft)}>
              Save remark
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(remark ?? "");
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-muted">
              {draft.length.toLocaleString("en-US")} / {REMARK_MAX.toLocaleString("en-US")}
            </span>
          </div>
        </div>
      ) : (
        <div>
          {remark ? (
            <p className="whitespace-pre-wrap break-words text-sm text-ink" data-remark-full>
              {remark}
            </p>
          ) : (
            <p className="text-sm text-muted">No remark yet.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              onClick={() => {
                setDraft(remark ?? "");
                setEditing(true);
              }}
            >
              {remark ? "Edit remark" : "Add remark"}
            </Button>
            {meta.at && (
              <span className="text-[11px] text-muted" data-remark-meta>
                Last edited{meta.by ? ` by ${meta.by}` : ""} · {remarkWhen(meta.at)}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {earlier.length > 0 && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showHistory ? "Hide" : "Show"} earlier versions ({earlier.length})
          </button>
          {showHistory && (
            <ol className="mt-2 flex flex-col gap-2" data-remark-history>
              {earlier.map((v) => (
                <li key={v.id} className="border-l-2 border-border pl-3">
                  {v.body ? (
                    <p className="whitespace-pre-wrap break-words text-xs text-ink">{v.body}</p>
                  ) : (
                    <p className="text-xs italic text-muted">Cleared</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted">
                    {v.writtenBy ?? "Someone"} · {remarkWhen(v.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
