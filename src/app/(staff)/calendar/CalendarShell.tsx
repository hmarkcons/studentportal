"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { addDays, parseYMD, toYMD, MONTH_LABELS, WEEKDAY_LABELS, getWeekDays } from "@/lib/calendarDates";
import { MonthGrid } from "./MonthGrid";
import { WeekGrid } from "./WeekGrid";
import { DayPanel } from "./DayPanel";
import type { CalendarEvent } from "./types";

export function CalendarShell({
  view,
  referenceDate,
  todayStr,
  eventsByDate,
  applicationOptions,
  staffOptions,
  canViewOthers,
  selectedStaffId,
  viewerStaffId,
}: {
  view: "month" | "week";
  referenceDate: string;
  todayStr: string;
  eventsByDate: Record<string, CalendarEvent[]>;
  applicationOptions: { id: string; label: string }[];
  staffOptions: { id: string; full_name: string }[];
  canViewOthers: boolean;
  selectedStaffId: string;
  viewerStaffId: string;
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(
    todayStr >= referenceDate ? todayStr : referenceDate
  );

  const refDate = useMemo(() => parseYMD(referenceDate), [referenceDate]);

  function navigate(nextDate: string, nextView = view, nextStaff = selectedStaffId) {
    const params = new URLSearchParams();
    params.set("view", nextView);
    params.set("date", nextDate);
    if (canViewOthers && nextStaff) params.set("staff", nextStaff);
    router.push(`/calendar?${params.toString()}`);
  }

  function goPrev() {
    const delta = view === "month" ? -1 : -7;
    const next = view === "month" ? new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + delta, 1)) : addDays(refDate, delta);
    navigate(toYMD(next));
  }
  function goNext() {
    const delta = view === "month" ? 1 : 7;
    const next = view === "month" ? new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + delta, 1)) : addDays(refDate, delta);
    navigate(toYMD(next));
  }
  function goToday() {
    navigate(todayStr);
    setSelectedDay(todayStr);
  }

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return `${MONTH_LABELS[refDate.getUTCMonth()]} ${refDate.getUTCFullYear()}`;
    }
    const days = getWeekDays(refDate);
    const start = days[0];
    const end = days[6];
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const startLabel = `${MONTH_LABELS[start.getUTCMonth()].slice(0, 3)} ${start.getUTCDate()}`;
    const endLabel = sameMonth
      ? `${end.getUTCDate()}`
      : `${MONTH_LABELS[end.getUTCMonth()].slice(0, 3)} ${end.getUTCDate()}`;
    return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
  }, [view, refDate]);

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={goPrev} aria-label="Previous">
              ◀
            </Button>
            <Button size="sm" onClick={goToday}>
              Today
            </Button>
            <Button size="sm" onClick={goNext} aria-label="Next">
              ▶
            </Button>
            <h3 className="ml-2 text-base font-semibold text-ink">{headerLabel}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canViewOthers && (
              <Select
                value={selectedStaffId}
                onChange={(e) => navigate(referenceDate, view, e.target.value)}
                className="w-44"
              >
                <option value={viewerStaffId}>My calendar</option>
                {staffOptions.filter((s) => s.id !== viewerStaffId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
            )}
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => navigate(referenceDate, "month")}
                className={`px-3 py-1.5 text-sm ${view === "month" ? "bg-primary text-primary-ink" : "text-ink hover:bg-bg"}`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => navigate(referenceDate, "week")}
                className={`px-3 py-1.5 text-sm ${view === "week" ? "bg-primary text-primary-ink" : "text-ink hover:bg-bg"}`}
              >
                Week
              </button>
            </div>
          </div>
        </div>
      </Card>

      {view === "month" ? (
        <MonthGrid
          referenceDate={referenceDate}
          todayStr={todayStr}
          eventsByDate={eventsByDate}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : (
        <WeekGrid
          referenceDate={referenceDate}
          todayStr={todayStr}
          eventsByDate={eventsByDate}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {selectedDay && (
        <DayPanel
          day={selectedDay}
          events={eventsByDate[selectedDay] ?? []}
          applicationOptions={applicationOptions}
          revalidateTo="/calendar"
        />
      )}
    </div>
  );
}
