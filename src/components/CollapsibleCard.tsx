"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";

// Every section starts CLOSED on each page load, and the choice is never
// remembered.
//
// Those are two separate decisions and the history is worth keeping straight.
// The state was once persisted per person per section in localStorage, and a
// section folded away stayed folded on every student opened afterwards — that
// read as the page having lost its content, so persistence went. The default
// then became open, which made a registered student's page a very long scroll
// through four form-heavy panels to reach anything below them.
//
// Closed-by-default plus no persistence is the combination that works: the
// page opens as a short index every time, and nothing is remembered, so it is
// always the same page rather than whatever shape you left it in.
//
// It only works because a closed header still says something. Pass a `badge`
// with whatever the section would have told you — whether the agreement is
// signed, whether the invoice is paid — or collapsing it hides the answer
// instead of tidying the page.

export function CollapsibleCard({
  id,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  className = "",
  children,
}: {
  /** Stable key for the panel id the header points at. Nothing is stored. */
  id: string;
  title: string;
  subtitle?: string;
  /**
   * Shown in the header, and the reason closed-by-default is acceptable: this
   * is what the section would have told you at a glance.
   */
  badge?: React.ReactNode;
  /** Closed unless a caller has a reason to open it. */
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const panelId = `section-${id}`;

  return (
    <Card className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          aria-hidden
          className={`shrink-0 text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
        <span className="shrink-0 text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {/* Kept mounted and hidden rather than unmounted, so a half-typed form
          inside is not thrown away by collapsing the section. */}
      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </Card>
  );
}
