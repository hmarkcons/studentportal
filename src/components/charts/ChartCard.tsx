import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The frame every dashboard chart sits in: a title that says what is being
 * measured, an optional line saying over what period or for whom, and a link
 * to the page where the numbers can be acted on.
 */
export function ChartCard({
  icon: Icon,
  title,
  subtitle,
  href,
  linkLabel = "Open",
  children,
  className = "",
}: {
  /** Drawn before the title, in the brand colour. */
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} />}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

/** Said in place of a chart with nothing in it, so an empty chart does not read as a zero result. */
export function NoData({ children = "Nothing to show yet." }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
