"use client";

import { useState, useTransition } from "react";

/**
 * A list you can rearrange by dragging or with arrows.
 *
 * Extracted from the document-tracker board so applications get the same two
 * ways of moving things rather than a second copy of them. The arrows are not
 * a lesser option next to dragging — they are the only way to do this from a
 * keyboard, and the only comfortable way to nudge one row past its neighbour.
 *
 * The new order is applied locally before it is written, because a drag that
 * waits for a round trip before showing anything feels broken. A failed write
 * puts the previous order back rather than leaving the screen quietly
 * disagreeing with the database.
 */
export function useReorderList<T>(
  items: T[],
  idOf: (item: T) => string,
  save: (orderedIds: string[]) => Promise<{ error?: string } | void>
) {
  const [order, setOrder] = useState(() => items.map(idOf));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(items.map((i) => [idOf(i), i]));
  // Anything created since this list was built still shows, at the end,
  // rather than disappearing until the next reload.
  const ordered = [
    ...order.map((id) => byId.get(id)).filter((i): i is T => i !== undefined),
    ...items.filter((i) => !order.includes(idOf(i))),
  ];
  const ids = ordered.map(idOf);

  function commit(next: string[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await save(next);
      if (result && "error" in result && result.error) {
        setOrder(previous);
        setError(result.error);
      }
    });
  }

  /** Swaps with the neighbour delta places away. */
  function move(id: string, delta: number) {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  /** Lifts the dragged row out and puts it where the target one was. */
  function dropOn(targetId: string) {
    if (!dragging || dragging === targetId) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const next = ids.filter((i) => i !== dragging);
    next.splice(ids.indexOf(targetId), 0, dragging);
    commit(next);
    setDragging(null);
    setDropTarget(null);
  }

  function endDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  /** Everything a row needs to be both a drag source and a drop target. */
  function rowProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragging) return;
        e.preventDefault();
        setDropTarget(id);
      },
      onDragLeave: () => setDropTarget((t) => (t === id ? null : t)),
      onDrop: () => dropOn(id),
      isDragging: dragging === id,
      isDropTarget: dropTarget === id && dragging !== id,
    };
  }

  return { ordered, ids, move, dropOn, rowProps, setDragging, endDrag, dragging, dropTarget, error, pending };
}
