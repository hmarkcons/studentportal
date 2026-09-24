import { percentOf, toneColor, type Tone } from "@/lib/chartMath";

/**
 * One number against the number it should reach: registrations against a
 * monthly target, money collected against money due, an approval rate.
 *
 * With a target the ring fills to value/target and the middle reads "7 / 10";
 * without one, `value` is already a percentage. When there is nothing to
 * measure against the ring stays empty and says so, rather than showing 0%.
 */
export function ProgressRing({
  value,
  target,
  label,
  caption,
  tone,
  size = 112,
  display,
}: {
  value: number | null;
  /** Omit when value is already a percentage. */
  target?: number | null;
  label: string;
  /** A line under the label: "target 10", "last 12 months". */
  caption?: string;
  tone?: Tone;
  size?: number;
  /** Overrides the text in the middle. */
  display?: string;
}) {
  const pct = value === null ? null : target === undefined ? Math.round(value) : target ? percentOf(value, target) : null;
  const stroke = 10;
  const r = size / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  const filled = pct === null ? 0 : (Math.max(0, Math.min(100, pct)) / 100) * c;
  const color = toneColor(tone ?? (pct !== null && pct >= 100 ? "success" : "default"));
  const middle = display ?? (value === null ? "—" : target === undefined ? `${Math.round(value)}%` : target ? `${value}/${target}` : `${value}`);

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${middle}${pct !== null && target ? ` (${pct}%)` : ""}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${c - filled}`}
          strokeLinecap={filled > 0 ? "round" : "butt"}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y={target && !display ? "46%" : "50%"} textAnchor="middle" dominantBaseline="middle" fontSize={middle.length > 6 ? 15 : 19} fontWeight="600" fill="var(--ink)">
          {middle}
        </text>
        {/* The share, under "7/10" — not when the middle already says it. */}
        {target && !display ? (
          <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
            {pct === null ? "" : `${pct}%`}
          </text>
        ) : null}
      </svg>
      <p className="text-xs font-medium text-ink">{label}</p>
      {caption && <p className="-mt-1 text-[11px] text-muted">{caption}</p>}
    </div>
  );
}
