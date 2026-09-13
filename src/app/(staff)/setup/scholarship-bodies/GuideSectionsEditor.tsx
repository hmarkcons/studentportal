"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type GuideSection = { title: string; body: string };

/**
 * A body's guide, as an editable list of titled sections.
 *
 * Not a fixed set of fields, because the guides are not the same shape: DSU
 * Toscana's has ten sections and ER.GO's has nine, under different headings,
 * and a region that changes its process next year will not ask first. So the
 * headings are data — renameable, reorderable, removable — and a new section
 * can be added without a migration.
 *
 * Posted as one hidden JSON field so the whole list arrives at the server
 * intact; repeated inputs would let a reordering race split a title from its
 * body.
 */
export function GuideSectionsEditor({ name, initial }: { name: string; initial: GuideSection[] }) {
  const [sections, setSections] = useState<GuideSection[]>(initial.length > 0 ? initial : []);

  function update(index: number, patch: Partial<GuideSection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Empty sections are dropped here rather than refused at the database,
          which only knows how to reject the whole save. */}
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(sections.filter((s) => s.title.trim() && s.body.trim()))}
      />

      {sections.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
          No guide yet. Add the sections from this body&rsquo;s call — deadlines, the apply portal, which documents to
          prepare.
        </p>
      )}

      {sections.map((section, index) => (
        <div key={index} className="rounded-md border border-border p-2">
          <div className="mb-1 flex items-center gap-1">
            <span className="text-[11px] text-muted">{index + 1}</span>
            <Input
              value={section.title}
              onChange={(e) => update(index, { title: e.target.value })}
              placeholder="Section heading — e.g. Important dates"
              maxLength={120}
              className="flex-1 font-medium"
            />
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move ${section.title || "section"} up`}
              className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === sections.length - 1}
              aria-label={`Move ${section.title || "section"} down`}
              className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => {
                if (section.body.trim() && !confirm(`Remove "${section.title || "this section"}"?`)) return;
                setSections((prev) => prev.filter((_, i) => i !== index));
              }}
              aria-label={`Remove ${section.title || "section"}`}
              className="rounded px-1 text-xs text-danger hover:underline"
            >
              ✕
            </button>
          </div>
          <Textarea
            value={section.body}
            onChange={(e) => update(index, { body: e.target.value })}
            rows={Math.min(14, Math.max(3, section.body.split("\n").length + 1))}
            placeholder="What this section says. One point per line."
          />
        </div>
      ))}

      <div>
        <Button type="button" size="sm" onClick={() => setSections((prev) => [...prev, { title: "", body: "" }])}>
          + Add section
        </Button>
      </div>
    </div>
  );
}
