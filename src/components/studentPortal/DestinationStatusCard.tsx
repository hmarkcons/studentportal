import { destinationHeadline, type DestinationStatusRow, type StageState } from "@/lib/destinationStatus";

const ROLE_LABEL: Record<DestinationStatusRow["role"], string> = {
  primary: "Primary country",
  backup: "Backup country",
  applied: "Also applying",
};

const MARK: Record<StageState, string> = {
  done: "✓",
  skipped: "↷",
  progress: "●",
  blocked: "✕",
  next: "→",
  ahead: "",
};

/**
 * One country's status bar on a student's dashboard: the steps its process
 * runs through, as staff record them, with the one under way picked out.
 *
 * The primary country is in the brand green and a backup in blue-violet, and
 * each says which it is, so two bars side by side are never mistaken for one
 * process.
 */
export function DestinationStatusCard({ row }: { row: DestinationStatusRow }) {
  const backup = row.role === "backup";
  const headline = destinationHeadline(row);
  const doneBar = backup ? "bg-hero-alt" : "bg-hero";
  const headlineTone =
    row.current?.state === "blocked"
      ? "text-danger"
      : row.current?.state === "progress"
        ? "text-warning"
        : row.total > 0 && !row.current
          ? "text-success"
          : "text-ink";

  const bar: Record<StageState, string> = {
    done: doneBar,
    skipped: "bg-muted/35",
    progress: "bg-warning motion-safe:animate-pulse",
    blocked: "bg-danger",
    next: backup ? "bg-[var(--hero-alt-from)]/25" : "bg-primary/25",
    ahead: "bg-border",
  };

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card"
      data-lift
      data-rise
      data-destination-status={row.name}
      data-role={row.role}
    >
      <div className={`${backup ? "bg-hero-alt" : "bg-hero"} relative flex flex-wrap items-center justify-between gap-3 overflow-hidden px-5 py-4 text-white`}>
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold tracking-wider ring-1 ring-white/30"
          >
            {row.code ?? "🌍"}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
              {row.name}
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" data-destination-role>
                {ROLE_LABEL[row.role]}
              </span>
            </p>
            <p className="truncate text-xs text-white/85">{row.summary}</p>
          </div>
        </div>
        {row.total > 0 && (
          <div className="relative text-right">
            <p className="text-2xl font-bold leading-none" data-destination-percent>
              {row.percent}%
            </p>
            <p className="text-[11px] text-white/85">
              {row.done} of {row.total} steps
            </p>
          </div>
        )}
      </div>

      <div className="px-5 py-4">
        <p className={`text-sm font-medium ${headlineTone}`} data-destination-headline>
          {headline}
        </p>
        {row.total > 0 && (
          // Wraps rather than scrolls, as the staff card does: a row cut off
          // by a few pixels reads as a truncated label, not as more to see.
          <ol className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-x-1.5 gap-y-4">
            {row.stages.map((stage) => {
              const here = row.current?.key === stage.key;
              return (
                <li key={stage.key} className="flex min-w-0 flex-col gap-1.5" data-stage={stage.key} data-state={stage.state}>
                  <span aria-hidden className={`h-2 rounded-full ${bar[stage.state]} ${here ? "ring-2 ring-offset-1 ring-offset-card " + (backup ? "ring-[var(--hero-alt-from)]/40" : "ring-primary/40") : ""}`} />
                  <span className={`text-[11px] font-medium leading-tight ${stage.state === "ahead" ? "text-muted" : "text-ink"}`}>
                    {MARK[stage.state] && (
                      <span
                        aria-hidden
                        className={`mr-1 ${
                          stage.state === "blocked" ? "text-danger" : stage.state === "progress" ? "text-warning" : stage.state === "skipped" ? "text-muted" : backup ? "text-[var(--hero-alt-to)]" : "text-primary"
                        }`}
                      >
                        {MARK[stage.state]}
                      </span>
                    )}
                    {stage.label}
                  </span>
                  <span
                    className={`text-[10px] leading-tight ${
                      stage.state === "blocked" ? "text-danger" : stage.state === "progress" ? "text-warning" : "text-muted"
                    }`}
                  >
                    {stage.display ?? (stage.state === "next" ? "Up next" : "—")}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
