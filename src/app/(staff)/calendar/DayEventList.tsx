"use client";

import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarTaskRow } from "./CalendarTaskRow";
import { PersonalTaskRow } from "./PersonalTaskRow";
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

export function DayEventList({ day, events, revalidateTo }: { day: string; events: CalendarEvent[]; revalidateTo: string }) {
  if (events.length === 0) return <EmptyState>Nothing scheduled on this day.</EmptyState>;

  return (
    <>
      {events.map((e) => {
        if (e.kind === "task") {
          return (
            <CalendarTaskRow
              key={e.id}
              taskId={e.taskId!}
              label={e.label}
              description={e.description ?? ""}
              dueDate={e.startDate ?? day}
              priority={e.priority ?? "medium"}
              tone={e.tone === "danger" || e.tone === "warning" ? e.tone : "info"}
              notes={e.notes}
              done={Boolean(e.done)}
              allDay={e.allDay}
              time={e.time}
              endDate={e.endDate}
              color={e.color}
              guestEmails={e.guestEmails}
              recurrence={e.recurrence}
              recurrenceEndDate={e.recurrenceEndDate}
              isRecurrenceInstance={e.isRecurrenceInstance}
            />
          );
        }
        if (e.kind === "personal") {
          return (
            <PersonalTaskRow
              key={e.id}
              taskId={e.personalTaskId!}
              title={e.label}
              description={e.notes ?? ""}
              dueDate={e.startDate ?? day}
              dueTime={e.time}
              priority={e.priority ?? "medium"}
              done={Boolean(e.done)}
              revalidateTo={revalidateTo}
              allDay={e.allDay}
              endDate={e.endDate}
              color={e.color}
              guestEmails={e.guestEmails}
              recurrence={e.recurrence}
              recurrenceEndDate={e.recurrenceEndDate}
              isRecurrenceInstance={e.isRecurrenceInstance}
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
    </>
  );
}
