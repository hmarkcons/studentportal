import type { LucideIcon } from "lucide-react";

/**
 * The top of every student page: what the page is, in a sentence, on a plain
 * white card — its icon the one touch of the brand — with anything that
 * summarises it (chips, a figure, a button) to the right.
 *
 * The title stays an h2 — pages are found and read by their heading.
 */
export function PortalPageHeader({
  icon: Icon,
  title,
  description,
  eyebrow,
  aside,
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A short line above the title: "Step 3 of your journey", "Italy (Public)". */
  eyebrow?: React.ReactNode;
  aside?: React.ReactNode;
  /** Under the title row, inside the header — a row of figures. */
  children?: React.ReactNode;
}) {
  return (
    <header
      data-rise
      data-page-header
      className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 shadow-[var(--lift)] sm:px-6"
    >
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]"
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
            <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
            {description && <p className="mt-0.5 max-w-3xl text-sm text-muted">{description}</p>}
          </div>
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </header>
  );
}
