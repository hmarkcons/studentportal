"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, PanelLeft, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  CALENDAR_VIEWS,
  dayDelta,
  karachiClock,
  parseDateParam,
  parseView,
  periodDays,
  periodRange,
  periodTitle,
  shiftDate,
  shiftPeriod,
  type CalendarView,
} from "@/lib/calendarLayout";
import { eventsOn, matchesQuery, type CalendarEvent } from "@/lib/calendarItems";
import { Button } from "@/components/ui/Button";
import { announceCalendarChange, useHiddenKinds, useKarachiClock } from "./hooks";
import { eventColor, type EventColor } from "./eventColors";
import type { KindDef } from "./kinds";
import type { ActionResult, Anchor, CalendarDrop, CalendarHandlers, Draft } from "./types";
import { TimeGrid } from "./views/TimeGrid";
import { MonthView } from "./views/MonthView";
import { YearView } from "./views/YearView";
import { SearchResults } from "./views/SearchResults";
import { Popover } from "./parts/Popover";
import { QuickAdd } from "./parts/QuickAdd";
import { EventDetails } from "./parts/EventDetails";
import { DayList } from "./parts/DayList";
import { EventEditor, type EditorMode } from "./parts/EventEditor";
import { Sidebar } from "./parts/Sidebar";

const VIEW_LABEL: Record<CalendarView, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
const VIEW_KEY: Record<string, CalendarView> = { d: "day", w: "week", m: "month", y: "year" };

type Popup =
  | { type: "quick"; anchor: Anchor }
  | { type: "event"; eventId: string; fallback: CalendarEvent; anchor: Anchor }
  | { type: "day"; date: string; anchor: Anchor };

type Patch =
  | { type: "move"; id: string; drop: CalendarDrop }
  | { type: "done"; seriesKey: string; done: boolean }
  | { type: "remove"; seriesKey: string };

/** The screen the moment a change is made, before the server has answered. */
function applyPatch(events: CalendarEvent[], patch: Patch): CalendarEvent[] {
  if (patch.type === "move") {
    return events.map((e) =>
      e.id === patch.id
        ? {
            ...e,
            date: patch.drop.date,
            time: patch.drop.time,
            endTime: patch.drop.endTime,
            spanEnd: e.spanEnd ? shiftDate(e.spanEnd, dayDelta(e.date, patch.drop.date)) : null,
          }
        : e
    );
  }
  if (patch.type === "done") return events.map((e) => (e.seriesKey === patch.seriesKey ? { ...e, done: patch.done } : e));
  return events.filter((e) => e.seriesKey !== patch.seriesKey);
}

function failed(result: ActionResult): string | null {
  return result && typeof result === "object" && result.error ? result.error : null;
}

function isRecurring(e: CalendarEvent) {
  return Boolean(e.recurrence && e.recurrence !== "none");
}

/**
 * The calendar as Google Calendar lays it out — a sidebar with Create, a
 * little month and My calendars; a bar with Today, the arrows, the period,
 * search and the view switch; and Day and Week as hour grids, Month as weeks
 * of chips, Year as twelve little months.
 *
 * Shared by the staff calendar, which can create, edit, drag and tick off
 * (given `handlers`), and the student's, which only looks.
 *
 * `navigation` is how a new period is reached. The staff page loads only the
 * period on screen, so moving is a server navigation; the student's calendar
 * holds everything already, so it only rewrites the address.
 */
export function CalendarApp({
  basePath,
  navigation,
  view: serverView,
  referenceDate: serverDate,
  todayStr,
  events,
  loadedRange,
  kinds,
  storageKey,
  handlers,
  applicationOptions = [],
  sidebarExtra,
  extraParams,
  heading = "Calendar",
}: {
  basePath: string;
  navigation: "server" | "client";
  view: CalendarView;
  referenceDate: string;
  todayStr: string;
  events: CalendarEvent[];
  /** The days `events` covers; outside it, the page is still loading. */
  loadedRange: { start: string; end: string };
  kinds: readonly KindDef[];
  /** Where My calendars remembers what is ticked off, per portal. */
  storageKey: string;
  handlers?: CalendarHandlers;
  applicationOptions?: { id: string; label: string }[];
  sidebarExtra?: React.ReactNode;
  /** Kept on every address the calendar moves to — whose calendar it is. */
  extraParams?: Record<string, string>;
  heading?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editable = Boolean(handlers);

  // ----------------------------------------------------------- where we are
  // The address is the source of truth, so back and forward work; `nav` moves
  // at once when a button is pressed, before the page it asks for arrives.
  const urlView = parseView(searchParams.get("view"), serverView);
  const urlDate = parseDateParam(searchParams.get("date")) ?? serverDate;
  const urlKey = `${urlView}|${urlDate}`;
  const [nav, setNav] = useState({ view: urlView, date: urlDate });
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    setNav({ view: urlView, date: urlDate });
  }
  const [navPending, startNav] = useTransition();

  const [popup, setPopup] = useState<Popup | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState<{ query: string; results: CalendarEvent[]; pending: boolean; error: string | null } | null>(null);
  const searchSeq = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

  // When a card was last closed. A press outside a card closes it, and the
  // click that follows must not open a new quick-add card where it landed.
  const lastClose = useRef(0);
  const closePopup = useCallback(() => {
    lastClose.current = Date.now();
    setPopup(null);
    setDraft(null);
  }, []);

  const go = useCallback(
    (view: CalendarView, date: string) => {
      setNav({ view, date });
      setPopup(null);
      setDraft(null);
      setSearch(null);
      setSidebarOpen(false);
      const params = new URLSearchParams({ view, date, ...(extraParams ?? {}) });
      const url = `${basePath}?${params.toString()}`;
      if (navigation === "server") startNav(() => router.push(url, { scroll: false }));
      else window.history.pushState(null, "", url);
    },
    [basePath, extraParams, navigation, router]
  );

  // ---------------------------------------------------------------- events
  const [optimistic, applyOptimistic] = useOptimistic(events, applyPatch);
  const [hidden, setHidden] = useHiddenKinds(storageKey);
  const visible = useMemo(() => optimistic.filter((e) => !hidden.has(e.kind)), [optimistic, hidden]);
  const kindByKey = useMemo(() => new Map(kinds.map((k) => [k.key as string, k])), [kinds]);
  const colorOf = useCallback(
    (e: CalendarEvent): EventColor => eventColor(e.color || kindByKey.get(e.kind)?.color, "gray"),
    [kindByKey]
  );

  const days = useMemo(() => periodDays(nav.view, nav.date), [nav.view, nav.date]);
  const range = periodRange(nav.view, nav.date);
  const loading = navPending || range.start < loadedRange.start || range.end > loadedRange.end;
  const inView = useMemo(() => new Set(nav.view === "year" || nav.view === "month" ? [] : days), [nav.view, days]);
  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const e of visible) set.add(e.date);
    return set;
  }, [visible]);
  // How many of each kind the period on screen holds, beside its name in My calendars.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of optimistic) {
      if (e.date <= range.end && (e.spanEnd ?? e.date) >= range.start) c[e.kind] = (c[e.kind] ?? 0) + 1;
    }
    return c;
  }, [optimistic, range.start, range.end]);

  const clock = useKarachiClock();

  // ------------------------------------------------------------- changes
  const [, startMutation] = useTransition();

  /**
   * A change drawn at once and saved behind it. If the save is refused the
   * optimistic state falls away by itself when the transition ends, which
   * puts the item back where it was — and the toast says why.
   */
  const mutate = useCallback(
    (patch: Patch, action: () => Promise<ActionResult>, ok: string | null, fail: string) => {
      startMutation(async () => {
        applyOptimistic(patch);
        let result: ActionResult;
        try {
          result = await action();
        } catch (error) {
          result = { error: (error as Error)?.message || "Something went wrong — try again." };
        }
        const problem = failed(result);
        if (problem) toast(`${fail} ${problem}`, "danger");
        else {
          if (ok) toast(ok);
          announceCalendarChange();
        }
      });
    },
    [applyOptimistic]
  );

  function drop(e: CalendarEvent, to: CalendarDrop) {
    if (!handlers) return;
    if (isRecurring(e) && !window.confirm(`“${e.rawTitle ?? e.title}” repeats. Change every occurrence the same way?`)) return;
    setPopup(null);
    mutate({ type: "move", id: e.id, drop: to }, () => handlers.move(e, to), "Event saved.", "Couldn't move it — it is back where it was.");
  }

  function toggle(e: CalendarEvent, done: boolean) {
    if (!handlers) return;
    const reminder = e.kind === "reminder";
    mutate(
      { type: "done", seriesKey: e.seriesKey, done },
      () => handlers.toggleDone(e, done),
      done ? (reminder ? "Resolved." : "Marked done.") : reminder ? "Reopened." : "Marked not done.",
      "Not changed."
    );
  }

  function remove(e: CalendarEvent) {
    if (!handlers) return;
    const series = isRecurring(e) ? " Every occurrence goes with it." : "";
    if (!window.confirm(`Delete “${e.rawTitle ?? e.title}”?${series} This can't be undone.`)) return;
    setPopup(null);
    mutate({ type: "remove", seriesKey: e.seriesKey }, () => handlers.remove(e), "Deleted.", "Not deleted.");
  }

  async function saveNew(form: FormData): Promise<ActionResult> {
    if (!handlers) return { error: "This calendar is read-only." };
    let result: ActionResult;
    try {
      result = await handlers.create(form);
    } catch (error) {
      result = { error: (error as Error)?.message || "Something went wrong — try again." };
    }
    if (!failed(result)) {
      toast("Event saved.");
      setEditor(null);
      closePopup();
      announceCalendarChange();
    }
    return result;
  }

  async function saveEdit(e: CalendarEvent, form: FormData): Promise<ActionResult> {
    if (!handlers) return { error: "This calendar is read-only." };
    let result: ActionResult;
    try {
      result = await handlers.update(e, form);
    } catch (error) {
      result = { error: (error as Error)?.message || "Something went wrong — try again." };
    }
    if (!failed(result)) {
      toast("Event saved.");
      setEditor(null);
      announceCalendarChange();
    }
    return result;
  }

  async function saveReminder(e: CalendarEvent, form: FormData): Promise<ActionResult> {
    if (!handlers) return { error: "This calendar is read-only." };
    let result: ActionResult;
    try {
      result = await handlers.updateReminder(e, form);
    } catch (error) {
      result = { error: (error as Error)?.message || "Something went wrong — try again." };
    }
    if (!failed(result)) toast("Reminder saved.");
    return result;
  }

  // ----------------------------------------------------------- opening
  function openCreate(d: Draft, anchor: Anchor) {
    if (!handlers || Date.now() - lastClose.current < 400) return;
    setDraft({ type: "personal", notifyMinutes: d.start === null ? null : 30, ...d });
    setPopup({ type: "quick", anchor });
  }

  /** Create: the day on screen, at the next hour if it is today, else nine to ten. */
  function openEditorFresh() {
    if (!handlers) return;
    const now = karachiClock(Date.now());
    const date = nav.view !== "day" && days.includes(now.date) ? now.date : nav.date;
    const start = date === now.date ? Math.min(Math.ceil((now.minutes + 1) / 60) * 60, 23 * 60) : 9 * 60;
    setPopup(null);
    setEditor({ kind: "create", draft: { date, start, end: start + 60, type: "personal", notifyMinutes: 30 } });
  }

  function openEvent(e: CalendarEvent, anchor: Anchor) {
    setDraft(null);
    setPopup({ type: "event", eventId: e.id, fallback: e, anchor });
  }

  function openDay(date: string) {
    go("day", date);
  }

  // ---------------------------------------------------------------- search
  async function runSearch(raw: string) {
    const query = raw.trim();
    if (!query) {
      setSearch(null);
      return;
    }
    const seq = ++searchSeq.current;
    const local = optimistic.filter((e) => matchesQuery(e, query));
    setSearch({ query, results: local.sort((a, b) => a.date.localeCompare(b.date)), pending: Boolean(handlers?.search), error: null });
    setPopup(null);
    if (!handlers?.search) return;
    let remote: { events: CalendarEvent[]; error?: string };
    try {
      remote = await handlers.search(query);
    } catch (error) {
      remote = { events: [], error: (error as Error)?.message };
    }
    if (seq !== searchSeq.current) return;
    const byId = new Map<string, CalendarEvent>();
    for (const e of [...remote.events, ...local]) if (!byId.has(e.id)) byId.set(e.id, e);
    setSearch({
      query,
      results: [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")),
      pending: false,
      error: remote.error ?? null,
    });
  }

  function clearSearch() {
    searchSeq.current++;
    setSearch(null);
    setSearchText("");
  }

  // ------------------------------------------------------------ shortcuts
  // Google's single keys, when nothing is being typed and nothing is open:
  // t today, d/w/m/y a view, j/k or n/p the next and previous period, c
  // create, / search.
  const onShortcut = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onShortcut.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[data-calendar-popover], [data-event-editor]")) return;
      const key = e.key.toLowerCase();
      if (key === "t") go(nav.view, todayStr);
      else if (VIEW_KEY[key]) go(VIEW_KEY[key], nav.date);
      else if (key === "j" || key === "n") go(nav.view, shiftPeriod(nav.view, nav.date, 1));
      else if (key === "k" || key === "p") go(nav.view, shiftPeriod(nav.view, nav.date, -1));
      else if (key === "c" && handlers) openEditorFresh();
      else if (key === "/") searchInput.current?.focus();
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onShortcut.current(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  // --------------------------------------------------------------- popups
  const popupEvent = popup?.type === "event" ? (optimistic.find((e) => e.id === popup.eventId) ?? (search ? popup.fallback : null)) : null;

  const views = (
    <div className="relative min-h-0 flex-1" data-calendar-view={nav.view}>
      {search ? (
        <SearchResults
          query={search.query}
          results={search.results.filter((e) => !hidden.has(e.kind))}
          pending={search.pending}
          error={search.error}
          colorOf={colorOf}
          todayStr={todayStr}
          onOpenEvent={openEvent}
          onOpenDay={openDay}
        />
      ) : nav.view === "year" ? (
        <YearView referenceDate={nav.date} todayStr={todayStr} events={visible} onOpenDay={openDay} />
      ) : nav.view === "month" ? (
        <MonthView
          referenceDate={nav.date}
          todayStr={todayStr}
          events={visible}
          colorOf={colorOf}
          editable={editable}
          draft={popup?.type === "quick" ? draft : null}
          onCreate={openCreate}
          onOpenEvent={openEvent}
          onOpenDay={openDay}
          onMoreOnDay={(date, anchor) => setPopup({ type: "day", date, anchor })}
          onDrop={drop}
        />
      ) : (
        <TimeGrid
          days={days}
          todayStr={todayStr}
          now={clock}
          events={visible}
          colorOf={colorOf}
          editable={editable}
          draft={popup?.type === "quick" ? draft : null}
          onCreate={openCreate}
          onOpenEvent={openEvent}
          onOpenDay={openDay}
          onDrop={drop}
        />
      )}
      {loading && !search && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center" aria-live="polite">
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted shadow">
            <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div
      data-card
      data-calendar
      data-calendar-mode={editable ? "edit" : "read"}
      className="flex h-[calc(100dvh-8.5rem)] min-h-[600px] w-full overflow-hidden rounded-2xl border border-border bg-card"
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        canCreate={editable}
        onCreate={openEditorFresh}
        todayStr={todayStr}
        selected={nav.date}
        inView={inView}
        marked={marked}
        onPick={(date) => go(nav.view === "year" ? "day" : nav.view, date)}
        kinds={kinds}
        hidden={hidden}
        onToggleKind={setHidden}
        counts={counts}
        extra={sidebarExtra}
        showNotifications={editable}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The bar across the top. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Show the calendar sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink lg:hidden"
          >
            <PanelLeft aria-hidden className="h-5 w-5" />
          </button>
          {/* The page's heading: shown on a wide screen, and still there for a screen reader on a narrow one. */}
          <div className="flex items-center gap-2 2xl:pr-2">
            <span aria-hidden className="bg-hero hidden h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm 2xl:flex">
              <CalendarDays className="h-5 w-5" />
            </span>
            <h2 className="sr-only text-lg font-semibold text-ink 2xl:not-sr-only">{heading}</h2>
          </div>
          <Button type="button" variant="outline" onClick={() => go(nav.view, todayStr)} className="rounded-full px-4" data-calendar-today>
            Today
          </Button>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => go(nav.view, shiftPeriod(nav.view, nav.date, -1))}
              aria-label={`Previous ${VIEW_LABEL[nav.view].toLowerCase()}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-bg"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(nav.view, shiftPeriod(nav.view, nav.date, 1))}
              aria-label={`Next ${VIEW_LABEL[nav.view].toLowerCase()}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-bg"
            >
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          </div>
          <p className="text-lg text-ink sm:text-xl" data-period-title aria-live="polite">
            {periodTitle(nav.view, nav.date)}
          </p>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(searchText);
              }}
              className="flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 focus-within:border-primary"
            >
              <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={searchInput}
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") clearSearch();
                }}
                placeholder="Search by title"
                aria-label="Search the calendar by title"
                data-calendar-search
                className="w-32 bg-transparent text-sm text-ink outline-none placeholder:text-muted sm:w-36 2xl:w-44"
              />
              {search && (
                <button type="button" onClick={clearSearch} aria-label="Clear the search" className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-ink">
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
            </form>
            <div role="group" aria-label="View" className="flex overflow-hidden rounded-full border border-border" data-view-switch>
              {CALENDAR_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={nav.view === v && !search}
                  onClick={() => go(v, nav.date)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    nav.view === v && !search ? "bg-primary text-primary-ink" : "text-ink hover:bg-bg"
                  }`}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {views}
      </div>

      {popup?.type === "quick" && draft && handlers && (
        <Popover anchor={popup.anchor} onClose={closePopup} label="Quick add">
          <QuickAdd
            draft={draft}
            applicationOptions={applicationOptions}
            onChange={setDraft}
            onClose={closePopup}
            onSave={saveNew}
            onMore={() => {
              setEditor({ kind: "create", draft });
              setPopup(null);
            }}
          />
        </Popover>
      )}

      {popup?.type === "event" && popupEvent && (
        <Popover anchor={popup.anchor} onClose={closePopup} label={popupEvent.title}>
          <EventDetails
            event={popupEvent}
            noun={kindByKey.get(popupEvent.kind)?.noun ?? popupEvent.kind}
            color={colorOf(popupEvent)}
            readOnly={!editable}
            onClose={closePopup}
            onEdit={() => {
              setEditor({ kind: "edit", event: popupEvent });
              setPopup(null);
            }}
            onDelete={() => remove(popupEvent)}
            onToggle={(done) => toggle(popupEvent, done)}
            onSaveReminder={(form) => saveReminder(popupEvent, form)}
          />
        </Popover>
      )}

      {popup?.type === "day" && (
        <Popover anchor={popup.anchor} onClose={closePopup} label={`Everything on ${popup.date}`} width={300}>
          <DayList
            date={popup.date}
            events={eventsOn(visible, popup.date)}
            colorOf={colorOf}
            onClose={closePopup}
            onOpenDay={openDay}
            onOpenEvent={openEvent}
          />
        </Popover>
      )}

      {editor && handlers && (
        <EventEditor
          key={editor.kind === "edit" ? editor.event.id : "new"}
          mode={editor}
          applicationOptions={applicationOptions}
          kindColor={(type) => kindByKey.get(type)?.color ?? "gray"}
          onClose={() => setEditor(null)}
          onSave={(form) => (editor.kind === "edit" ? saveEdit(editor.event, form) : saveNew(form))}
        />
      )}
    </div>
  );
}
