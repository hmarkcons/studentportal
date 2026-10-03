"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Columns3, GripVertical } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { resetLeadColumnOrder, saveLeadColumnOrder } from "@/lib/actions/leadColumns";

type Column = { key: string; header: string };

/**
 * A Super Admin's control for the order of the leads columns (0313): drag a
 * column, or move it up and down, and save — for everyone, and for the leads
 * Excel template and export, which follow the list.
 */
export function ArrangeLeadColumns({ columns }: { columns: Column[] }) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(columns);
  const [dragging, setDragging] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return;
    setOrder((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function run(fn: () => Promise<{ success: true } | { error: string }>, done: string) {
    setError(null);
    startSaving(async () => {
      const result = await fn();
      if ("error" in result) setError(result.error);
      else {
        setOpen(false);
        toast(done);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setOrder(columns);
          setError(null);
          setOpen(true);
        }}
        data-arrange-columns
      >
        <Columns3 aria-hidden className="h-4 w-4" />
        Arrange columns
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Arrange the leads columns">
        <div className="flex flex-col gap-3" data-arrange-dialog>
          <p className="text-xs text-muted">
            Drag a column, or move it up or down. The order is the same for everyone, and the Excel template and export follow it.
          </p>
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {order.map((c, i) => (
              <li
                key={c.key}
                draggable
                onDragStart={() => setDragging(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging !== null) move(dragging, i);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm ${dragging === i ? "bg-primary/10" : "bg-card"}`}
                data-arrange-item={c.key}
              >
                <GripVertical aria-hidden className="h-4 w-4 shrink-0 cursor-grab text-muted" />
                <span className="w-6 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                <span className="flex-1 text-ink">{c.header}</span>
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className="rounded p-1 text-muted hover:bg-bg hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${c.header} up`}
                >
                  <ArrowUp aria-hidden className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === order.length - 1}
                  className="rounded p-1 text-muted hover:bg-bg hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${c.header} down`}
                >
                  <ArrowDown aria-hidden className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" pending={saving} onClick={() => run(() => saveLeadColumnOrder(order.map((c) => c.key)), "Column order saved.")}>
              Save order
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => run(resetLeadColumnOrder, "Columns back in their default order.")}>
              Reset to default
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
