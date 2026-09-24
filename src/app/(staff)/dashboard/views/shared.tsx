import Link from "next/link";
import { compactNumber } from "@/lib/chartMath";
import { NoData } from "@/components/charts/ChartCard";

/** The row of headline figures at the top of every dashboard. */
export function Kpis({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

/** Charts side by side on a wide screen, one under another on a phone. */
export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid grid-cols-1 gap-4 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>{children}</div>;
}

export type ListItem = { key: string; href?: string; label: string; detail?: string; tone?: "danger" | "warning" | "success" | "muted" };

const TONE: Record<NonNullable<ListItem["tone"]>, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  muted: "text-muted",
};

/** A short list of things to act on, each linking to where it is done. */
export function LinkList({ items, empty }: { items: ListItem[]; empty: string }) {
  if (items.length === 0) return <NoData>{empty}</NoData>;
  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {items.map((i) => (
        <li key={i.key} className="flex items-center justify-between gap-3 py-1.5">
          {i.href ? (
            <Link href={i.href} className="min-w-0 truncate text-primary hover:underline">
              {i.label}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-ink">{i.label}</span>
          )}
          {i.detail && <span className={`shrink-0 text-xs tabular-nums ${i.tone ? TONE[i.tone] : "text-muted"}`}>{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** "≈ PKR 1.2M" — a total converted from several currencies at the fixed rates (toPKR). */
export function approxPkr(n: number): string {
  return `≈ PKR ${compactNumber(n)}`;
}

/** "3 days", "1 day", "today". */
export function days(n: number): string {
  if (n === 0) return "today";
  return `${n} day${n === 1 ? "" : "s"}`;
}

/** Up or down against last month, for a StatCard's trend line. */
export function versus(now: number, before: number, noun = "last month"): { direction: "up" | "down"; label: string } | undefined {
  if (now === before) return undefined;
  const diff = now - before;
  return { direction: diff > 0 ? "up" : "down", label: `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than ${noun}` };
}
