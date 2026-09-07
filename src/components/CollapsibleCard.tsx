"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/Card";

// Collapse state is remembered per staff member per section, so someone who
// works mostly in Documents can fold the finance blocks away once and keep
// them folded on every student they open.
//
// Read through useSyncExternalStore rather than an effect: the server has no
// localStorage, so a plain useState initialiser would render one thing on the
// server and another on the client. getServerSnapshot supplies the SSR value
// and React reconciles to the stored one without a setState-in-effect.

const PREFIX = "hmark.section.";
const listeners = new Set<() => void>();

function keyFor(id: string) {
  return `${PREFIX}${id}`;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab collapsing the same section should be reflected here too.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const v = window.localStorage.getItem(keyFor(id));
    return v === null ? defaultOpen : v === "1";
  } catch {
    // Private windows and blocked site data throw on access — fall back to the
    // default rather than breaking the page.
    return defaultOpen;
  }
}

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
  const open = useSyncExternalStore(
    subscribe,
    useCallback(() => readOpen(id, defaultOpen), [id, defaultOpen]),
    useCallback(() => defaultOpen, [defaultOpen])
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(keyFor(id), open ? "0" : "1");
    } catch {
      // Preference just won't persist; the toggle below still works.
    }
    emit();
  }, [id, open]);

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
