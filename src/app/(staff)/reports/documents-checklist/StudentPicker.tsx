"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";

export type PickerStudent = { id: string; name: string; code: string | null };

/** Lower-case, accents off: "Zoë" is found by "zoe", "HMC-FALL27" by "fall27". */
const fold = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** How many matches the list shows at once; typing narrows the rest. */
const SHOWN = 60;

/**
 * Choose particular students for the documents checklist — one, a few, or
 * none for everyone. Search by name or Student ID; each one chosen is a chip
 * that can be taken off again. The choice travels in a hidden "students"
 * field (ids, comma-separated), so the filter form's Apply sends it with the
 * rest, and the page and its downloads read it as they read the others.
 */
export function StudentPicker({ options, selected: initial }: { options: PickerStudent[]; selected: string[] }) {
  const known = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [selected, setSelected] = useState<string[]>(() => initial.filter((id) => known.has(id)));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const folded = useMemo(() => options.map((o) => ({ o, key: fold(`${o.name} ${o.code ?? ""}`) })), [options]);
  const matches = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return folded.filter(({ key }) => words.every((w) => key.includes(w))).map(({ o }) => o);
  }, [folded, query]);
  const shown = matches.slice(0, SHOWN);
  const chosen = new Set(selected);

  /**
   * Ticks or unticks a student and closes the list. Left open it would show
   * every student again and lie over Apply, so a click meant for Apply picked
   * whoever was underneath. The cursor stays in the search: typing, or the
   * down arrow, opens it again for the next one.
   */
  function toggle(id: string) {
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
    setQuery("");
    setActive(0);
    setOpen(false);
    input.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Enter picks the highlighted student rather than submitting the filters half-chosen.
      if (open && shown[active]) {
        e.preventDefault();
        toggle(shown[active].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length) {
      setSelected((now) => now.slice(0, -1));
    }
  }

  return (
    <div className="flex min-w-72 flex-col gap-1 text-xs font-medium text-muted" data-student-picker>
      <label htmlFor={`${listId}-input`}>Students</label>
      <div className="relative">
        <input
          ref={input}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={selected.length ? "Add another student…" : "All students — search by name or Student ID"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // After a click on an option has had its turn.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm font-normal text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
        {open && (
          <ul
            id={`${listId}-list`}
            role="listbox"
            aria-multiselectable
            className="absolute z-30 mt-1 max-h-72 w-full min-w-80 overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {shown.length === 0 && <li className="px-3 py-2 text-sm font-normal text-muted">No registered student matches “{query}”.</li>}
            {shown.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={chosen.has(o.id)}
                data-student-option={o.id}
                // mousedown, not click: it lands before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(o.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm font-normal ${i === active ? "bg-bg" : ""}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${chosen.has(o.id) ? "border-primary bg-primary text-primary-ink" : "border-border"}`}>
                  {chosen.has(o.id) && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{o.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{o.code ?? "no ID yet"}</span>
              </li>
            ))}
            {matches.length > SHOWN && (
              <li className="px-3 py-1.5 text-xs font-normal text-muted">
                {matches.length - SHOWN} more — keep typing to narrow the list.
              </li>
            )}
          </ul>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {selected.map((id) => {
            const o = known.get(id)!;
            return (
              <span key={id} data-picked={id} className="inline-flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pr-1 pl-2 text-xs font-medium text-ink">
                {o.name}
                {o.code && <span className="font-mono text-[10px] text-muted">{o.code}</span>}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="rounded-full p-0.5 text-muted hover:bg-bg hover:text-ink"
                  aria-label={`Remove ${o.name}`}
                  title={`Remove ${o.name}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            );
          })}
          {selected.length > 1 && (
            <button type="button" onClick={() => setSelected([])} className="text-xs font-normal text-muted underline hover:text-ink">
              Remove all
            </button>
          )}
        </div>
      )}
      {selected.join(",") !== initial.filter((id) => known.has(id)).join(",") && (
        <p className="text-xs font-normal text-primary" data-picker-pending>
          Press Apply to show {selected.length ? (selected.length === 1 ? "this student" : `these ${selected.length} students`) : "every student"}.
        </p>
      )}
      {/* Left out when empty (a disabled field is not sent), so "everyone" keeps a clean address. */}
      <input type="hidden" name="students" value={selected.join(",")} disabled={selected.length === 0} />
    </div>
  );
}
