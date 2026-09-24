import Link from "next/link";
import { compactNumber, niceMax, scalePercent, toneColor, type Tone } from "@/lib/chartMath";
import { NoData } from "./ChartCard";

export type HBarItem = {
  label: string;
  value: number;
  /** Shown after the value: "4/10 · 40%", "EUR 1,200". */
  detail?: string;
  href?: string;
  tone?: Tone;
  /** Draws the bar against this instead of the list's largest value, e.g. a person's own target. */
  of?: number | null;
};

/**
 * A ranked list with a bar each — a leaderboard, a source mix, a breakdown by
 * country. Long names truncate rather than push the bars around.
 */
export function HBarList({
  items,
  format = compactNumber,
  color = "var(--chart-1)",
  empty,
  label,
}: {
  items: HBarItem[];
  format?: (n: number) => string;
  color?: string;
  empty?: string;
  /** What the list shows, for screen readers. */
  label: string;
}) {
  if (items.length === 0) return <NoData>{empty}</NoData>;
  const max = niceMax(Math.max(...items.map((i) => i.value)));

  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {items.map((item) => {
        const pct = scalePercent(item.value, item.of ?? max);
        const name = item.href ? (
          <Link href={item.href} className="truncate text-primary hover:underline">
            {item.label}
          </Link>
        ) : (
          <span className="truncate">{item.label}</span>
        );
        return (
          <li key={item.label} className="flex items-center gap-3 text-sm">
            <span className="flex w-28 shrink-0 text-ink sm:w-40">{name}</span>
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.tone ? toneColor(item.tone) : color }} />
            </span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
              {item.detail ?? format(item.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
