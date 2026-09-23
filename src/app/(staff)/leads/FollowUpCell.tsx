"use client";

import { useState, useTransition } from "react";
import { addLeadFollowUpRemark, listLeadFollowUpRemarks } from "@/lib/actions/leads";
import { formatDateOnly } from "@/lib/formatDate";
import { Input } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import type { ActionResultLike } from "@/lib/actionStatus";

type Remark = { id: string; due_date: string; due_time: string | null; note: string | null; resolved: boolean };

export function FollowUpCell({ leadId, remarkCount, revalidateTo }: { leadId: string; remarkCount: number; revalidateTo: string }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // One object per saved remark. There is no form around these fields to
  // clear it on edit, so picking the next date clears it instead.
  const [done, setDone] = useState<ActionResultLike>(undefined);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [remarks, setRemarks] = useState<Remark[] | null>(null);

  async function openView() {
    if (viewOpen) {
      setViewOpen(false);
      return;
    }
    setViewOpen(true);
    setViewLoading(true);
    const result = await listLeadFollowUpRemarks(leadId);
    setRemarks(result.remarks as Remark[]);
    setViewLoading(false);
  }

  function submit() {
    if (!note.trim() || pending) return;
    setError(null);
    setDone(undefined);
    startTransition(async () => {
      const result = await addLeadFollowUpRemark(leadId, revalidateTo, date, time || null, note);
      if (result?.error) {
        setError(result.error);
      } else {
        setDate("");
        setTime("");
        setNote("");
        setDone({ success: true });
        if (viewOpen) {
          const refreshed = await listLeadFollowUpRemarks(leadId);
          setRemarks(refreshed.remarks as Remark[]);
        }
      }
    });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1">
      <button type="button" onClick={openView} className="self-start text-xs text-primary hover:underline">
        View{remarkCount > 0 ? ` (${remarkCount})` : ""}
      </button>

      {/* The remark's fields fold away once it is saved, leaving only the
          date, so the confirmation sits beside that. */}
      <span className="inline-flex items-center gap-1">
        <Input
          type="date"
          value={date}
          disabled={pending}
          onChange={(e) => {
            setDate(e.target.value);
            setDone(undefined);
          }}
          className="w-36 text-xs"
        />
        <ActionStatus state={done} pending={pending} label="Added." />
      </span>
      {date && (
        <>
          <Input
            type="time"
            value={time}
            disabled={pending}
            onChange={(e) => setTime(e.target.value)}
            className="w-36 text-xs"
          />
          <Input
            type="text"
            placeholder="Remark, then Enter"
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="w-36 text-xs"
          />
        </>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}

      {viewOpen && (
        <div className="flex w-56 flex-col gap-1.5 rounded-md border border-border bg-card p-2 text-xs">
          {viewLoading && <span className="text-muted">Loading…</span>}
          {!viewLoading && remarks?.length === 0 && <span className="text-muted">No remarks yet.</span>}
          {!viewLoading &&
            remarks?.map((r) => (
              <div key={r.id} className={r.resolved ? "text-muted line-through" : "text-ink"}>
                {formatDateOnly(r.due_date)}
                {r.due_time ? ` ${r.due_time.slice(0, 5)}` : ""} — {r.note}
              </div>
            ))}
          <button type="button" onClick={() => setViewOpen(false)} className="self-start text-muted hover:underline">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
