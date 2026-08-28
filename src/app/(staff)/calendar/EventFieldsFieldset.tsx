"use client";

import { useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { TimeSelect } from "./TimeSelect";
import { ColorPicker } from "./ColorPicker";
import type { CalendarRecurrence } from "./types";

export function EventFieldsFieldset({
  allDayDefault = false,
  timeDefault,
  endDateDefault,
  notesDefault,
  colorDefault,
  guestEmailsDefault,
  recurrenceDefault = "none",
  recurrenceEndDateDefault,
}: {
  allDayDefault?: boolean;
  timeDefault?: string | null;
  endDateDefault?: string | null;
  notesDefault?: string | null;
  colorDefault?: string | null;
  guestEmailsDefault?: string[];
  recurrenceDefault?: CalendarRecurrence;
  recurrenceEndDateDefault?: string | null;
}) {
  const [allDay, setAllDay] = useState(allDayDefault);
  const [recurrence, setRecurrence] = useState<string>(recurrenceDefault);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" name="all_day" defaultChecked={allDayDefault} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>
        {!allDay && <TimeSelect name="due_time" defaultValue={timeDefault ?? ""} className="w-40" />}
        <Input name="end_date" type="date" defaultValue={endDateDefault ?? ""} title="End date (optional, for a multi-day span)" className="w-40" />
        <span className="text-xs text-muted">End date (multi-day)</span>
      </div>

      <Textarea name="notes" placeholder="Description / notes (optional)" defaultValue={notesDefault ?? ""} rows={2} className="w-full" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Color</span>
        <ColorPicker name="color" defaultValue={colorDefault} />
      </div>

      <Input
        name="guest_emails"
        placeholder="Guest emails, comma-separated (optional)"
        defaultValue={(guestEmailsDefault ?? []).join(", ")}
        className="w-full"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select name="recurrence" defaultValue={recurrenceDefault} onChange={(e) => setRecurrence(e.target.value)} className="w-40">
          <option value="none">Does not repeat</option>
          <option value="daily">Repeats daily</option>
          <option value="weekly">Repeats weekly</option>
          <option value="monthly">Repeats monthly</option>
        </Select>
        {recurrence !== "none" && (
          <Input name="recurrence_end_date" type="date" defaultValue={recurrenceEndDateDefault ?? ""} title="Repeat until (optional)" className="w-40" />
        )}
      </div>
    </div>
  );
}
