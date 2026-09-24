import { compactNumber, niceMax, scalePercent, toneColor, type Tone } from "@/lib/chartMath";
import { NoData } from "./ChartCard";

export type Bar = { label: string; value: number; tone?: Tone; title?: string };

/**
 * Vertical bars — a count per month, per stage, per person.
 *
 * Drawn in HTML rather than SVG so the labels stay crisp and wrap at any
 * width. An optional target draws a dashed line across the bars, and each bar
 * that reaches it is coloured as met; the rest keep the series colour.
 */
export function BarChart({
  data,
  target,
  targetLabel = "Target",
  height = 150,
  format = compactNumber,
  color = "var(--chart-1)",
  label,
}: {
  data: Bar[];
  target?: number | null;
  targetLabel?: string;
  height?: number;
  format?: (n: number) => string;
  color?: string;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  if (data.length === 0 || (data.every((d) => !d.value) && !target)) return <NoData />;
  const max = niceMax(Math.max(target ?? 0, ...data.map((d) => d.value)));
  const summary = `${label}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}${target ? `. ${targetLabel} ${format(target)}` : ""}`;

  return (
    <div role="img" aria-label={summary} className="min-w-0">
      <div className="relative flex items-end gap-1.5 border-b border-border sm:gap-2" style={{ height }}>
        {target ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-ink/40"
            style={{ bottom: `${scalePercent(target, max)}%` }}
          >
            <span className="absolute -top-4 right-0 bg-card px-1 text-[10px] text-muted">
              {targetLabel} {format(target)}
            </span>
          </div>
        ) : null}
        {data.map((d) => {
          const met = target ? d.value >= target : false;
          const fill = d.tone ? toneColor(d.tone) : met ? "var(--success)" : color;
          return (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={d.title ?? `${d.label}: ${format(d.value)}`}>
              <span className="text-[10px] tabular-nums text-muted">{d.value ? format(d.value) : ""}</span>
              <div
                className="w-full max-w-10 rounded-t"
                style={{ height: `${Math.max(d.value ? 2 : 0, scalePercent(d.value, max))}%`, backgroundColor: fill }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 sm:gap-2">
        {data.map((d) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
