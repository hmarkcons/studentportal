"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { countsByKind } from "@/lib/auditLabels";
import { AuditEventPanel } from "./AuditEventPanel";

type Tone = "success" | "info" | "danger" | "warning" | "neutral";

export type TimelineItem = {
  id: string;
  action: string;
  word: string;
  tone: Tone;
  table: string;
  record: string;
  /** For an edit, the fields it changed. */
  fields: string[];
  actor: string;
  when: string;
  internal: boolean;
  /** On All activity, whose record it is. */
  whose: string | null;
  /** The other rows the same action changed: a student's documents deleted with them. */
  more: { id: string; word: string; tone: Tone; table: string; record: string }[];
};

/** How many changed fields a line names before "and N more". */
const FIELDS_SHOWN = 5;

/** One person's (or one kind of record's) changes, each opening to show what it was and what it is. */
export function AuditTimeline({ items }: { items: TimelineItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (items.length === 0) {
    return <p className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted">No changes logged.</p>;
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" data-audit-events>
        {items.map((it) => {
          const more = it.fields.length - FIELDS_SHOWN;
          const isOpen = expanded.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setOpen(it.id)}
                data-audit-event={it.id}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-bg"
              >
                <span className="w-20 shrink-0 pt-0.5">
                  <Badge tone={it.tone}>{it.word}</Badge>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">
                    <span className="font-medium">{it.table}</span>
                    {it.record !== it.table && <span> · {it.record}</span>}
                    {it.whose && <span className="text-muted"> — {it.whose}</span>}
                    {it.internal && <span className="ml-2 text-xs text-muted">(automatic)</span>}
                  </span>
                  {it.fields.length > 0 && (
                    <span className="block truncate text-xs text-muted">
                      Changed {it.fields.slice(0, FIELDS_SHOWN).join(", ")}
                      {more > 0 && ` and ${more} more`}
                    </span>
                  )}
                  {it.more.length > 0 && (
                    <span className="block text-xs text-muted">With {countsByKind(it.more.map((m) => m.table))}</span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  <span className="block text-ink">{it.actor}</span>
                  <span className="block tabular-nums">{it.when}</span>
                </span>
              </button>
              {it.more.length > 0 && (
                <div className="pb-2 pl-[6.75rem] pr-3">
                  <button
                    type="button"
                    onClick={() => toggle(it.id)}
                    aria-expanded={isOpen}
                    data-audit-expand={it.id}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {isOpen ? <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
                    {isOpen ? "Hide" : "Show"} the {it.more.length} other {it.more.length === 1 ? "record" : "records"}
                  </button>
                  {isOpen && (
                    <ul className="mt-1 space-y-0.5 border-l border-border pl-3">
                      {it.more.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setOpen(m.id)}
                            data-audit-event={m.id}
                            className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-ink hover:bg-bg"
                          >
                            <span className="font-medium">{m.table}</span>
                            {m.record !== m.table && <span className="text-muted"> · {m.record}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {open && <AuditEventPanel key={open} eventId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
