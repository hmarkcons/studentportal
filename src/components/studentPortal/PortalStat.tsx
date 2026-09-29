import type { LucideIcon } from "lucide-react";

export type PortalStatTone = "default" | "success" | "warning" | "danger" | "info";

const TILE: Record<PortalStatTone, string> = {
  default: "bg-primary/15 text-primary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

const VALUE: Record<PortalStatTone, string> = {
  default: "text-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

/**
 * One figure a page is summarised by — "3 applications", "€700 to pay" — on
 * a tile with its icon. The value and its label read as one phrase to a
 * screen reader and to anything reading the page's text.
 */
export function PortalStat({
  icon: Icon,
  value,
  label,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  tone?: PortalStatTone;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TILE[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className={`text-xl font-semibold leading-tight tabular-nums ${VALUE[tone]}`}>{value}</span>{" "}
        <span className="text-xs text-muted">{label}</span>
        {hint && <span className="block truncate text-[11px] text-muted">{hint}</span>}
      </span>
    </div>
  );
}

/** A row of PortalStats that wraps on a phone and spreads across a wide screen. */
export function PortalStats({ children, className = "", ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
