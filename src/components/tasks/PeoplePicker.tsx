"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { TaskPerson } from "@/lib/staffTasksLoad";

/**
 * Who a task is for: any number of colleagues, the viewer first. Each one
 * chosen is posted as an `assignees` value, so the form's action reads
 * formData.getAll("assignees").
 */
export function PeoplePicker({
  people,
  me,
  value,
  onChange,
  name = "assignees",
  exclude = [],
}: {
  people: readonly TaskPerson[];
  me: string;
  value: string[];
  onChange: (next: string[]) => void;
  name?: string;
  /** People not to offer — those who already have the task. */
  exclude?: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(value);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  const offered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.active && !exclude.includes(p.id))
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || (p.designation ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(b.id === me) - Number(a.id === me) || a.full_name.localeCompare(b.full_name));
  }, [people, query, me, exclude]);

  const toggle = (id: string) => onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-chosen-people>
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {id === me ? "Me" : (nameOf.get(id) ?? "Someone")}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${id === me ? "me" : nameOf.get(id)}`} className="rounded-full hover:bg-primary/20">
                <X aria-hidden className="h-3 w-3" />
              </button>
              <input type="hidden" name={name} value={id} />
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a colleague…"
          aria-label="Find a colleague"
          className="w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>
      <ul className="max-h-44 overflow-y-auto rounded-md border border-border" role="listbox" aria-multiselectable="true" aria-label="Colleagues">
        {offered.length === 0 && <li className="px-3 py-2 text-xs text-muted">Nobody by that name.</li>}
        {offered.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-bg">
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} data-person={p.id} className="accent-primary" />
              <span className="text-ink">{p.id === me ? `Me (${p.full_name})` : p.full_name}</span>
              {p.designation && <span className="truncate text-xs text-muted">{p.designation}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
