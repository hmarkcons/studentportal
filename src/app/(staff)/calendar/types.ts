export type CalendarEventKind = "task" | "personal" | "reminder" | "deadline" | "visa";

export type CalendarTone = "success" | "warning" | "danger" | "info" | "primary" | "neutral";

export type CalendarRecurrence = "none" | "daily" | "weekly" | "monthly";

export type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  kind: CalendarEventKind;
  label: string;
  tone: CalendarTone;
  color?: string | null;
  priority?: string;
  done?: boolean;
  taskId?: string;
  personalTaskId?: string;
  description?: string;
  notes?: string | null;
  allDay?: boolean;
  startDate?: string;
  endDate?: string | null;
  guestEmails?: string[];
  recurrence?: CalendarRecurrence;
  recurrenceEndDate?: string | null;
  isRecurrenceInstance?: boolean;
};
