export function StatCard({
  label,
  value,
  trend,
  tone = "default",
}: {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; label: string };
  tone?: "default" | "success" | "warning" | "danger";
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
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {trend && (
        <p className={`mt-1 text-xs ${trend.direction === "up" ? "text-success" : "text-danger"}`}>
          {trend.direction === "up" ? "▲" : "▼"} {trend.label}
        </p>
      )}
    </div>
  );
}
