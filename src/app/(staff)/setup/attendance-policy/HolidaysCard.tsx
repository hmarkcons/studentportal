"use client";

import { useActionState } from "react";
import { addOfficeHoliday, deleteOfficeHoliday } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useButtonAction } from "@/components/useButtonAction";

const when = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function HolidayRow({ date, name, canEdit }: { date: string; name: string; canEdit: boolean }) {
  const del = useButtonAction();
  return (
    <li data-holiday={date} className="flex items-center justify-between gap-2 py-2 text-sm">
      <span className="text-ink">
        {name} <span className="text-muted">· {when(date)}</span>
      </span>
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove ${name}`}
          pending={del.pending}
          status={{ state: del.state, label: "Removed.", showError: true }}
          onClick={() => void del.run(() => deleteOfficeHoliday(date), { toast: `${name} removed.` })}
        >
          🗑️
        </Button>
      )}
    </li>
  );
}

/**
 * Days nobody works. Payroll never counts one as an absence, leave taken over
 * one does not use anybody's allowance, and it is not one of the month's
 * scheduled working days that a day's pay is a share of.
 */
export function HolidaysCard({ holidays, canEdit }: { holidays: { holiday_date: string; name: string }[]; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(addOfficeHoliday, undefined);
  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Office holidays</h3>
      <p className="mt-1 text-xs text-muted">
        Public and office holidays. They are never counted as an absence on payroll, and leave that spans one doesn&apos;t use
        anyone&apos;s allowance for it.
      </p>
      {canEdit && (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
          <Input name="holiday_date" type="date" required />
          <Input name="name" placeholder="e.g. Eid ul-Fitr, Independence Day" required className="min-w-[220px] flex-1" />
          <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Added.", showError: true }}>
            Add holiday
          </Button>
        </form>
      )}
      {holidays.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No holidays added yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {holidays.map((h) => (
            <HolidayRow key={h.holiday_date} date={h.holiday_date} name={h.name} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}
