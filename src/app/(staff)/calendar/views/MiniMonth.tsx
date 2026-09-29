"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_LABELS } from "@/lib/calendarDates";
import { monthGridDays } from "@/lib/calendarLayout";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * One month as a small grid of days: the sidebar's date picker, and each of
 * the twelve months of the year view. Today is filled, the day on screen is
 * tinted, and a day with something on it carries a dot.
 */
export function MiniMonth({
  year,
  month,
  todayStr,
  selected,
  inView,
  marked,
  onPick,
  onPrev,
  onNext,
  heading = "row",
}: {
  year: number;
  month: number;
  todayStr: string;
  /** The day the calendar is on. */
  selected?: string | null;
  /** The days the main view shows, tinted lightly. */
  inView?: ReadonlySet<string>;
  /** Days with something on them. */
  marked?: ReadonlySet<string>;
  onPick: (date: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  heading?: "row" | "title";
}) {
  const days = monthGridDays(year, month);
  const title = `${MONTH_LABELS[month]} ${year}`;
  return (
    <div data-full-width data-mini-month>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className={heading === "title" ? "text-base font-semibold text-ink" : "text-sm font-semibold text-ink"}>
          {heading === "title" ? MONTH_LABELS[month] : title}
        </p>
        {onPrev && onNext && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 text-center">
        {LETTERS.map((l, i) => (
          <span key={i} aria-hidden className="py-1 text-[10px] font-semibold text-muted">
            {l}
          </span>
        ))}
        {days.map((d) => {
          const inMonth = Number(d.slice(5, 7)) - 1 === month;
          const isToday = d === todayStr;
          const isSelected = d === selected;
          const has = marked?.has(d) ?? false;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${d}${has ? ", has events" : ""}`}
              aria-current={isSelected ? "date" : undefined}
              data-date={d}
              data-marked={has ? "true" : undefined}
              className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] tabular-nums transition-colors ${
                isToday
                  ? "bg-primary font-semibold text-primary-ink"
                  : isSelected
                    ? "bg-primary/20 font-semibold text-primary"
                    : inView?.has(d)
                      ? "bg-primary/10 text-ink hover:bg-primary/20"
                      : inMonth
                        ? "text-ink hover:bg-bg"
                        : "text-muted/70 hover:bg-bg"
              }`}
            >
              {Number(d.slice(8))}
              {has && !isToday && <span aria-hidden className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
