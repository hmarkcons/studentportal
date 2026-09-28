import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { Journey, JourneyStep } from "@/lib/studentJourney";

/**
 * The seven steps from registration to arrival, across the top of a student's
 * dashboard: ticked as each is done, the current one marked, a refusal in red.
 * Across the page on a wide screen, down it on a phone.
 */
export function JourneyTracker({ journey }: { journey: Journey }) {
  const { steps, done, percent, next } = journey;
  return (
    <Card>
      {/* Marked on an inner element: Card does not pass data- attributes on. */}
      <div className="flex flex-col gap-5" data-journey>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Your journey</h3>
          <p className="text-lg font-semibold tracking-tight text-ink">
            {next ? (next.state === "blocked" ? `Stopped at ${next.label}` : `Now: ${next.label}`) : "Every step is done — safe travels!"}
          </p>
        </div>
        <div className="text-right">
          <p className="bg-hero bg-clip-text text-4xl font-bold leading-none text-transparent" data-journey-percent>
            {percent}%
          </p>
          <p className="text-xs text-muted">
            {done} of {steps.length} steps
          </p>
        </div>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="bg-hero h-full rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
      </div>

      <ol className="grid grid-cols-1 gap-5 lg:grid-cols-7 lg:gap-2">
        {steps.map((step, i) => (
          <Step key={step.key} step={step} index={i} last={i === steps.length - 1} nextDone={steps[i + 1]?.state === "done"} />
        ))}
      </ol>

      {next && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${
            next.state === "blocked" ? "bg-danger-bg" : "bg-primary/10 ring-1 ring-primary/20"
          }`}
          data-journey-next
        >
          <p className="text-sm text-ink">
            <span className="font-semibold">Next — {next.label}:</span> {next.detail}
          </p>
          {next.href && (
            <Link
              href={next.href}
              className="bg-hero rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary/25 hover:opacity-95"
            >
              Continue →
            </Link>
          )}
        </div>
      )}
      </div>
    </Card>
  );
}

function Step({ step, index, last, nextDone }: { step: JourneyStep; index: number; last: boolean; nextDone: boolean }) {
  const circle =
    step.state === "done"
      ? "bg-hero text-white border-transparent shadow-sm shadow-primary/30"
      : step.state === "current"
        ? "bg-card text-primary border-primary ring-4 ring-primary/15"
        : step.state === "blocked"
          ? "bg-danger text-white border-danger"
          : "bg-card text-muted border-border";
  const connector = step.state === "done" && nextDone ? "bg-primary" : "bg-border";
  const mark = step.state === "done" ? "✓" : step.state === "blocked" ? "!" : String(index + 1);

  return (
    <li className="relative flex gap-3 lg:flex-col lg:items-center lg:text-center" data-journey-step={step.key} data-state={step.state}>
      {!last && (
        <>
          {/* Across, from this circle to the next — wide screens. */}
          <span aria-hidden className={`absolute top-[17px] hidden h-0.5 lg:block ${connector}`} style={{ left: "calc(50% + 22px)", right: "calc(-50% + 22px)" }} />
          {/* Down, to the step below — phones. */}
          <span aria-hidden className={`absolute left-[17px] top-10 -bottom-5 w-0.5 lg:hidden ${connector}`} />
        </>
      )}
      <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${circle}`}>
        {mark}
        {step.state === "current" && step.progress !== undefined && step.progress > 0 && (
          <ProgressArc progress={step.progress} />
        )}
      </span>
      <span className="min-w-0 lg:mt-1">
        <span className={`block text-sm font-medium ${step.state === "upcoming" ? "text-muted" : "text-ink"}`}>{step.label}</span>
        <span className={`block text-xs ${step.state === "blocked" ? "text-danger" : "text-muted"}`}>{step.detail}</span>
        {step.href && step.state !== "upcoming" && step.state !== "done" && (
          <Link href={step.href} className="text-xs font-medium text-primary hover:underline">
            Open →
          </Link>
        )}
      </span>
    </li>
  );
}

/** How far through a step that is partly done — documents approved, travel items ready. */
function ProgressArc({ progress }: { progress: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, progress)) * c;
  return (
    <svg aria-hidden className="pointer-events-none absolute -inset-[5px]" viewBox="0 0 46 46" width={46} height={46}>
      <circle
        cx={23}
        cy={23}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={3}
        strokeDasharray={`${filled} ${c - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 23 23)"
      />
    </svg>
  );
}
