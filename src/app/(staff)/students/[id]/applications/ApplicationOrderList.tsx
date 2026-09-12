"use client";

import { useState } from "react";
import { reorderApplications } from "@/lib/actions/applications";
import { useReorderList } from "@/components/useReorderList";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";

export type OrderableApplication = {
  id: string;
  universityName: string;
  programName: string | null;
  stage: string;
  /** The whole rendered card, built on the server. */
  card: React.ReactNode;
};

function Handle({ onDragStart, onDragEnd, label }: { onDragStart: () => void; onDragEnd: () => void; label: string }) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="cursor-grab select-none px-1 text-muted active:cursor-grabbing"
      title={`Drag to move ${label}`}
      aria-hidden
    >
      ⠿
    </span>
  );
}

function Arrows({
  onUp,
  onDown,
  disableUp,
  disableDown,
  label,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  label: string;
}) {
  return (
    <>
      {/* Not a lesser option than dragging: the only way to do this from a
          keyboard, and the comfortable way to nudge one row past its
          neighbour. */}
      <button
        type="button"
        onClick={onUp}
        disabled={disableUp}
        className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
        aria-label={`Move ${label} up`}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disableDown}
        className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
        aria-label={`Move ${label} down`}
      >
        ▼
      </button>
    </>
  );
}

/**
 * The applications for one destination, in the order the office chooses.
 *
 * Two ways in, because they suit different moves. Dragging a card in the list
 * is right for nudging one place; the dialog strips the cards down to one line
 * each, which is the only way to move something from the bottom of a long list
 * to the top without scrolling a drag across the page.
 */
export function ApplicationOrderList({
  studentId,
  applications,
  canEdit,
}: {
  studentId: string;
  applications: OrderableApplication[];
  canEdit: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // One ordering shared by both views. Two hook instances would each hold
  // their own copy of the order, so a move made in the dialog would not show
  // in the list behind it until a reload — and the two would then disagree
  // about what had just been saved.
  const list = useReorderList(applications, (a) => a.id, (ids) => reorderApplications(studentId, ids));

  if (!canEdit || applications.length < 2) {
    return <div className="flex flex-col gap-4">{applications.map((a) => <div key={a.id}>{a.card}</div>)}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Highest priority first — drag a card, use the arrows, or reorder them all at once.
        </p>
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          ↕ Reorder applications
        </Button>
      </div>

      {list.error && <p className="text-xs text-danger">{list.error}</p>}

      {list.ordered.map((a, index) => {
        const row = list.rowProps(a.id);
        return (
          <div
            key={a.id}
            onDragOver={row.onDragOver}
            onDragLeave={row.onDragLeave}
            onDrop={row.onDrop}
            className={`rounded-xl ${row.isDropTarget ? "ring-2 ring-primary" : ""} ${row.isDragging ? "opacity-60" : ""}`}
          >
            <div className="mb-1 flex items-center gap-1 px-1">
              <Handle onDragStart={() => list.setDragging(a.id)} onDragEnd={list.endDrag} label={a.universityName} />
              <Arrows
                onUp={() => list.move(a.id, -1)}
                onDown={() => list.move(a.id, 1)}
                disableUp={index === 0 || list.pending}
                disableDown={index === list.ordered.length - 1 || list.pending}
                label={a.universityName}
              />
              <span className="text-[11px] text-muted">Priority {index + 1}</span>
            </div>
            {a.card}
          </div>
        );
      })}

      <SlideOver open={dialogOpen} onClose={() => setDialogOpen(false)} title="Reorder applications">
        <p className="mb-3 text-xs text-muted">
          The order this student&apos;s universities are pushed for. Drag a row, or use the arrows.
        </p>
        {list.error && <p className="mb-2 text-xs text-danger">{list.error}</p>}
        <ol className="flex flex-col gap-1">
          {list.ordered.map((a, index) => {
            const row = list.rowProps(a.id);
            return (
              <li
                key={a.id}
                onDragOver={row.onDragOver}
                onDragLeave={row.onDragLeave}
                onDrop={row.onDrop}
                className={`flex items-center gap-2 rounded-md border px-2 py-2 text-sm ${
                  row.isDropTarget ? "border-primary ring-2 ring-primary" : "border-border"
                } ${row.isDragging ? "opacity-60" : ""}`}
              >
                <Handle onDragStart={() => list.setDragging(a.id)} onDragEnd={list.endDrag} label={a.universityName} />
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-ink">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{a.universityName}</span>
                  {/* The programme, because the office prioritises a
                      university-and-programme pair, not a university. */}
                  <span className="block truncate text-xs text-muted">
                    {a.programName ?? "No programme chosen"} · {a.stage.replace(/_/g, " ")}
                  </span>
                </span>
                <Arrows
                  onUp={() => list.move(a.id, -1)}
                  onDown={() => list.move(a.id, 1)}
                  disableUp={index === 0 || list.pending}
                  disableDown={index === list.ordered.length - 1 || list.pending}
                  label={a.universityName}
                />
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">
          {/* Each move is written as it is made, so there is nothing to save
              and nothing to lose by closing this. */}
          Saved as you go. Close when you are done.
        </p>
        <div className="mt-3">
          <Button type="button" variant="primary" onClick={() => setDialogOpen(false)}>
            Done
          </Button>
        </div>
      </SlideOver>
    </div>
  );
}
