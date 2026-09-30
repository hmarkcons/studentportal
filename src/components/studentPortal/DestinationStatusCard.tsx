import type { CSSProperties } from "react";
import { destinationHeadline, type DestinationStatusRow, type StageState } from "@/lib/destinationStatus";
import { ArrowRight, Check, CircleDot, Globe, Redo2, X, type LucideIcon } from "lucide-react";

const ROLE_LABEL: Record<DestinationStatusRow["role"], string> = {
  primary: "Primary country",
  backup: "Backup country",
  applied: "Also applying",
};

const MARK: Record<StageState, LucideIcon | null> = {
  done: Check,
  skipped: Redo2,
  progress: CircleDot,
  blocked: X,
  next: ArrowRight,
  ahead: null,
};

/** Which of the portal's five country accents (globals.css) a card wears: the primary first, then each in turn. */
export function countryAccent(index: number): number {
  return (index % 5) + 1;
}

/** A small ring of the steps done, in the country's accent. */
function StepsRing({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--a)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, percent)) / 100)}
      />
    </svg>
  );
}

/**
 * One country's status bar on a student's dashboard: the steps its process
 * runs through, as staff record them, with the one under way picked out.
 *
 * A white card whose country colour is in the details — a slim stripe down its
 * edge, its country tile and badge, its ring and its done steps — so two
 * countries side by side are told apart at a glance without either becoming a
 * block of colour. The primary is the brand green; each backup takes the next
 * accent (countryAccent).
 */
export function DestinationStatusCard({ row, accent = row.role === "primary" ? 1 : 2 }: { row: DestinationStatusRow; accent?: number }) {
  const headline = destinationHeadline(row);
  const headlineTone =
    row.current?.state === "blocked"
      ? "text-danger"
      : row.current?.state === "progress"
        ? "text-warning"
        : row.total > 0 && !row.current
          ? "text-success"
          : "text-ink";

  // The accent as three variables, so every class below can name them.
  const style = {
    "--a": `var(--accent-${accent})`,
    "--a-soft": `var(--accent-${accent}-soft)`,
    "--a-ink": `var(--accent-${accent}-ink)`,
  } as CSSProperties;

  const bar: Record<StageState, string> = {
    done: "bg-[var(--a)]",
    skipped: "bg-muted/35",
    progress: "bg-warning motion-safe:animate-pulse",
    blocked: "bg-danger",
    next: "bg-[var(--a)]/25",
    ahead: "bg-border",
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border bg-card"
      style={style}
      data-lift
      data-rise
      data-destination-status={row.name}
      data-role={row.role}
      data-accent={accent}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--a)]" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--a-soft)] text-sm font-bold tracking-wider text-[var(--a-ink)]"
          >
            {row.code ?? <Globe className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
              {row.name}
              <span
                className="rounded-full bg-[var(--a-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--a-ink)]"
                data-destination-role
              >
                {ROLE_LABEL[row.role]}
              </span>
            </p>
            <p className="truncate text-xs text-muted">{row.summary}</p>
          </div>
        </div>
        {row.total > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold leading-none text-ink" data-destination-percent>
                {row.percent}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {row.done} of {row.total} steps
              </p>
            </div>
            <StepsRing percent={row.percent} />
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
                  <span aria-hidden className={`h-1.5 rounded-full ${bar[stage.state]} ${here ? "ring-2 ring-[var(--a)]/35 ring-offset-1 ring-offset-card" : ""}`} />
                  <span className={`text-[11px] font-medium leading-tight ${stage.state === "ahead" ? "text-muted" : "text-ink"}`}>
                    {(() => {
                      const Mark = MARK[stage.state];
                      if (!Mark) return null;
                      return (
                        <Mark
                          aria-hidden
                          strokeWidth={3}
                          className={`mr-1 inline h-3 w-3 shrink-0 align-[-2px] ${
                            stage.state === "blocked"
                              ? "text-danger"
                              : stage.state === "progress"
                                ? "text-warning"
                                : stage.state === "skipped"
                                  ? "text-muted"
                                  : "text-[var(--a-ink)]"
                          }`}
                        />
                      );
                    })()}
                    {stage.label}
                  </span>
                  <span
                    title={stage.title}
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
