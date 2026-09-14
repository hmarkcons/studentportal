"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useFormAction } from "@/components/useFormAction";
import { saveTravelGuide } from "@/lib/actions/travelGuide";
import { ActionStatus } from "@/components/ActionStatus";

export type EditorItem = { id?: string; label: string; detail: string; daysAfterArrival: string; tickedBy?: number };
export type EditorSection = { id?: string; title: string; intro: string; items: EditorItem[] };

const blankItem = (): EditorItem => ({ label: "", detail: "", daysAfterArrival: "" });

/**
 * One destination's travel & arrival guide.
 *
 * Sections and steps carry their database ids through the form, because a
 * student's ticks hang off the step: the office will re-word these as it learns
 * what actually happens at the questura, and that must not un-tick everybody.
 * Removing a step does discard its ticks, so the count of students who have
 * already ticked it is shown on the remove button rather than found out
 * afterwards.
 */
export function TravelGuideEditor({
  destinationId,
  destinationLabel,
  initial,
  canEdit,
}: {
  destinationId: string;
  destinationLabel: string;
  initial: EditorSection[];
  canEdit: boolean;
}) {
  const [sections, setSections] = useState<EditorSection[]>(initial);
  const { onSubmit, pending, error, result } = useFormAction(saveTravelGuide);

  function patchSection(index: number, patch: Partial<EditorSection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function moveSection(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function patchItem(si: number, ii: number, patch: Partial<EditorItem>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : s
      )
    );
  }

  function moveItem(si: number, ii: number, delta: number) {
    const to = ii + delta;
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== si || to < 0 || to >= s.items.length) return s;
        const items = [...s.items];
        [items[ii], items[to]] = [items[to], items[ii]];
        return { ...s, items };
      })
    );
  }

  function removeItem(si: number, ii: number) {
    const item = sections[si].items[ii];
    if (item.tickedBy && !confirm(`${item.tickedBy} student(s) have ticked “${item.label}”. Removing it discards those ticks. Remove it?`)) {
      return;
    }
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s)));
  }

  function removeSection(si: number) {
    const section = sections[si];
    const ticked = section.items.reduce((sum, i) => sum + (i.tickedBy ?? 0), 0);
    if (ticked && !confirm(`“${section.title}” has ${ticked} tick(s) from students. Removing it discards them. Remove it?`)) {
      return;
    }
    setSections((prev) => prev.filter((_, i) => i !== si));
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="destination_id" value={destinationId} />
      <input
        type="hidden"
        name="sections"
        value={JSON.stringify(
          sections.map((s) => ({
            id: s.id,
            title: s.title,
            intro: s.intro,
            items: s.items.map((i) => ({
              id: i.id,
              label: i.label,
              detail: i.detail,
              daysAfterArrival: i.daysAfterArrival,
            })),
          }))
        )}
      />

      {sections.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted">
          No guide for {destinationLabel} yet. Add a section — what to carry in hand luggage, what to do before flying,
          what has a deadline after landing.
        </p>
      )}

      {sections.map((section, si) => (
        <div key={section.id ?? `new-${si}`} className="rounded-lg border border-border">
          <div className="flex items-center gap-1 border-b border-border bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-2 py-2">
            <span className="w-5 text-center text-[11px] text-muted">{si + 1}</span>
            <Input
              value={section.title}
              onChange={(e) => patchSection(si, { title: e.target.value })}
              placeholder="Section heading — e.g. Carry in your hand luggage"
              maxLength={160}
              disabled={!canEdit}
              className="flex-1 font-medium"
            />
            <button
              type="button"
              onClick={() => moveSection(si, -1)}
              disabled={si === 0 || !canEdit}
              aria-label={`Move ${section.title || "section"} up`}
              className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveSection(si, 1)}
              disabled={si === sections.length - 1 || !canEdit}
              aria-label={`Move ${section.title || "section"} down`}
              className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => removeSection(si)}
              disabled={!canEdit}
              aria-label={`Remove ${section.title || "section"}`}
              className="rounded border border-border px-1.5 text-xs text-danger hover:bg-danger-bg disabled:opacity-40"
            >
              ✕
            </button>
          </div>

          <div className="px-2 py-2">
            <Textarea
              value={section.intro}
              onChange={(e) => patchSection(si, { intro: e.target.value })}
              placeholder="Optional note under the heading — why this section matters"
              rows={2}
              maxLength={1000}
              disabled={!canEdit}
            />
          </div>

          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {section.items.map((item, ii) => (
              <li key={item.id ?? `new-${ii}`} className="flex flex-col gap-1 px-2 py-2 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Input
                    value={item.label}
                    onChange={(e) => patchItem(si, ii, { label: e.target.value })}
                    placeholder="What the student has to do or carry"
                    maxLength={300}
                    disabled={!canEdit}
                  />
                  <Input
                    value={item.detail}
                    onChange={(e) => patchItem(si, ii, { detail: e.target.value })}
                    placeholder="Optional detail — where, how, what to bring"
                    maxLength={1000}
                    disabled={!canEdit}
                    className="text-xs"
                  />
                </div>
                {/* Days rather than a date, because it is counted from the day
                    the student lands and no two students land on the same day. */}
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted sm:w-40 sm:flex-col sm:items-start">
                  Days after arrival
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={item.daysAfterArrival}
                    onChange={(e) => patchItem(si, ii, { daysAfterArrival: e.target.value })}
                    placeholder="none"
                    disabled={!canEdit}
                    className="w-20"
                  />
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(si, ii, -1)}
                    disabled={ii === 0 || !canEdit}
                    aria-label="Move step up"
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(si, ii, 1)}
                    disabled={ii === section.items.length - 1 || !canEdit}
                    aria-label="Move step down"
                    className="rounded border border-border px-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(si, ii)}
                    disabled={!canEdit}
                    aria-label="Remove step"
                    title={item.tickedBy ? `${item.tickedBy} student(s) have ticked this` : undefined}
                    className="rounded border border-border px-1.5 text-xs text-danger hover:bg-danger-bg disabled:opacity-40"
                  >
                    ✕{item.tickedBy ? ` ${item.tickedBy}` : ""}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {canEdit && (
            <div className="border-t border-border px-2 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patchSection(si, { items: [...section.items, blankItem()] })}
              >
                + Step
              </Button>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSections((prev) => [...prev, { title: "", intro: "", items: [blankItem()] }])}
          >
            + Section
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save guide"}
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
          <ActionStatus state={result} pending={pending} label="Guide saved." />
        </div>
      )}
    </form>
  );
}
