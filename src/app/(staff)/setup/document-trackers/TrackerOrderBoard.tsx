"use client";

import { useState, useTransition } from "react";
import { reorderTrackerCountries, reorderTrackerFields } from "@/lib/actions/countryTracker";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";

export type TrackerCountry = {
  code: string;
  name: string;
  fieldCount: number;
  hasFinalizedUniversity: boolean;
  /** One entry per field, in the order they are shown. */
  fields: { id: string; label: string; content: React.ReactNode }[];
  /** The "add a field" form, which stays at the bottom of an open card. */
  addForm: React.ReactNode;
};

/**
 * Setup > Document trackers, rearrangeable.
 *
 * Two lists, the same two ways of moving things: the trackers themselves, and
 * the fields inside each one. Dragging for a big move, arrows for a precise
 * one — and the arrows are not a lesser option, they are the only way to do
 * this from a keyboard.
 *
 * Order is applied locally first and then written, because a drag that waits
 * for a round trip before showing anything feels broken. A failed write puts
 * the previous order back rather than leaving the screen disagreeing with the
 * database.
 */
export function TrackerOrderBoard({ countries, canEdit }: { countries: TrackerCountry[]; canEdit: boolean }) {
  const [order, setOrder] = useState(() => countries.map((c) => c.code));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byCode = new Map(countries.map((c) => [c.code, c]));
  // Anything created since this list was built still shows, at the end.
  const ordered = [
    ...order.map((code) => byCode.get(code)).filter((c): c is TrackerCountry => Boolean(c)),
    ...countries.filter((c) => !order.includes(c.code)),
  ];

  function commit(next: string[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderTrackerCountries(next);
      if (result?.error) {
        setOrder(previous);
        setError(result.error);
      }
    });
  }

  function move(code: string, delta: number) {
    const codes = ordered.map((c) => c.code);
    const from = codes.indexOf(code);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= codes.length) return;
    const next = [...codes];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  function dropOn(targetCode: string) {
    if (!dragging || dragging === targetCode) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const codes = ordered.map((c) => c.code);
    const next = codes.filter((c) => c !== dragging);
    next.splice(codes.indexOf(targetCode), 0, dragging);
    commit(next);
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-danger">{error}</p>}
      {ordered.map((country, index) => (
        <div
          key={country.code}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDropTarget(country.code);
          }}
          onDragLeave={() => setDropTarget((t) => (t === country.code ? null : t))}
          onDrop={() => dropOn(country.code)}
          className={dropTarget === country.code && dragging !== country.code ? "rounded-lg ring-2 ring-primary" : ""}
        >
          <CollapsibleCard
            id={`tracker-${country.code}`}
            title={country.name}
            subtitle={country.code}
            className={dragging === country.code ? "opacity-60" : ""}
            badge={
              <span className="flex flex-wrap items-center gap-2">
                {/* A tracker with no field recording the finalised university
                    cannot do the one thing every tracker has to, so it is
                    worth seeing without opening the card. */}
                {!country.hasFinalizedUniversity && <Badge tone="danger">No finalised-university field</Badge>}
                <Badge tone={country.fieldCount === 0 ? "warning" : "neutral"}>
                  {country.fieldCount} {country.fieldCount === 1 ? "field" : "fields"}
                </Badge>
              </span>
            }
            actions={
              canEdit ? (
                <span className="flex items-center gap-1">
                  <span
                    draggable
                    onDragStart={() => setDragging(country.code)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    className="cursor-grab select-none px-1 text-muted active:cursor-grabbing"
                    title={`Drag to move ${country.name}`}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    onClick={() => move(country.code, -1)}
                    disabled={index === 0 || pending}
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                    aria-label={`Move ${country.name} up`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(country.code, 1)}
                    disabled={index === ordered.length - 1 || pending}
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                    aria-label={`Move ${country.name} down`}
                  >
                    ▼
                  </button>
                </span>
              ) : null
            }
          >
            <FieldList countryCode={country.code} fields={country.fields} canEdit={canEdit} />
            {country.addForm}
          </CollapsibleCard>
        </div>
      ))}
    </div>
  );
}

/** The fields inside one tracker, in the order they appear to staff and students. */
function FieldList({
  countryCode,
  fields,
  canEdit,
}: {
  countryCode: string;
  fields: { id: string; label: string; content: React.ReactNode }[];
  canEdit: boolean;
}) {
  const [order, setOrder] = useState(() => fields.map((f) => f.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(fields.map((f) => [f.id, f]));
  const ordered = [
    ...order.map((id) => byId.get(id)).filter((f): f is (typeof fields)[number] => Boolean(f)),
    ...fields.filter((f) => !order.includes(f.id)),
  ];

  function commit(next: string[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderTrackerFields(countryCode, next);
      if (result?.error) {
        setOrder(previous);
        setError(result.error);
      }
    });
  }

  function move(id: string, delta: number) {
    const ids = ordered.map((f) => f.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  function dropOn(targetId: string) {
    if (!dragging || dragging === targetId) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const ids = ordered.map((f) => f.id);
    const next = ids.filter((i) => i !== dragging);
    next.splice(ids.indexOf(targetId), 0, dragging);
    commit(next);
    setDragging(null);
    setDropTarget(null);
  }

  if (fields.length === 0) return <p className="py-2 text-sm text-muted">No fields yet.</p>;

  return (
    <div className="flex flex-col">
      {error && <p className="py-1 text-xs text-danger">{error}</p>}
      {ordered.map((field, index) => (
        <div
          key={field.id}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDropTarget(field.id);
          }}
          onDragLeave={() => setDropTarget((t) => (t === field.id ? null : t))}
          onDrop={() => dropOn(field.id)}
          className={`flex items-start gap-2 ${dragging === field.id ? "opacity-60" : ""} ${
            dropTarget === field.id && dragging !== field.id ? "rounded-md ring-2 ring-primary" : ""
          }`}
        >
          {canEdit && (
            <span className="flex shrink-0 items-center gap-1 pt-3">
              {/* The handle, not the whole row: a row holds text inputs, and
                  dragging to select text in one must not pick the row up. */}
              <span
                draggable
                onDragStart={() => setDragging(field.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                className="cursor-grab select-none text-muted active:cursor-grabbing"
                title={`Drag to move ${field.label}`}
              >
                ⠿
              </span>
              <span className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(field.id, -1)}
                  disabled={index === 0 || pending}
                  className="rounded border border-border px-1 text-[10px] leading-tight text-muted hover:text-ink disabled:opacity-40"
                  aria-label={`Move ${field.label} up`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(field.id, 1)}
                  disabled={index === ordered.length - 1 || pending}
                  className="rounded border border-border px-1 text-[10px] leading-tight text-muted hover:text-ink disabled:opacity-40"
                  aria-label={`Move ${field.label} down`}
                >
                  ▼
                </button>
              </span>
            </span>
          )}
          <div className="min-w-0 flex-1">{field.content}</div>
        </div>
      ))}
    </div>
  );
}
