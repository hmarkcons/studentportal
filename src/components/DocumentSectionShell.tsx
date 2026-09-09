"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";

// One collapsible document section, shared by the staff Documents tab and the
// student's portal page so the two cannot drift apart on how a section reads.
//
// Collapsed on every page load, never remembered. That is deliberate and it is
// the opposite of CollapsibleCard's default for good reason: a document
// checklist runs to ten sections and forty rows, so closed is the readable
// state, whereas the sections CollapsibleCard wraps are a handful of panels
// that are useful open. Persisting the choice was tried once and removed — see
// the note in CollapsibleCard — because a section folded away stayed folded on
// every student opened afterwards and read as lost content.
//
// The counts live in the header rather than inside the panel precisely because
// the panel starts shut: a rejected document behind a closed section is the one
// thing somebody must not have to hunt for.
export function DocumentSectionShell({
  number,
  label,
  total,
  approved,
  outstanding,
  rejected,
  open: controlledOpen,
  onToggle,
  children,
}: {
  number: number;
  label: string;
  total: number;
  approved: number;
  outstanding: number;
  rejected: number;
  /** Supplied when a parent drives expand-all; otherwise self-managed. */
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const open = controlledOpen ?? selfOpen;
  const toggle = onToggle ?? (() => setSelfOpen((v) => !v));
  const panelId = `documents-section-${number}-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-3 text-left"
      >
        <span aria-hidden className={`shrink-0 text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
          {number}
        </span>
        <h3 className="text-base font-semibold text-ink">{label}</h3>

        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          {rejected > 0 && <Badge tone="danger">{rejected} rejected</Badge>}
          {outstanding > 0 && <Badge tone="warning">{outstanding} outstanding</Badge>}
          {total > 0 && (
            <span className="text-muted">
              {approved}/{total} approved
            </span>
          )}
          <span className="text-muted">{open ? "Hide" : "Show"}</span>
        </span>
      </button>

      {/* Kept mounted and hidden rather than unmounted, so a half-typed form
          inside is not thrown away by collapsing the section it sits in. */}
      <div id={panelId} hidden={!open} className="px-4">
        {children}
      </div>
    </section>
  );
}

/**
 * The expand/collapse-all control. Worth having because everything starts
 * shut: without it, reading a whole checklist is one click per section.
 */
export function ExpandAllToggle({ allExpanded, onToggle }: { allExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-end">
      <button type="button" onClick={onToggle} className="text-xs font-medium text-primary hover:underline">
        {allExpanded ? "Collapse all" : "Expand all"}
      </button>
    </div>
  );
}
