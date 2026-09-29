// The "My calendars" of each portal: every kind of item, its name and its
// default colour. Ticking one off hides that kind from every view.

import type { CalendarEventKind } from "@/lib/calendarItems";

export type KindDef = {
  key: CalendarEventKind;
  label: string;
  /** A key from eventColors. */
  color: string;
  /** Said on the card of an item of this kind. */
  noun: string;
};

export const STAFF_KINDS: readonly KindDef[] = [
  { key: "personal", label: "Personal", color: "brand", noun: "Personal" },
  { key: "task", label: "Student tasks", color: "orange", noun: "Student/application task" },
  { key: "reminder", label: "Reminders", color: "blue", noun: "Reminder" },
  { key: "deadline", label: "Deadlines", color: "red", noun: "Deadline" },
  { key: "visa", label: "Visa appointments", color: "purple", noun: "Visa appointment" },
];

export const STUDENT_KINDS: readonly KindDef[] = [
  { key: "appointment", label: "Appointments", color: "purple", noun: "Appointment" },
  { key: "interview", label: "Interviews", color: "blue", noun: "Interview" },
  { key: "deadline", label: "Application deadlines", color: "red", noun: "Application deadline" },
  { key: "payment", label: "Payments", color: "orange", noun: "Instalment due" },
  { key: "document", label: "Documents", color: "teal", noun: "Document to upload" },
  { key: "scholarship", label: "Scholarships", color: "pink", noun: "Scholarship deadline" },
  { key: "passport", label: "Passport", color: "gray", noun: "Passport expiry" },
];
