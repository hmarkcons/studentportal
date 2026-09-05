"use client";

import { Card } from "@/components/ui/Card";
import { parseYMD, MONTH_LABELS, WEEKDAY_FULL_LABELS } from "@/lib/calendarDates";
import { DayEventList } from "./DayEventList";
import { AddEventForm } from "./AddEventForm";
import type { CalendarEvent } from "./types";

export function DayView({
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
  const heading = `${WEEKDAY_FULL_LABELS[d.getUTCDay()]}, ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-ink">{heading}</h3>
      <div className="mb-4 flex flex-col gap-2">
        <DayEventList day={day} events={events} revalidateTo={revalidateTo} />
      </div>
      <AddEventForm day={day} applicationOptions={applicationOptions} revalidateTo={revalidateTo} />
    </Card>
  );
}
