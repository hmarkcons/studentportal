"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ChecklistHeading } from "./ChecklistHeading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  addSectionToDestination,
  createSection,
  reorderDestinationSections,
  includeSharedItem,
} from "@/lib/actions/documentChecklistBuilder";
import { SectionCard, type BuilderItem } from "./SectionCard";

export type PaletteEntry = { key: string; label: string; isPredefined: boolean; inUse: boolean };
export type BuilderSection = { key: string; label: string; items: BuilderItem[] };

// Native HTML5 drag and drop rather than a library: the CDN allowlist keeps
// this to what ships in the bundle, and a section list is exactly the case
// native DnD handles well. Every drag has an arrow-button equivalent beside
// it — dragging is unusable with a keyboard, awkward on a touchpad, and
// impossible on a phone, and this page is used from all three.
export function ChecklistBuilder({
  destinationId,
  destinationLabel,
  isAllDestinations,
  palette,
  sections,
  excludedItems,
}: {
  destinationId: string | null;
  destinationLabel: string;
  isAllDestinations: boolean;
  palette: PaletteEntry[];
  sections: BuilderSection[];
  excludedItems: { id: string; name: string; category: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Local order so a drag lands immediately instead of waiting on the server.
  const [order, setOrder] = useState<string[]>(sections.map((s) => s.key));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [newSection, setNewSection] = useState("");

  const ordered = order
    .map((key) => sections.find((s) => s.key === key))
    .filter((s): s is BuilderSection => Boolean(s));
  // A section added or removed on the server since this render.
  for (const s of sections) if (!order.includes(s.key)) ordered.push(s);

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  function addSection(key: string) {
    setOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
    run(() => addSectionToDestination(destinationId, key));
  }

  function commitOrder(keys: string[]) {
    setOrder(keys);
    run(() => reorderDestinationSections(destinationId, keys));
  }

  function moveSection(key: string, delta: number) {
    const keys = ordered.map((s) => s.key);
    const from = keys.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= keys.length) return;
    const next = [...keys];
    [next[from], next[to]] = [next[to], next[from]];
    commitOrder(next);
  }

  function dropOnSection(targetKey: string) {
    if (!dragging) return;
    const keys = ordered.map((s) => s.key);
    if (!keys.includes(dragging)) {
      // Dragged in from the palette, landing at that position.
      const next = [...keys];
      next.splice(keys.indexOf(targetKey), 0, dragging);
      setOrder(next);
      run(async () => {
        const added = await addSectionToDestination(destinationId, dragging);
        if (added && "error" in added && added.error) return added;
        return reorderDestinationSections(destinationId, next);
      });
    } else if (dragging !== targetKey) {
      const next = keys.filter((k) => k !== dragging);
      next.splice(next.indexOf(targetKey) === -1 ? next.length : keys.indexOf(targetKey), 0, dragging);
      commitOrder(next);
    }
    setDragging(null);
  }

  const available = palette.filter((p) => !ordered.some((s) => s.key === p.key));
  const anyShared = ordered.some((s) => s.items.some((i) => i.isShared));

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* The palette stays put while the list below scrolls, so a section can
          be dragged into a long checklist without losing sight of it. */}
      <Card className="sticky top-2 z-20">
        <div className="mb-2">
          <ChecklistHeading
            actions={<p className="text-xs text-muted">Drag one into the checklist, or press + to append it.</p>}
          >
            Sections you can add
          </ChecklistHeading>
        </div>

        {available.length === 0 ? (
          <p className="text-xs text-muted">
            Every section is already on this checklist. Create a new one below if you need another.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((p) => (
              <div
                key={p.key}
                draggable
                onDragStart={() => setDragging(p.key)}
                onDragEnd={() => setDragging(null)}
                className={`flex cursor-grab items-center gap-2 rounded-md border px-2 py-1 text-xs active:cursor-grabbing ${
                  dragging === p.key ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}
                title="Drag into the checklist below"
              >
                <span className="text-muted">⠿</span>
                <span className="text-ink">{p.label}</span>
                {!p.isPredefined && <span className="text-muted">(custom)</span>}
                <button
                  type="button"
                  onClick={() => addSection(p.key)}
                  disabled={pending}
                  className="font-medium text-primary hover:underline disabled:opacity-50"
                  aria-label={`Add ${p.label} to this checklist`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const label = newSection.trim();
            if (!label) return;
            const data = new FormData();
            data.set("label", label);
            setNewSection("");
            run(async () => createSection(undefined, data));
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            New section name
            <Input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="e.g. Embassy Legalisation"
              className="w-56"
            />
          </label>
          <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
            Create section
          </Button>
          <p className="pb-1 text-xs text-muted">
            Added to the palette above, for any destination &mdash; not to this checklist by itself.
          </p>
        </form>
      </Card>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <ChecklistHeading meta={`${ordered.length} section${ordered.length === 1 ? "" : "s"}`}>
            {destinationLabel}
          </ChecklistHeading>
          {!isAllDestinations && anyShared && (
            <p className="pl-3 text-xs text-muted">
              Rows marked <span className="text-ink">shared</span> come from the All destinations list. Editing or
              reordering one changes it for every country; &ldquo;Don&rsquo;t ask&rdquo; drops it from this one only.
            </p>
          )}
        </div>

        {ordered.length === 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={() => {
              setDropActive(false);
              if (dragging) addSection(dragging);
              setDragging(null);
            }}
            className={`rounded-lg border-2 border-dashed p-8 text-center text-sm ${
              dropActive ? "border-primary bg-primary/5 text-ink" : "border-border text-muted"
            }`}
          >
            This checklist is empty. Drag a section here to start it.
          </div>
        )}

        {ordered.map((section, index) => (
          <SectionCard
            key={section.key}
            destinationId={destinationId}
            isAllDestinations={isAllDestinations}
            section={section}
            isFirst={index === 0}
            isLast={index === ordered.length - 1}
            pending={pending}
            onMove={(delta) => moveSection(section.key, delta)}
            onDragStart={() => setDragging(section.key)}
            onDragEnd={() => setDragging(null)}
            onDropOn={() => dropOnSection(section.key)}
            isDragging={dragging === section.key}
            onError={setError}
          />
        ))}
      </div>

      {excludedItems.length > 0 && (
        <Card>
          <div className="mb-1">
            <ChecklistHeading>Dropped from this destination</ChecklistHeading>
          </div>
          <p className="mb-3 text-xs text-muted">
            Shared requirements {destinationLabel} does not ask for. They are still asked for everywhere else.
          </p>
          <div className="flex flex-col gap-2">
            {excludedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted line-through">{item.name}</span>
                <button
                  type="button"
                  disabled={pending || !destinationId}
                  onClick={() => destinationId && run(() => includeSharedItem(destinationId, item.id))}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Ask for it again
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
