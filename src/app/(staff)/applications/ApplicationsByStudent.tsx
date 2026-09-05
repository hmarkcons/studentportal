"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";

export type StudentApplicationRow = {
  id: string;
  university: string;
  city: string | null;
  country: string;
  program: string;
  stage: string;
  deadline: string | null;
  href: string;
};

export type StudentApplicationGroup = {
  id: string;
  name: string;
  countries: string[];
  apps: StudentApplicationRow[];
  counselorName: string | null;
  counselorInitials: string | null;
  registeredMonth: string | null;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ApplicationsByStudent({
  groups,
  allCountries,
}: {
  groups: StudentApplicationGroup[];
  allCountries: string[];
}) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (country && !g.countries.includes(country)) return false;
      return true;
    });
  }, [groups, search, country]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const header = ["Student", "Counselor", "Registered", "Country", "University", "Program", "Stage", "Deadline"].join(",");
    const lines = visible.flatMap((g) =>
      g.apps.map((a) =>
        [g.name, g.counselorName ?? "", g.registeredMonth ?? "", a.country, a.university, a.program, a.stage.replace(/_/g, " "), a.deadline ?? ""]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(",")
      )
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student…"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
          />
          {allCountries.length > 0 && (
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <option value="">Country: all</option>
              {allCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {(search || country) && (
            <button
              onClick={() => {
                setSearch("");
                setCountry("");
              }}
              className="text-xs text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
        <button onClick={exportCsv} className="text-xs font-medium text-primary hover:underline">
          Export
        </button>
      </div>

      <div className="space-y-2">
        {visible.map((g) => {
          const open = expanded.has(g.id);
          return (
            <div key={g.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => toggle(g.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg/60"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{g.name}</p>
                    {g.counselorInitials && (
                      <span
                        title={g.counselorName ?? undefined}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary"
                      >
                        {g.counselorInitials}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {g.countries.join(", ") || "—"}
                    {g.registeredMonth && ` · Registered ${g.registeredMonth}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    {g.apps.length} application{g.apps.length === 1 ? "" : "s"}
                  </span>
                  <Chevron open={open} />
                </div>
              </button>
              {open && (
                <div className="divide-y divide-border border-t border-border">
                  {g.apps.map((a) => (
                    <Link
                      key={a.id}
                      href={a.href}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-bg/40"
                    >
                      <div>
                        <p className="text-ink">
                          {a.university}
                          {a.city && ` · ${a.city}`}
                        </p>
                        <p className="text-xs text-muted">
                          {a.country} — {a.program}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {a.deadline && <span className="text-xs text-muted">Due {a.deadline}</span>}
                        <Badge tone="info">{a.stage.replace(/_/g, " ")}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted">
            No students found.
          </div>
        )}
      </div>
    </div>
  );
}
