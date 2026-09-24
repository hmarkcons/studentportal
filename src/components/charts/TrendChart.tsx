import { compactNumber, linePath, linePoints, niceMax, seriesColor, ticks } from "@/lib/chartMath";
import { NoData } from "./ChartCard";

export type TrendSeries = { name: string; values: number[]; color?: string };

/**
 * A line over time — up to three series sharing one scale, the first filled
 * underneath. Months (or weeks) along the bottom, gridlines at round numbers.
 *
 * The lines are SVG stretched to the plot, with strokes that do not stretch;
 * every label, and every point, is ordinary HTML laid over it. An SVG scaled
 * as a whole scales its text too — twice the size on a wide screen and too
 * small to read on a phone.
 */
export function TrendChart({
  labels,
  series,
  format = compactNumber,
  height = 150,
  label,
}: {
  labels: string[];
  series: TrendSeries[];
  format?: (n: number) => string;
  height?: number;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const all = series.flatMap((s) => s.values);
  if (labels.length === 0 || all.every((v) => !v)) return <NoData />;
  const max = niceMax(Math.max(...all));
  const grid = ticks(max, 4);
  const summary = `${label}. ${series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}`).join(". ")}`;
  // Points in a 100×100 box; the SVG stretches it to the plot.
  const pointsFor = (values: number[]) => linePoints(values, 100, 100, max);

  return (
    <div className="min-w-0" role="img" aria-label={summary}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs" aria-hidden>
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5 text-ink">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color ?? seriesColor(i) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2" aria-hidden>
        {/* The scale, top to bottom. */}
        <div className="relative w-9 shrink-0 text-right text-[10px] tabular-nums text-muted" style={{ height }}>
          {grid.map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (g / max) * 100}%` }}>
              {format(g)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {grid.map((g) => (
            <div
              key={g}
              className={`absolute inset-x-0 border-t ${g === 0 ? "border-border" : "border-dashed border-border"}`}
              style={{ top: `${100 - (g / max) * 100}%` }}
            />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {series.map((s, i) => {
              const color = s.color ?? seriesColor(i);
              const pts = pointsFor(s.values);
              return (
                <g key={s.name}>
                  {i === 0 && <path d={`${linePath(pts)} L${pts.at(-1)?.x ?? 0} 100 L${pts[0]?.x ?? 0} 100 Z`} fill={color} opacity={0.12} />}
                  <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
          </svg>
          {series.map((s, i) =>
            pointsFor(s.values).map((p, j) => (
              <span
                key={`${s.name}-${j}`}
                title={`${s.name} · ${labels[j]}: ${format(s.values[j])}`}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
                style={{ left: `${p.x}%`, top: `${p.y}%`, borderColor: s.color ?? seriesColor(i) }}
              />
            ))
          )}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-11 text-[10px] text-muted" aria-hidden>
        {labels.map((l, i) => (
          <span key={l + i} className={i > 0 && i < labels.length - 1 && labels.length > 7 && i % 2 === 1 ? "hidden sm:inline" : undefined}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
