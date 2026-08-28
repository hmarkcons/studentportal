export type CalendarEventKind = "task" | "personal" | "reminder" | "deadline" | "visa";

export type CalendarTone = "success" | "warning" | "danger" | "info" | "primary" | "neutral";

export type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  kind: CalendarEventKind;
  label: string;
  tone: CalendarTone;
  priority?: string;
  done?: boolean;
  taskId?: string;
  personalTaskId?: string;
  description?: string;
};
