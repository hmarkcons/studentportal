"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type PickedStudent = { id: string; label: string; href?: string | null };

type Hit = { id: string; label: string; sublabel: string; href: string };

/**
 * The student or lead a task is about, found as the search at the top of the
 * page finds them (/api/search: name, email, phone, Student ID) and posted as
 * `student_id`. Optional: a task need not be about anyone.
 */
export function StudentPicker({
  value,
  onChange,
  name = "student_id",
}: {
  value: PickedStudent | null;
  onChange: (next: PickedStudent | null) => void;
  name?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    // Under two letters nothing is searched, and nothing is listed (below).
    if (q.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const body = (await res.json()) as { students?: Hit[] };
        // Only the latest search's answer: an earlier, slower one must not overwrite it.
        if (mine === seq.current) setHits(body.students ?? []);
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info" data-picked-student={value.id}>
          {value.label}
          <button type="button" onClick={() => onChange(null)} aria-label={`Unlink ${value.label}`} className="rounded-full hover:bg-info/20">
            <X aria-hidden className="h-3 w-3" />
          </button>
        </span>
        <input type="hidden" name={name} value={value.id} />
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <Search aria-hidden className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a student or lead (optional)…"
        aria-label="Find a student or lead"
        className="w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
      {query.trim().length >= 2 && (
        <ul className="mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card" role="listbox" aria-label="Students and leads">
          {busy && hits.length === 0 && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
          {!busy && hits.length === 0 && <li className="px-3 py-2 text-xs text-muted">Nobody found.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: h.id, label: h.label, href: h.href });
                  setQuery("");
                }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-bg"
              >
                <span className="text-sm text-ink">{h.label}</span>
                <span className="text-xs text-muted">
                  {h.href.startsWith("/students") ? "Student" : "Lead"}
                  {h.sublabel ? ` · ${h.sublabel}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
