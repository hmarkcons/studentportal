"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createCalendarEvent,
  deleteCalendarTask,
  deleteReminder,
  moveCalendarItem,
  searchCalendar,
  toggleCalendarTask,
  toggleReminderResolved,
  updateCalendarTask,
  updateReminder,
} from "@/lib/actions/calendarEvents";
import { deletePersonalTask, togglePersonalTask, updatePersonalTask } from "@/lib/actions/personalTasks";
import type { CalendarEvent } from "@/lib/calendarItems";
import type { CalendarView } from "@/lib/calendarLayout";
import { CalendarApp } from "./CalendarApp";
import { STAFF_KINDS } from "./kinds";
import type { CalendarHandlers } from "./types";

const PATH = "/calendar";

const NOT_HERE = { error: "This is kept somewhere else — open it from its card to change it." };

/** The staff calendar: the shared calendar, with the actions that change it. */
export function StaffCalendar({
  view,
  referenceDate,
  todayStr,
  events,
  loadedRange,
  applicationOptions,
  staffOptions,
  canViewOthers,
  selectedStaffId,
  viewerStaffId,
}: {
  view: CalendarView;
  referenceDate: string;
  todayStr: string;
  events: CalendarEvent[];
  loadedRange: { start: string; end: string };
  applicationOptions: { id: string; label: string }[];
  staffOptions: { id: string; full_name: string }[];
  canViewOthers: boolean;
  selectedStaffId: string;
  viewerStaffId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlers = useMemo<CalendarHandlers>(
    () => ({
      create: (form) => createCalendarEvent(PATH, undefined, form),
      update: (e, form) => {
        if (e.source?.table === "application_tasks") return updateCalendarTask(e.source.id, PATH, undefined, form);
        if (e.source?.table === "personal_tasks") return updatePersonalTask(e.source.id, PATH, undefined, form);
        return Promise.resolve(NOT_HERE);
      },
      move: (e, to) =>
        e.source
          ? moveCalendarItem({ table: e.source.table, id: e.source.id, fromDate: e.date, toDate: to.date, time: to.time, endTime: to.endTime }, PATH)
          : Promise.resolve(NOT_HERE),
      toggleDone: (e, done) => {
        if (e.source?.table === "application_tasks") return toggleCalendarTask(e.source.id, PATH, done);
        if (e.source?.table === "personal_tasks") return togglePersonalTask(e.source.id, PATH, done);
        if (e.source?.table === "reminders") return toggleReminderResolved(e.source.id, PATH, done);
        return Promise.resolve(NOT_HERE);
      },
      remove: (e) => {
        if (e.source?.table === "application_tasks") return deleteCalendarTask(e.source.id, PATH);
        if (e.source?.table === "personal_tasks") return deletePersonalTask(e.source.id, PATH);
        if (e.source?.table === "reminders") return deleteReminder(e.source.id, PATH);
        return Promise.resolve(NOT_HERE);
      },
      updateReminder: (e, form) =>
        e.source?.table === "reminders" ? updateReminder(e.source.id, PATH, undefined, form) : Promise.resolve(NOT_HERE),
      search: (q) => searchCalendar(q, canViewOthers ? selectedStaffId : null),
    }),
    [canViewOthers, selectedStaffId]
  );

  // The selector shows the pick at once: router.push() answers later, and a
  // re-render in between with the old prop would snap it back. Adjusted during
  // render when the server confirms, rather than in an effect.
  const [localStaffId, setLocalStaffId] = useState(selectedStaffId);
  const [prevSelected, setPrevSelected] = useState(selectedStaffId);
  if (selectedStaffId !== prevSelected) {
    setPrevSelected(selectedStaffId);
    setLocalStaffId(selectedStaffId);
  }

  const extraParams = useMemo(
    () => (canViewOthers && selectedStaffId !== viewerStaffId ? { staff: selectedStaffId } : undefined),
    [canViewOthers, selectedStaffId, viewerStaffId]
  );

  const staffSelect = canViewOthers ? (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
      Whose calendar
      <select
        value={localStaffId}
        onChange={(e) => {
          const id = e.target.value;
          setLocalStaffId(id);
          const params = new URLSearchParams({
            view: searchParams.get("view") ?? view,
            date: searchParams.get("date") ?? referenceDate,
          });
          if (id !== viewerStaffId) params.set("staff", id);
          router.push(`${PATH}?${params.toString()}`, { scroll: false });
        }}
        data-staff-select
        className="rounded-md border border-border bg-bg px-2.5 py-2 text-sm font-normal text-ink"
      >
        <option value={viewerStaffId}>My calendar</option>
        {staffOptions
          .filter((s) => s.id !== viewerStaffId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
      </select>
    </label>
  ) : null;

  return (
    <CalendarApp
      basePath={PATH}
      navigation="server"
      view={view}
      referenceDate={referenceDate}
      todayStr={todayStr}
      events={events}
      loadedRange={loadedRange}
      kinds={STAFF_KINDS}
      storageKey="calendar.hidden.staff"
      handlers={handlers}
      applicationOptions={applicationOptions}
      sidebarExtra={staffSelect}
      extraParams={extraParams}
    />
  );
}
