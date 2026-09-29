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
  const valueColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        {Icon && <Icon aria-hidden className="h-5 w-5 shrink-0 text-muted" />}
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
