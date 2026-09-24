import { compactNumber, percentOf, ringSegments, seriesColor } from "@/lib/chartMath";
import { NoData } from "./ChartCard";

export type Slice = { label: string; value: number; color?: string };

/**
 * Shares of a whole — applications by outcome, money by how late it is.
 * The total sits in the middle; the legend beside it gives each share's
 * count and percentage, so nothing depends on judging an angle.
 */
export function DonutChart({
  slices,
  centerLabel,
  format = compactNumber,
  size = 132,
  label,
}: {
  slices: Slice[];
  centerLabel: string;
  format?: (n: number) => string;
  size?: number;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total === 0) return <NoData />;
  const stroke = 16;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const segments = ringSegments(
    slices.map((s) => s.value),
    c
  );
  const summary = `${label}: ${slices.map((s) => `${s.label} ${format(s.value)} (${percentOf(s.value, total)}%)`).join(", ")}`;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={summary} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {slices.map((s, i) =>
          segments[i].length > 0 ? (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={stroke}
              strokeDasharray={`${segments[i].length} ${c - segments[i].length}`}
              strokeDashoffset={-segments[i].offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${format(s.value)}`}</title>
            </circle>
          ) : null
        )}
        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="600" fill="var(--ink)">
          {format(total)}
        </text>
        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
          {centerLabel}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color ?? seriesColor(i) }} />
            <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
            <span className="tabular-nums text-muted">
              {format(s.value)} · {percentOf(s.value, total) ?? 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
