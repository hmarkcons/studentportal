"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Pencil, Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  filtersQuery,
  highlightRanges,
  isFiltered,
  searchCatalogue,
  searchWords,
  SEARCH_LEVELS,
  type CatalogueFilters,
  type SearchLevel,
  type SearchProgramme,
  type SearchType,
} from "@/lib/universitySearch";
import { DeleteUniversityIcon } from "./DeleteUniversityIcon";

export type BrowserUniversity = {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  region: string | null;
  type: string | null;
  status: string | null;
  destination_id: string;
};

type Destination = { id: string; name: string; country: string | null };

const LEVEL_LABEL: Record<SearchLevel, string> = { bachelors: "Bachelors", masters: "Masters", phd: "PhD" };
/** Programmes listed under a university found through them, before "+ N more". */
const SHOWN_PROGRAMMES = 4;

/** The search's words marked in a piece of text, accents and case aside. */
function Marked({ text, words }: { text: string; words: readonly string[] }) {
  const ranges = highlightRanges(text, words);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={from} className="rounded-sm bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] px-0.5 text-ink">
        {text.slice(from, to)}
      </mark>
    );
    at = to;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function Chip({
  active,
  onClick,
  children,
  empty = false,
  ...rest
}: { active: boolean; onClick: () => void; children: React.ReactNode; empty?: boolean } & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-primary bg-primary text-primary-ink" : `border-border text-muted hover:text-ink ${empty ? "opacity-50" : ""}`
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The universities list with its search, filters and exports.
 *
 * Every university is on the page already, so a search of names, cities,
 * regions and countries answers as it is typed. The programmes are fetched
 * the first time somebody reaches for the search — focusing it, or choosing a
 * level — and from then on are searched the same way. What is shown is what
 * the two exports download: they run the same search on the same parameters
 * (universitySearch.ts), which the address carries too.
 */
export function UniversityBrowser({
  universities,
  destinations,
  initial,
  canExport,
  canEdit,
}: {
  universities: BrowserUniversity[];
  destinations: Destination[];
  initial: CatalogueFilters;
  canExport: boolean;
  canEdit: boolean;
}) {
  const [q, setQ] = useState(initial.q ?? "");
  const [destination, setDestination] = useState<string | null>(
    initial.destination && destinations.some((d) => d.id === initial.destination) ? initial.destination : null
  );
  const [type, setType] = useState<SearchType | null>(initial.type ?? null);
  const [level, setLevel] = useState<SearchLevel | null>(initial.level ?? null);
  const [index, setIndex] = useState<{ status: "idle" | "loading" | "ready" | "error"; programmes: SearchProgramme[] }>({
    status: "idle",
    programmes: [],
  });
  const searchRef = useRef<HTMLInputElement>(null);
  // Asked for once per visit; a failure may be retried by reaching for the search again.
  const requested = useRef(false);

  const loadIndex = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setIndex({ status: "loading", programmes: [] });
    fetch("/api/setup/programme-index", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { universities: string[]; programmes: [number, string, string, string][] }) =>
        setIndex({
          status: "ready",
          programmes: body.programmes.map(([u, name, lvl, fields]) => ({ university_id: body.universities[u], name, level: lvl, fields })),
        })
      )
      .catch(() => {
        requested.current = false;
        setIndex({ status: "error", programmes: [] });
      });
  }, []);

  // Opened on a search or a level — from Back, a reload or a link: the programmes are needed at once.
  useEffect(() => {
    if (initial.q || initial.level) loadIndex();
  }, [initial.q, initial.level, loadIndex]);

  const filters: CatalogueFilters = useMemo(() => ({ q, destination, type, level }), [q, destination, type, level]);

  // The address follows the filters, without a round trip: Next keeps
  // useSearchParams in step with history.replaceState.
  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = filtersQuery(filters);
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  // "/" goes to the search from anywhere on the page, as on most sites.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const destinationText = useMemo(() => new Map(destinations.map((d) => [d.id, `${d.name} ${d.country ?? ""}`])), [destinations]);
  const destinationName = useMemo(() => new Map(destinations.map((d) => [d.id, d.name])), [destinations]);
  const words = useMemo(() => searchWords(q), [q]);

  // Every destination's matches, so each chip can say how many it holds; the
  // list is then the chosen destination's share of them.
  const everywhere = useMemo(
    () => searchCatalogue(universities, index.programmes, { ...filters, destination: null }, destinationText),
    [universities, index.programmes, filters, destinationText]
  );
  const shown = useMemo(() => (destination ? everywhere.filter((m) => m.university.destination_id === destination) : everywhere), [everywhere, destination]);
  const perDestination = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of everywhere) counts.set(m.university.destination_id, (counts.get(m.university.destination_id) ?? 0) + 1);
    return counts;
  }, [everywhere]);

  const needsProgrammes = Boolean(words.length > 0 || level);
  const programmesReady = index.status === "ready";
  // A level cannot be told without the programmes; until they arrive the list would say "nothing".
  const waitingForLevel = Boolean(level) && !programmesReady;
  const programmeCount = shown.reduce((n, m) => n + m.programmes.length, 0);
  const filtered = isFiltered(filters);
  const qs = filtersQuery(filters);
  const exportReady = shown.length > 0 && (!needsProgrammes || programmesReady);

  function clearAll() {
    setQ("");
    setDestination(null);
    setType(null);
    setLevel(null);
    searchRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-3" data-university-browser>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4" data-university-toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
            <span className="sr-only">Search universities and programmes</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={loadIndex}
              onPointerEnter={loadIndex}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  setQ("");
                }
              }}
              placeholder="Search universities, cities or programmes…"
              className="pl-8 pr-8"
              autoComplete="off"
              spellCheck={false}
              data-university-search
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  searchRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
                aria-label="Clear the search"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="University type">
            <Chip active={!type} onClick={() => setType(null)} data-type-chip="all">
              Public &amp; private
            </Chip>
            <Chip active={type === "public"} onClick={() => setType("public")} data-type-chip="public">
              Public
            </Chip>
            <Chip active={type === "private"} onClick={() => setType("private")} data-type-chip="private">
              Private
            </Chip>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Level offered">
            <Chip active={!level} onClick={() => setLevel(null)} data-level-chip="all">
              All levels
            </Chip>
            {SEARCH_LEVELS.map((l) => (
              <Chip
                key={l}
                active={level === l}
                onClick={() => {
                  setLevel(l);
                  loadIndex();
                }}
                data-level-chip={l}
              >
                {LEVEL_LABEL[l]}
              </Chip>
            ))}
          </div>
        </div>

        {/* One row to swipe along on a phone, where eighteen chips wrapped
            into a dozen rows above the list; wrapped as usual from sm up. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Destination">
          <Chip active={!destination} onClick={() => setDestination(null)} data-destination-chip="all">
            All destinations ({everywhere.length})
          </Chip>
          {destinations.map((d) => (
            <Chip
              key={d.id}
              active={destination === d.id}
              empty={!perDestination.get(d.id)}
              onClick={() => setDestination(d.id)}
              data-destination-chip={d.id}
            >
              {d.name} ({perDestination.get(d.id) ?? 0})
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm text-muted" aria-live="polite" data-university-count>
            {waitingForLevel ? (
              "Finding the programmes at that level…"
            ) : (
              <>
                <strong className="font-semibold text-ink">{shown.length.toLocaleString("en-US")}</strong>{" "}
                {shown.length === 1 ? "university" : "universities"}
                {needsProgrammes && programmesReady && (
                  <>
                    {" · "}
                    <strong className="font-semibold text-ink">{programmeCount.toLocaleString("en-US")}</strong>{" "}
                    {programmeCount === 1 ? "programme" : "programmes"}
                  </>
                )}
                {filtered && ` of ${universities.length.toLocaleString("en-US")}`}
              </>
            )}
            {words.length > 0 && index.status === "loading" && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> searching the programmes too…
              </span>
            )}
            {index.status === "error" && needsProgrammes && (
              <span className="ml-2 text-xs text-danger">The programmes could not be searched — click the search box to try again.</span>
            )}
          </p>
          {canExport && (
            <div className="flex flex-wrap gap-2" data-university-exports>
              <a
                href={`/api/export/universities${qs ? `?${qs}` : ""}`}
                aria-disabled={!exportReady}
                onClick={(e) => !exportReady && e.preventDefault()}
                className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg ${exportReady ? "" : "pointer-events-none opacity-50"}`}
                title="The universities shown, one row each — the sheet Import universities takes back."
                data-export-universities
              >
                <Download aria-hidden className="h-4 w-4" />
                Export universities ({shown.length.toLocaleString("en-US")})
              </a>
              <a
                href={`/api/export/catalogue${qs ? `?${qs}` : ""}`}
                aria-disabled={!exportReady}
                onClick={(e) => !exportReady && e.preventDefault()}
                className={`inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg ${exportReady ? "" : "pointer-events-none opacity-50"}`}
                title="The universities shown with their programmes and admission rounds — the workbook Import a catalogue takes back."
                data-export-catalogue
              >
                <Download aria-hidden className="h-4 w-4" />
                Export catalogue
                {needsProgrammes && programmesReady
                  ? ` (${programmeCount.toLocaleString("en-US")} ${programmeCount === 1 ? "programme" : "programmes"})`
                  : " with programmes & rounds"}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card" data-university-list>
        {!waitingForLevel &&
          shown.map(({ university: u, programmes, matchedBy, programmesAtLevel }) => (
            <div key={u.id} className="px-4 py-3 text-sm hover:bg-bg" data-university-row={u.id}>
              <div className="flex items-center justify-between gap-2">
                <Link prefetch={false} href={`/setup/universities/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink">
                  <span className="min-w-0">
                    <Marked text={u.name} words={words} />
                    {u.short_name && (
                      <span className="text-muted">
                        {" "}
                        (<Marked text={u.short_name} words={words} />)
                      </span>
                    )}
                    <span className="text-muted">
                      {u.city && (
                        <>
                          {" · "}
                          <Marked text={u.city} words={words} />
                        </>
                      )}
                      {" · "}
                      <Marked text={destinationName.get(u.destination_id) ?? ""} words={words} />
                    </span>
                  </span>
                  <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.type}</Badge>
                </Link>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Link
                      prefetch={false}
                      href={`/setup/universities/${u.id}`}
                      title="Edit university"
                      aria-label="Edit university"
                      className="inline-flex items-center rounded p-1 text-muted hover:bg-bg hover:text-primary"
                    >
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                    <DeleteUniversityIcon id={u.id} name={u.name} />
                  </div>
                )}
              </div>
              {matchedBy === "programmes" && (
                <ul className="mt-1.5 flex flex-col gap-0.5 pl-1" data-matched-programmes>
                  {programmes.slice(0, SHOWN_PROGRAMMES).map((p, i) => (
                    <li key={`${p.name}-${p.level}-${i}`} className="text-xs text-muted" data-matched-programme>
                      <span aria-hidden>↳ </span>
                      <span className="text-ink">
                        <Marked text={p.name} words={words} />
                      </span>{" "}
                      · {p.level}
                      {/* Found by its fields rather than its name: say so, or the match reads as a mistake. */}
                      {p.fields && highlightRanges(p.fields, words).length > 0 && (
                        <>
                          {" · "}
                          <Marked text={p.fields} words={words} />
                        </>
                      )}
                    </li>
                  ))}
                  {programmes.length > SHOWN_PROGRAMMES && (
                    <li className="text-xs">
                      <Link prefetch={false} href={`/setup/universities/${u.id}`} className="text-primary hover:underline">
                        + {programmes.length - SHOWN_PROGRAMMES} more matching
                      </Link>
                    </li>
                  )}
                </ul>
              )}
              {matchedBy !== "programmes" && programmesReady && level && (
                <p className="mt-1 text-xs text-muted">
                  {programmesAtLevel} {LEVEL_LABEL[level].toLowerCase()} {programmesAtLevel === 1 ? "programme" : "programmes"}
                </p>
              )}
            </div>
          ))}
        {waitingForLevel && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Finding the universities that teach at that level…
          </div>
        )}
        {!waitingForLevel && shown.length === 0 && (
          <div className="px-4 py-6" data-university-empty>
            {filtered ? (
              <EmptyState>
                Nothing matches{q.trim() ? ` “${q.trim()}”` : ""} with these filters.{" "}
                <button type="button" onClick={clearAll} className="font-medium text-primary hover:underline">
                  Clear the search and filters
                </button>
              </EmptyState>
            ) : (
              <EmptyState>No universities yet.</EmptyState>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
