"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { LongTextCell } from "@/components/ui/LongTextCell";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { InlineStatusCell } from "./InlineStatusCell";
import { InlineCounselorCell } from "./InlineCounselorCell";
import { FollowUpCell } from "./FollowUpCell";
import { RemarkCell } from "./RemarkCell";

/** One lead as the list shows it: plain values, worked out by the server. */
export type LeadListRow = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  qualification: string | null;
  /** "Bachelors", "Masters", "PhD", or whatever is on file. */
  level: string | null;
  course: string | null;
  source: string | null;
  status: string;
  /** "Oct 2026", from the inquiry date. */
  month: string;
  /** The inquiry date as the list shows it. */
  date: string;
  counselorId: string | null;
  counselorName: string | null;
  remark: string | null;
  remarkAt: string | null;
  remarkBy: string | null;
  /** The newest call-log remark, for the status button's tooltip. */
  lastCallRemark: string | null;
  followUps: number;
};

/**
 * The leads list's rows, made in the browser from plain values.
 *
 * The server used to make every cell of every row and send them as rendered
 * components — a thousand rows came to six megabytes of page — and the browser
 * then set up all thirteen thousand controls before the list would answer.
 * Now the server sends the values (a few hundred bytes a lead) and the table
 * draws the rows in view, a screenful either side, as it scrolls
 * (DataTable's virtualRowHeight).
 *
 * A row that scrolls out of view is taken off the page, and a cell's memory
 * of what it saved with it. So what is saved here is kept here, over the
 * values the server sent, until the server sends the list again.
 */
export function LeadsTable({
  leads,
  counselors,
  canDelete,
  ...table
}: Omit<React.ComponentProps<typeof DataTable>, "rows"> & {
  leads: LeadListRow[];
  counselors: { id: string; full_name: string }[];
  canDelete: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, Partial<LeadListRow>>>({});
  // A fresh list from the server already holds what was saved.
  const [prevLeads, setPrevLeads] = useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    setEdits({});
  }

  const rows = useMemo(() => {
    const edit = (id: string, change: Partial<LeadListRow> | ((r: LeadListRow) => Partial<LeadListRow>)) =>
      setEdits((all) => {
        const base = { ...leads.find((l) => l.id === id)!, ...all[id] };
        return { ...all, [id]: { ...all[id], ...(typeof change === "function" ? change(base) : change) } };
      });
    return leads.map((lead) => {
      const r = edits[lead.id] ? { ...lead, ...edits[lead.id] } : lead;
      // A long value is cut short on its line, whole on hover and in a pop-up.
      const long = (text: string | null, label: string, widthClassName?: string) => (
        <LongTextCell text={text} label={label} rowName={r.name} widthClassName={widthClassName} />
      );
      return {
        id: r.id,
        cells: {
          month: r.month,
          name: <LongTextCell text={r.name} label="Name" rowName={r.name} href={`/leads/${r.id}`} widthClassName="max-w-[16rem]" />,
          contact: long(r.contact, "Contact number", "max-w-[10rem]"),
          email: long(r.email, "Email", "max-w-[14rem]"),
          // Narrow: a city is a word or two, and a longer one shows whole on hover.
          city: long(r.city, "City", "max-w-[6rem]"),
          country: long(r.country, "Country"),
          qualification: long(r.qualification, "Current qualification"),
          level: r.level ?? "—",
          course: long(r.course, "Course of interest", "max-w-[14rem]"),
          status: (
            <InlineStatusCell
              leadId={r.id}
              currentStatus={r.status}
              latestRemark={r.lastCallRemark}
              onSaved={(status, remark) => edit(r.id, (now) => ({ status, lastCallRemark: remark ?? now.lastCallRemark }))}
            />
          ),
          counselor: (
            <InlineCounselorCell
              leadId={r.id}
              currentCounselorId={r.counselorId}
              currentCounselorName={r.counselorName}
              counselors={counselors}
              onSaved={(id) => edit(r.id, { counselorId: id, counselorName: counselors.find((c) => c.id === id)?.full_name ?? null })}
            />
          ),
          remarks: (
            <RemarkCell
              leadId={r.id}
              leadName={r.name}
              remark={r.remark}
              updatedAt={r.remarkAt}
              updatedBy={r.remarkBy}
              onSaved={(remark, at, by) => edit(r.id, { remark, remarkAt: at, remarkBy: by })}
            />
          ),
          followUp: <FollowUpCell leadId={r.id} remarkCount={r.followUps} onAdded={() => edit(r.id, (now) => ({ followUps: now.followUps + 1 }))} />,
          date: r.date,
          source: long(r.source, "Source", "max-w-[10rem]"),
          actions: <RowActionsMenu id={r.id} name={r.name} editHref={`/leads/${r.id}`} canDelete={canDelete} deleteLabel="Delete lead" />,
        },
      };
    });
  }, [leads, edits, counselors, canDelete]);

  return <DataTable {...table} rows={rows} />;
}
