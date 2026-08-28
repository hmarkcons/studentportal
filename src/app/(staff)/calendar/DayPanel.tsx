"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseYMD, MONTH_LABELS } from "@/lib/calendarDates";
import { CalendarTaskRow } from "./CalendarTaskRow";
import { PersonalTaskRow } from "./PersonalTaskRow";
import { AddEventForm } from "./AddEventForm";
import type { CalendarEvent, CalendarTone } from "./types";

const READONLY_TONE: Record<CalendarTone, "success" | "warning" | "danger" | "info" | "primary" | "neutral"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  primary: "primary",
  neutral: "neutral",
};

const KIND_LABEL: Record<string, string> = {
  reminder: "Reminder",
  deadline: "Deadline",
  visa: "Visa",
};

function weekdayName(d: Date) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
}

export function DayPanel({
  day,
  events,
  applicationOptions,
  revalidateTo,
  onClose,
}: {
  day: string;
  events: CalendarEvent[];
  applicationOptions: { id: string; label: string }[];
  revalidateTo: string;
  onClose: () => void;
}) {
  const d = parseYMD(day);
  const heading = `${weekdayName(d)}, ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 sm:pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{heading}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          {events.length === 0 && <EmptyState>Nothing scheduled on this day.</EmptyState>}
          {events.map((e) => {
            if (e.kind === "task") {
              return (
                <CalendarTaskRow
                  key={e.id}
                  taskId={e.taskId!}
                  label={e.label}
                  description={e.description ?? ""}
                  dueDate={day}
                  priority={e.priority ?? "medium"}
                  tone={e.tone === "danger" || e.tone === "warning" ? e.tone : "info"}
                />
              );
            }
            if (e.kind === "personal") {
              return (
                <PersonalTaskRow
                  key={e.id}
                  taskId={e.personalTaskId!}
                  title={e.label}
                  description={e.description ?? ""}
                  dueDate={day}
                  dueTime={e.time}
                  priority={e.priority ?? "medium"}
                  done={Boolean(e.done)}
                  revalidateTo={revalidateTo}
                />
              );
            }
            return (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {e.time && <span className="mr-1 font-mono text-xs text-muted">{e.time}</span>}
                  {e.label}
                </span>
                <Badge tone={READONLY_TONE[e.tone]}>{KIND_LABEL[e.kind] ?? e.kind}</Badge>
              </div>
            );
          })}
        </div>

        <AddEventForm day={day} applicationOptions={applicationOptions} revalidateTo={revalidateTo} />
      </div>
    </div>
  );
}
