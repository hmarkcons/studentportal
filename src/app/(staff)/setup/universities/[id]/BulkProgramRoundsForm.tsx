"use client";

import { useActionState, useMemo, useState } from "react";
import { setRoundsForPrograms } from "@/lib/actions/programRoundsBulk";
import { STUDY_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";

type BulkProgram = { id: string; level: string; name: string };

/**
 * Sets the same intake rounds across many programmes of one university.
 *
 * Bachelor's and master's programmes at a university usually share their
 * closing dates, so entering the same pair of dates thirty-odd times one
 * programme at a time is both slow and the sort of work that ends up
 * inconsistent. The rounds are typed once here and written to everything
 * picked.
 *
 * Grouped by level with a per-level "select all", because "every master's
 * programme" is how the dates are actually announced.
 */
export function BulkProgramRoundsForm({
  universityId,
  programs,
  canReplace,
}: {
  universityId: string;
  programs: BulkProgram[];
  /** Clearing existing rounds is a delete, which RLS gives to Super Admin only. */
  canReplace: boolean;
}) {
  const action = setRoundsForPrograms.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"add" | "replace">("add");

  // The rounds widget keeps its rows in state, so React's form reset does not
  // clear them — it is remounted on success instead, along with the selection,
  // so the next use does not silently start from the last one. Done during
  // render, guarded on the last result seen, rather than from an effect: an
  // effect would paint the previous selection once before clearing it.
  const [handledState, setHandledState] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (handledState !== state) {
    setHandledState(state);
    if (state?.success) {
      setResetKey((k) => k + 1);
      setSelected(new Set());
    }
  }

  const byLevel = useMemo(() => {
    const groups = new Map<string, BulkProgram[]>();
    for (const p of programs) {
      if (!groups.has(p.level)) groups.set(p.level, []);
      groups.get(p.level)!.push(p);
    }
    // Known levels in their canonical order, then anything unexpected, so a
    // programme with an odd level is still reachable rather than hidden.
    const ordered = [...STUDY_LEVELS.filter((l) => groups.has(l)), ...[...groups.keys()].filter((l) => !STUDY_LEVELS.includes(l as never))];
    return ordered.map((level) => ({ level, items: groups.get(level) ?? [] }));
  }, [programs]);

  // Only meaningful when the university actually has both, which not all do —
  // several German ones in the catalogue are master's-only.
  const bachelorsAndMasters = useMemo(() => {
    const levels = new Set(programs.map((p) => p.level));
    if (!levels.has("bachelors") || !levels.has("masters")) return [];
    return programs.filter((p) => p.level === "bachelors" || p.level === "masters").map((p) => p.id);
  }, [programs]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  if (programs.length === 0) return null;

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Set the same start date and deadline on several programmes
      </summary>

      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted">Apply to</span>
            {/* Bachelor's and master's programmes are the pair that share
                dates, and picking both was two clicks with nothing saying they
                could be combined. The selection has always been one set across
                levels; this just names the combination. */}
            {bachelorsAndMasters.length > 0 && (
              <button
                type="button"
                onClick={() => selectMany(bachelorsAndMasters, true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                All bachelor&rsquo;s + master&rsquo;s ({bachelorsAndMasters.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => selectMany(programs.map((p) => p.id), true)}
              className="text-xs text-primary hover:underline"
            >
              Select all {programs.length}
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-ink">
                Clear
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-bg p-2">
            {byLevel.map(({ level, items }) => {
              const ids = items.map((p) => p.id);
              const allOn = ids.every((id) => selected.has(id));
              return (
                <div key={level} className="mb-2 last:mb-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {level} ({items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => selectMany(ids, !allOn)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {allOn ? "none" : `all ${level}`}
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5 pl-1">
                    {items.map((p) => (
                      <label key={p.id} className="flex items-start gap-2 text-xs text-ink">
                        <input
                          type="checkbox"
                          name="program_ids"
                          value={p.id}
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          className="mt-0.5"
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {selected.size} of {programs.length} programme{programs.length === 1 ? "" : "s"} selected
          </p>
        </div>

        <ProgramRoundsFields key={resetKey} />

        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-xs text-ink">
            <input type="radio" name="mode" value="add" checked={mode === "add"} onChange={() => setMode("add")} className="mt-0.5" />
            <span>
              Add to what each programme already has
              <span className="block text-[11px] text-muted">
                A programme that already has a round with the same name is left alone, so this is safe to run twice.
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 text-xs ${canReplace ? "text-ink" : "text-muted"}`}>
            <input
              type="radio"
              name="mode"
              value="replace"
              checked={mode === "replace"}
              disabled={!canReplace}
              onChange={() => setMode("replace")}
              className="mt-0.5"
            />
            <span>
              Replace each programme&rsquo;s rounds with these
              <span className="block text-[11px] text-warning">
                {canReplace
                  ? "Removes the rounds those programmes already have. Any application filed against one of them keeps its programme but loses its round."
                  : "Only Super Admin can clear existing rounds."}
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* What was set, how much was skipped and which applications lost
              their round — said beside the button, and cleared once the
              form is touched again, like every other confirmation. */}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            pending={pending}
            disabled={selected.size === 0}
            status={{
              state,
              label: state?.success
                ? `Set ${state.rounds} round${state.rounds === 1 ? "" : "s"} across ${state.programs} programme${
                    state.programs === 1 ? "" : "s"
                  }.${state.skipped ? ` Skipped ${state.skipped} that already had a round with that name.` : ""}${
                    state.applicationsDetached
                      ? ` ${state.applicationsDetached} application${state.applicationsDetached === 1 ? "" : "s"} lost the round it was filed against — set it again on the application.`
                      : ""
                  }`
                : "Applied.",
            }}
          >
            {selected.size === 0
              ? "Pick some programmes"
              : `Apply to ${selected.size} programme${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>

        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </details>
  );
}
