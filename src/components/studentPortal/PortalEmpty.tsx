import type { LucideIcon } from "lucide-react";

/**
 * Said where a page has nothing to show yet — with an icon, what will appear
 * here and when, and a way onward when there is one. An empty page should read
 * as "not yet", never as broken.
 */
export function PortalEmpty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" data-empty>
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5"
      >
        <Icon className="h-7 w-7" strokeWidth={1.8} />
      </span>
      {title && <p className="text-base font-semibold text-ink">{title}</p>}
      <p className="max-w-lg text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}
