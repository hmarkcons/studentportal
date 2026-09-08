"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";

// Every section starts open on each page load. Collapsing is for getting one
// long block out of the way while working, not a setting.
//
// This did persist the choice per person per section in localStorage. In
// practice a section folded away once stayed folded on every student opened
// afterwards, including after a refresh, which read as the page having lost
// its content rather than as a remembered preference. Opening fresh every time
// costs one click to re-collapse and never hides anything unexpectedly.

export function CollapsibleCard({
  id,
  title,
  subtitle,
  badge,
  defaultOpen = true,
  className = "",
  children,
}: {
  /** Stable key for remembering this section's state. */
  id: string;
  title: string;
  subtitle?: string;
  /** Small summary shown in the header, useful while collapsed. */
  badge?: React.ReactNode;
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
