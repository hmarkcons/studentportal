/**
 * The headings on Create Doc Checklist.
 *
 * The screen is a builder — a palette, a list of sections, and requirements
 * inside each — and every one of those was announced by the same small grey
 * `text-sm font-medium` line. Nothing told you where one part ended and the
 * next began, so a page with real structure read as one flat column.
 *
 * So: the brand green, an accent bar, and enough weight to be found while
 * scrolling. Colours come from the CSS variables rather than hex, because the
 * app has a dark theme and a hard-coded #52be96 on a dark card is unreadable.
 */
export function ChecklistHeading({
  children,
  meta,
  actions,
  level = "section",
}: {
  children: React.ReactNode;
  /** A count or qualifier, kept quiet beside the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** "section" for a top-level heading, "card" for one inside a card. */
  level?: "section" | "card";
}) {
  const Tag = level === "section" ? "h3" : "h4";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        {/* The accent bar carries the colour, so the text itself can stay ink
            and remain legible at small sizes in both themes. */}
        <span
          aria-hidden
          className={`inline-block w-1 shrink-0 rounded-full bg-primary ${level === "section" ? "h-5" : "h-4"}`}
        />
        <Tag
          className={
            level === "section"
              ? "truncate text-[13px] font-semibold uppercase tracking-wide text-ink"
              : "truncate text-sm font-semibold text-ink"
          }
        >
          {children}
        </Tag>
        {meta && <span className="shrink-0 text-xs font-normal text-muted">{meta}</span>}
      </div>
      {actions}
    </div>
  );
}

/** The page's own title, with the green rule that sets the screen's tone. */
export function ChecklistPageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-1.5 h-1 w-14 rounded-full bg-primary" />
      {children && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
