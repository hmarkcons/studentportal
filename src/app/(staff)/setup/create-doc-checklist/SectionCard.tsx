"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ChecklistHeading } from "./ChecklistHeading";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  addChecklistItem,
  deleteChecklistItem,
  excludeSharedItem,
  removeSectionFromDestination,
  renameSection,
  reorderChecklistItems,
  updateChecklistItem,
} from "@/lib/actions/documentChecklistBuilder";
import { STUDY_LEVELS } from "@/lib/constants";

export type BuilderItem = {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  level: string;
  isShared: boolean;
};

type Section = { key: string; label: string; items: BuilderItem[] };

export function SectionCard({
  destinationId,
  isAllDestinations,
  section,
  isFirst,
  isLast,
  pending: parentPending,
  onMove,
  onDragStart,
  onDragEnd,
  onDropOn,
  isDragging,
  onError,
}: {
  destinationId: string | null;
  isAllDestinations: boolean;
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (delta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  isDragging: boolean;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState<string[]>(section.items.map((i) => i.id));
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(section.label);
  const [adding, setAdding] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const busy = pending || parentPending;

  const items = order
    .map((id) => section.items.find((i) => i.id === id))
    .filter((i): i is BuilderItem => Boolean(i));
  for (const i of section.items) if (!order.includes(i.id)) items.push(i);

  function run(fn: () => Promise<{ error?: string } | void>) {
    onError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) onError(result.error);
    });
  }

  function commitItemOrder(ids: string[]) {
    setOrder(ids);
    run(() => reorderChecklistItems(ids));
  }

  function moveItem(id: string, delta: number) {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    commitItemOrder(next);
  }

  function dropItemOn(targetId: string) {
    if (!draggingItem || draggingItem === targetId) return setDraggingItem(null);
    const ids = items.map((i) => i.id);
    const next = ids.filter((x) => x !== draggingItem);
    next.splice(ids.indexOf(targetId), 0, draggingItem);
    commitItemOrder(next);
    setDraggingItem(null);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={() => {
        setDropOver(false);
        onDropOn();
      }}
    >
      <Card
        className={`overflow-hidden !p-0 transition ${isDragging ? "opacity-60" : ""} ${
          dropOver ? "border-primary ring-2 ring-primary" : ""
        }`}
      >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab select-none text-muted active:cursor-grabbing"
            title="Drag to reorder this section"
          >
            ⠿
          </span>

          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData();
                data.set("label", label);
                setRenaming(false);
                run(async () => renameSection(section.key, undefined, data));
              }}
            >
              <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-56" autoFocus />
              <Button type="submit" variant="primary" size="sm" pending={busy}>
                Save
              </Button>
              <button
                type="button"
                onClick={() => {
                  setLabel(section.label);
                  setRenaming(false);
                }}
                className="text-xs text-muted hover:underline"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <ChecklistHeading
                level="card"
                meta={`${items.length} requirement${items.length === 1 ? "" : "s"}`}
              >
                {section.label}
              </ChecklistHeading>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst || busy}
            className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            aria-label={`Move ${section.label} up`}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast || busy}
            className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            aria-label={`Move ${section.label} down`}
          >
            ▼
          </button>
          {!renaming && (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="ml-2 text-xs text-primary hover:underline"
            >
              Rename
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const ownCount = items.filter((i) => !i.isShared).length;
              const warning = ownCount
                ? `Remove "${section.label}" from this checklist? Its ${ownCount} own requirement(s) will be deleted. Anything a student has already uploaded is kept.`
                : `Remove "${section.label}" from this checklist?`;
              if (!confirm(warning)) return;
              run(() => removeSectionFromDestination(destinationId, section.key));
            }}
            className="ml-2 text-xs text-danger hover:underline disabled:opacity-50"
          >
            Remove section
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
      <div className="flex flex-col divide-y divide-border">
        {items.length === 0 && <p className="pb-2 text-xs text-muted">Nothing here yet.</p>}

        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!editing}
            onDragStart={() => setDraggingItem(item.id)}
            onDragEnd={() => setDraggingItem(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.stopPropagation();
              dropItemOn(item.id);
            }}
            className={`flex flex-wrap items-start gap-2 py-2 ${draggingItem === item.id ? "opacity-50" : ""}`}
          >
            <span className="cursor-grab select-none pt-0.5 text-muted active:cursor-grabbing" title="Drag to reorder">
              ⠿
            </span>

            {editing === item.id ? (
              <form
                className="flex flex-1 flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  setEditing(null);
                  run(async () => updateChecklistItem(item.id, undefined, data));
                }}
              >
                <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
                  Requirement
                  <Input name="name" defaultValue={item.name} required autoFocus />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Applies to
                  <Select name="level" defaultValue={item.level} className="w-32">
                    <option value="all">All levels</option>
                    {STUDY_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex items-center gap-1 pb-2 text-xs text-muted">
                  <input type="checkbox" name="required" defaultChecked={item.required} /> Required
                </label>
                <Button type="submit" variant="primary" size="sm" pending={busy}>
                  Save
                </Button>
                <button type="button" onClick={() => setEditing(null)} className="pb-2 text-xs text-muted hover:underline">
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm text-ink">
                    {item.name}
                    {!item.required && <span className="ml-2 text-xs text-muted">optional</span>}
                    {item.level !== "all" && <span className="ml-2 text-xs text-muted">{item.level} only</span>}
                    {item.isShared && <span className="ml-2 text-xs text-muted">shared</span>}
                  </p>
                  {item.description && <p className="text-xs text-muted">{item.description}</p>}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={index === 0 || busy}
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                    aria-label={`Move ${item.name} up`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={index === items.length - 1 || busy}
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                    aria-label={`Move ${item.name} down`}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(item.id)}
                    disabled={busy}
                    className="ml-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    Edit
                  </button>
                  {item.isShared && destinationId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => excludeSharedItem(destinationId, item.id))}
                      className="ml-1 text-xs text-danger hover:underline disabled:opacity-50"
                      title="Stop asking for this on this destination only"
                    >
                      Don&rsquo;t ask
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const where = isAllDestinations ? "every destination" : "this destination";
                        if (!confirm(`Delete "${item.name}" from ${where}? Students who have already uploaded it keep their file.`)) return;
                        run(() => deleteChecklistItem(item.id));
                      }}
                      className="ml-1 text-xs text-danger hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setAdding(false);
            run(async () => addChecklistItem(destinationId, section.key, undefined, data));
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Requirement
            <Input name="name" placeholder="e.g. Police clearance certificate" required autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Applies to
            <Select name="level" defaultValue="all" className="w-32">
              <option value="all">All levels</option>
              {STUDY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-muted">
            <input type="checkbox" name="required" defaultChecked /> Required
          </label>
          <Button type="submit" variant="primary" size="sm" pending={busy}>
            Add
          </Button>
          <button type="button" onClick={() => setAdding(false)} className="pb-2 text-xs text-muted hover:underline">
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          + Add requirement
        </button>
      )}
      </div>
      </Card>
    </div>
  );
}
