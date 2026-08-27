"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";

type SearchResult = { id: string; label: string; sublabel: string; href: string };
type SearchResponse = { students: SearchResult[]; universities: SearchResult[] };

async function fetchSearch(query: string): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export function GlobalSearch() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(raw.trim()), 250);
    return () => clearTimeout(id);
  }, [raw]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => fetchSearch(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = data ? [...data.students, ...data.universities] : [];
  const showDropdown = open && debounced.length >= 2;

  function go(href: string) {
    setOpen(false);
    setRaw("");
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <Input
        type="search"
        placeholder="Search students, universities…"
        className="w-64"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {isFetching && <p className="px-3 py-2 text-xs text-muted">Searching…</p>}
          {!isFetching && results.length === 0 && <p className="px-3 py-2 text-xs text-muted">No matches.</p>}
          {!isFetching &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => go(r.href)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-bg"
              >
                <span className="text-ink">{r.label}</span>
                {r.sublabel && <span className="text-xs text-muted">{r.sublabel}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
