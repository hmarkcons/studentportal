import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  trend,
  tone = "default",
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; label: string };
  tone?: "default" | "success" | "warning" | "danger";
  icon?: LucideIcon;
  /** A line under the figure saying what it is measured against: "target 10", "≈ in PKR". */
  hint?: string;
}) {
  // A zero is not news: coloured, a row of red and amber noughts reads as a
  // set of alarms about nothing.
  const quiet = value === 0 || value === "0";
  const valueColor = quiet
    ? "text-ink"
    : tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";

  // A stripe down the left in one of the five accents — the cards in a row
  // take them in turn (data-stat, globals.css) — so a row of figures is not a
  // row of identical white boxes. The figure itself keeps its meaning's colour.
  return (
    <div data-stat className="relative overflow-hidden rounded-lg border border-border bg-card p-4 pl-5 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_2px_10px_-6px_rgb(16_24_40/0.08)]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--stat-accent)]" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        {Icon && (
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--stat-soft)] text-[var(--stat-ink)]">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {trend && (
        <p className={`mt-1 text-xs ${trend.direction === "up" ? "text-success" : "text-danger"}`}>
          {trend.direction === "up" ? (
            <TrendingUp aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          ) : (
            <TrendingDown aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          )}
          {trend.label}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
