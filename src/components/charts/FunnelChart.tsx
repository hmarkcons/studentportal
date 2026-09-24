import { compactNumber, percentOf, scalePercent, seriesColor } from "@/lib/chartMath";
import { NoData } from "./ChartCard";

export type FunnelStage = { label: string; value: number };

/**
 * How many make it from one step to the next — enquiry to registration,
 * application to enrolment. Each bar is centred and sized against the first,
 * and the share that carried on from the step before is written beside it.
 */
export function FunnelChart({ stages, format = compactNumber, label }: { stages: FunnelStage[]; format?: (n: number) => string; label: string }) {
  const first = stages[0]?.value ?? 0;
  if (stages.length === 0 || first === 0) return <NoData />;

  return (
    <ol className="flex flex-col gap-1.5" aria-label={label}>
      {stages.map((s, i) => {
        const carried = i === 0 ? null : percentOf(s.value, stages[i - 1].value);
        return (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 truncate text-ink sm:w-36">{s.label}</span>
            <span className="flex min-w-0 flex-1 justify-center" aria-hidden>
              <span
                className="flex h-6 items-center justify-center rounded text-[11px] font-semibold text-white"
                style={{ width: `${Math.max(6, scalePercent(s.value, first))}%`, backgroundColor: seriesColor(i) }}
              >
                {format(s.value)}
              </span>
            </span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">{carried === null ? format(s.value) : `${carried}%`}</span>
          </li>
        );
      })}
    </ol>
  );
}
