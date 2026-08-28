"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseYMD, MONTH_LABELS } from "@/lib/calendarDates";
import { CalendarTaskRow } from "./CalendarTaskRow";
import { PersonalTaskRow } from "./PersonalTaskRow";
import { AddPersonalTaskForm } from "./AddPersonalTaskForm";
import { AddCalendarTaskForm } from "./AddCalendarTaskForm";
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
}: {
  day: string;
  events: CalendarEvent[];
  applicationOptions: { id: string; label: string }[];
  revalidateTo: string;
}) {
  const d = parseYMD(day);
  const heading = `${weekdayName(d)}, ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  return (
    <Card className="mt-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{heading}</h3>

      <div className="mb-4 flex flex-col gap-2">
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

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <AddPersonalTaskForm day={day} revalidateTo={revalidateTo} />
        <AddCalendarTaskForm applications={applicationOptions} defaultDate={day} />
      </div>
    </Card>
  );
}
