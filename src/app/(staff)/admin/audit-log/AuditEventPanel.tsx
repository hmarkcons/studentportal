"use client";

import { useEffect, useState, useTransition } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  auditEventDetail,
  restoreAuditEvent,
  revertAuditEvent,
  undoAuditInsert,
  type AuditEventDetail,
} from "@/lib/actions/auditLog";
import { actionTone, actionWord, countsByKind, eventActions, eventFields, formatValue, recordLabel, tableLabel, type FieldRow } from "@/lib/auditLabels";
import { formatStamp } from "@/lib/activityStamp";

type Loaded = Awaited<ReturnType<typeof auditEventDetail>>;
type Message = { tone: "success" | "danger"; text: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A stored value, named where it is an id, and kept to a box where it is long. */
function Value({ value, field, names }: { value: unknown; field: string; names: Map<string, string> }) {
  const text = formatValue(value, field === "id" ? undefined : names);
  const raw = typeof value === "string" && names.has(value) && field !== "id" ? value : undefined;
  if (text.length > 120 || text.includes("\n")) {
    return <div className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{text}</div>;
  }
  return (
    <span className="break-words" title={raw}>
      {text}
    </span>
  );
}

/**
 * One change, opened: the record before it, after it and as it is now, and the
 * one button that takes it back — revert an edit, restore a deletion, remove
 * an addition. Nothing is done until that button is pressed.
 */
export function AuditEventPanel({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [all, setAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    auditEventDetail(eventId).then((r) => {
      if (live) setLoaded(r);
    });
    return () => {
      live = false;
    };
  }, [eventId, version]);

  const detail: AuditEventDetail | null = loaded && "detail" in loaded ? loaded.detail : null;
  const ev = detail?.event;
  const title = ev ? `${actionWord(ev.action_type, ev.source_event)} ${tableLabel(ev.entity_type).toLowerCase()}` : "Change";

  function act(kind: "revert" | "restore" | "remove") {
    setMessage(null);
    startTransition(async () => {
      if (kind === "revert") {
        const r = await revertAuditEvent(eventId);
        if ("error" in r) return setMessage({ tone: "danger", text: r.error });
        setMessage({
          tone: "success",
          text: `Reverted: ${plural(r.fields, "field")} set back to what ${r.fields === 1 ? "it was" : "they were"}.${r.files ? ` ${plural(r.files, "file")} brought back.` : ""}`,
        });
      } else if (kind === "restore") {
        const r = await restoreAuditEvent(eventId);
        if ("error" in r) return setMessage({ tone: "danger", text: r.error });
        setMessage({
          tone: "success",
          text: `Restored: ${plural(r.restored, "record")} back in the portal.${r.files ? ` ${plural(r.files, "file")} brought back.` : ""}`,
        });
      } else {
        const r = await undoAuditInsert(eventId);
        if ("error" in r) return setMessage({ tone: "danger", text: r.error });
        setMessage({ tone: "success", text: "Removed. Its deletion is now in this log, and can be restored from there." });
      }
      setConfirming(false);
      setVersion((v) => v + 1);
    });
  }

  return (
    <SlideOver open onClose={onClose} title={title} wide>
      {!loaded ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : "error" in loaded ? (
        <p className="text-sm text-danger">{loaded.error}</p>
      ) : (
        ev &&
        detail && (
          <EventBody
            detail={detail}
            all={all}
            setAll={setAll}
            confirming={confirming}
            setConfirming={setConfirming}
            pending={pending}
            message={message}
            act={act}
          />
        )
      )}
    </SlideOver>
  );
}

function EventBody({
  detail,
  all,
  setAll,
  confirming,
  setConfirming,
  pending,
  message,
  act,
}: {
  detail: AuditEventDetail;
  all: boolean;
  setAll: (v: boolean) => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pending: boolean;
  message: Message | null;
  act: (kind: "revert" | "restore" | "remove") => void;
}) {
  const { event: ev, now } = detail;
  const names = new Map(Object.entries(detail.names));
  const action = ev.action_type;
  const exists = now !== null;
  const record = recordLabel(ev.entity_type, ev.after ?? ev.before);
  const rows: FieldRow[] = eventFields({ action, before: ev.before, after: ev.after, now, changed: ev.changed, all });
  const can = eventActions(action, exists, ev.row_key !== null);
  const conflicts = rows.filter((r) => r.changed && r.changedSince);
  const touched = action === "UPDATE" ? eventFields({ action, before: ev.before, after: ev.after, now, changed: ev.changed }) : [];

  // What else a restore brings back with it, by kind.
  const withIt = countsByKind(detail.group.filter((g) => !g.internal).map((g) => tableLabel(g.entity_type)));

  const thenHeading = action === "UPDATE" ? "After" : action === "INSERT" ? "Added as" : action === "RESTORE" ? "Restored as" : "As it was";
  const thenValue = (r: FieldRow) => (action === "DELETE" ? r.before : r.after);

  return (
    <div className="space-y-4" data-audit-detail={ev.id}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={actionTone(action)}>{actionWord(action, ev.source_event)}</Badge>
          <span className="text-sm font-semibold text-ink">{record}</span>
          {record !== tableLabel(ev.entity_type) && <span className="text-xs text-muted">{tableLabel(ev.entity_type)}</span>}
        </div>
        <p className="mt-1 text-xs text-muted">
          By {detail.actor} · {formatStamp(ev.created_at)}
        </p>
      </div>

      {detail.followUps.length > 0 && (
        <ul className="space-y-1 rounded-md bg-bg px-3 py-2 text-xs text-muted">
          {detail.followUps.map((f) => (
            <li key={f.id}>
              {actionWord(f.action_type, f.id)} by {f.actor} · {formatStamp(f.created_at)}
            </li>
          ))}
        </ul>
      )}

      {/* Where the record stands now, and so what can be done. */}
      {ev.row_key === null ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">
          Logged before the audit log kept what is needed to undo a change, so it can be seen here but not undone.
        </p>
      ) : action === "UPDATE" && !exists ? (
        <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">
          This record has been deleted since. Restore it first — its deletion is in this log — then revert this change.
        </p>
      ) : (action === "INSERT" || action === "RESTORE") && !exists ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-muted">Not in the portal now: it has been deleted since.</p>
      ) : action === "DELETE" && exists ? (
        <p className="rounded-md border border-success bg-success-bg px-3 py-2 text-sm text-success">It is back in the portal.</p>
      ) : null}

      {message && (
        <p
          role={message.tone === "danger" ? "alert" : "status"}
          data-audit-message={message.tone}
          className={`rounded-md px-3 py-2 text-sm ${message.tone === "danger" ? "bg-danger-bg text-danger" : "bg-success-bg text-success"}`}
        >
          {message.text}
        </p>
      )}

      {(can.revert || can.restore || can.remove) && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {can.revert && (
            <>
              <p className="text-sm text-ink">
                Sets {touched.length === 1 ? "this field" : `these ${touched.length} fields`} back to what {touched.length === 1 ? "it was" : "they were"} before this
                change. Nothing else on the record is touched.
              </p>
              {conflicts.length > 0 && (
                <p className="text-sm text-warning">
                  {conflicts.map((c) => c.label).join(", ")} {conflicts.length === 1 ? "has" : "have"} been changed again since; reverting replaces that
                  later value too.
                </p>
              )}
              <Button variant="primary" pending={pending} onClick={() => act("revert")} data-audit-action="revert">
                Revert this change
              </Button>
            </>
          )}
          {can.restore && (
            <>
              <p className="text-sm text-ink">
                Brings it back exactly as it was
                {withIt && <>, with what was deleted along with it: {withIt}</>}
                . Files deleted with it in the last 90 days come back too.
              </p>
              <Button variant="primary" pending={pending} onClick={() => act("restore")} data-audit-action="restore">
                Restore
              </Button>
            </>
          )}
          {can.remove &&
            (confirming ? (
              <>
                <p className="text-sm text-danger">
                  This deletes {record} from the portal, with anything that belongs to it. It can be restored again from this log.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" pending={pending} onClick={() => act("remove")} data-audit-action="remove-confirm">
                    Yes, remove it
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-ink">Takes back this addition by deleting what was added.</p>
                <Button variant="danger" onClick={() => setConfirming(true)} data-audit-action="remove">
                  Remove what was added
                </Button>
              </>
            ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {action === "UPDATE" && !all ? `What changed (${plural(rows.length, "field")})` : "The record"}
          </h4>
          {action === "UPDATE" && (
            <button type="button" onClick={() => setAll(!all)} className="text-xs text-primary hover:underline">
              {all ? "Only what changed" : "Show every field"}
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] table-fixed text-sm" data-audit-fields>
            <thead>
              <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="w-[24%] px-3 py-2 font-medium">Field</th>
                {action === "UPDATE" && <th scope="col" className="px-3 py-2 font-medium">Before</th>}
                <th scope="col" className="px-3 py-2 font-medium">{thenHeading}</th>
                {exists && <th scope="col" className="px-3 py-2 font-medium">Now</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  data-audit-field={r.key}
                  className={`border-b border-border align-top last:border-0 ${r.changed && all ? "bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]" : ""}`}
                >
                  <th scope="row" className="px-3 py-2 text-left text-xs font-medium text-muted">
                    {r.label}
                  </th>
                  {action === "UPDATE" && (
                    <td className={`px-3 py-2 ${r.changed ? "text-danger" : "text-ink"}`} data-cell="before">
                      <Value value={r.before} field={r.key} names={names} />
                    </td>
                  )}
                  <td className={`px-3 py-2 ${action === "UPDATE" && r.changed ? "font-medium text-success" : "text-ink"}`} data-cell="then">
                    <Value value={thenValue(r)} field={r.key} names={names} />
                  </td>
                  {exists && (
                    <td className={`px-3 py-2 ${r.changedSince ? "bg-warning-bg text-warning" : "text-ink"}`} data-cell="now">
                      <Value value={r.now} field={r.key} names={names} />
                      {r.changedSince && <span className="mt-0.5 block text-[11px]">changed since</span>}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    Nothing to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
