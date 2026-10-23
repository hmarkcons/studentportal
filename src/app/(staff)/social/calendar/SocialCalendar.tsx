"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleSocialPost, deleteSocialPost, duplicateSocialPost } from "@/lib/actions/socialPosts";
import { karachiParts, karachiYmd, moveToKarachiDay } from "@/lib/social/time";
import { PLATFORM_LABELS, type PostStatus, type SocialPlatform } from "@/lib/social/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

export type CalendarPost = {
  id: string;
  caption: string | null;
  status: PostStatus;
  scheduledAt: string;
  country: string | null;
  intake: string | null;
  platforms: SocialPlatform[];
  campaignName: string | null;
  authorId: string | null;
  authorName: string | null;
};

const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  threads: "#111111",
  linkedin: "#0A66C2",
  tiktok: "#EE1D52",
  snapchat: "#E0A800",
};
const STATUS_CLASS: Record<PostStatus, string> = {
  draft: "bg-bg text-muted",
  pending_approval: "bg-warning-bg text-warning",
  scheduled: "bg-info-bg text-info",
  publishing: "bg-info-bg text-info",
  published: "bg-success-bg text-success",
  partially_published: "bg-warning-bg text-warning",
  failed: "bg-danger-bg text-danger",
};
const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft", pending_approval: "Pending approval", scheduled: "Scheduled", publishing: "Publishing",
  published: "Published", partially_published: "Partly published", failed: "Failed",
};
const MOVABLE: PostStatus[] = ["draft", "scheduled"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// --- pure ymd calendar math (no timezone; the ymd is already Karachi) ---
const parse = (s: string) => s.split("-").map(Number) as [number, number, number];
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const [y, m, d] = parse(s); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
const mondayIndex = (s: string) => { const [y, m, d] = parse(s); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };
const firstOfMonth = (s: string) => { const [y, m] = parse(s); return fmt(y, m, 1); };
const addMonths = (s: string, n: number) => { const [y, m] = parse(s); const dt = new Date(Date.UTC(y, m - 1 + n, 1)); return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1); };
const hhmm = (iso: string) => { const p = karachiParts(iso); return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`; };

export function SocialCalendar({ posts, campaigns, authors, countries, canSchedule, canManage }: {
  posts: CalendarPost[];
  campaigns: { id: string; name: string }[];
  authors: { id: string; name: string }[];
  countries: string[];
  canSchedule: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = karachiYmd(new Date().toISOString());
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [filters, setFilters] = useState({ platform: "", status: "", campaign: "", country: "", author: "" });

  const filtered = useMemo(
    () =>
      posts.filter(
        (p) =>
          (!filters.platform || p.platforms.includes(filters.platform as SocialPlatform)) &&
          (!filters.status || p.status === filters.status) &&
          (!filters.campaign || p.campaignName === filters.campaign) &&
          (!filters.country || p.country === filters.country) &&
          (!filters.author || p.authorId === filters.author),
      ),
    [posts, filters],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarPost[]>();
    for (const p of filtered) {
      const day = karachiYmd(p.scheduledAt);
      (m.get(day) ?? m.set(day, []).get(day)!).push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return m;
  }, [filtered]);

  const act = (fn: () => Promise<{ error?: string } | undefined>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else { setSelected(null); router.refresh(); }
    });
  };
  const onDrop = (day: string, postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post || !MOVABLE.includes(post.status) || !canSchedule) return;
    if (karachiYmd(post.scheduledAt) === day) return;
    act(() => rescheduleSocialPost(postId, moveToKarachiDay(post.scheduledAt, day)));
  };

  const Chip = ({ p }: { p: CalendarPost }) => (
    <button
      type="button"
      draggable={canSchedule && MOVABLE.includes(p.status)}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
      onClick={() => setSelected(p)}
      data-cal-post={p.id}
      style={{ borderLeft: `3px solid ${PLATFORM_COLOR[p.platforms[0]] ?? "#999"}` }}
      className={`flex w-full items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] ${STATUS_CLASS[p.status]}`}
      title={`${STATUS_LABEL[p.status]} · ${p.platforms.map((pl) => PLATFORM_LABELS[pl]).join(", ")}`}
    >
      <span className="tabular-nums opacity-70">{hhmm(p.scheduledAt)}</span>
      <span className="truncate">{p.caption?.trim() || "No caption"}</span>
      <span className="ml-auto flex shrink-0 gap-0.5">
        {p.platforms.slice(0, 3).map((pl) => <span key={pl} className="h-1.5 w-1.5 rounded-full" style={{ background: PLATFORM_COLOR[pl] }} />)}
      </span>
    </button>
  );

  const Day = ({ day, muted }: { day: string; muted?: boolean }) => (
    <div
      onDragOver={(e) => { if (canSchedule) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(day, e.dataTransfer.getData("text/plain")); }}
      data-cal-day={day}
      className={`flex min-h-[86px] flex-col gap-0.5 border border-border p-1 ${muted ? "bg-surface-2" : "bg-card"} ${day === today ? "ring-1 ring-inset ring-primary" : ""}`}
    >
      <span className={`text-[11px] ${muted ? "text-muted" : "text-ink"}`}>{parse(day)[2]}</span>
      {(byDay.get(day) ?? []).map((p) => <Chip key={p.id} p={p} />)}
    </div>
  );

  const monthGrid = () => {
    const first = firstOfMonth(anchor);
    const start0 = addDays(first, -mondayIndex(first));
    const [, am] = parse(anchor);
    return (
      <div className="grid grid-cols-7 gap-px" data-cal-month>
        {WEEKDAYS.map((w) => <div key={w} className="px-1 py-1 text-center text-[11px] font-medium text-muted">{w}</div>)}
        {Array.from({ length: 42 }, (_, i) => addDays(start0, i)).map((day) => <Day key={day} day={day} muted={parse(day)[1] !== am} />)}
      </div>
    );
  };
  const weekGrid = () => {
    const start0 = addDays(anchor, -mondayIndex(anchor));
    return (
      <div className="grid grid-cols-7 gap-px" data-cal-week>
        {Array.from({ length: 7 }, (_, i) => addDays(start0, i)).map((day) => (
          <div key={day} className="flex flex-col">
            <div className="px-1 py-1 text-center text-[11px] font-medium text-muted">{WEEKDAYS[mondayIndex(day)]} {parse(day)[2]}</div>
            <Day day={day} />
          </div>
        ))}
      </div>
    );
  };
  const listView = () => {
    const days = [...byDay.keys()].sort();
    if (days.length === 0) return <p className="text-sm text-muted">No scheduled posts match these filters.</p>;
    return (
      <div className="flex flex-col gap-3" data-cal-list>
        {days.map((day) => (
          <div key={day}>
            <p className="mb-1 text-xs font-semibold text-ink">{day === today ? "Today · " : ""}{day}</p>
            <div className="flex flex-col gap-1">{(byDay.get(day) ?? []).map((p) => <Chip key={p.id} p={p} />)}</div>
          </div>
        ))}
      </div>
    );
  };

  const title = view === "month" ? `${MONTHS[parse(anchor)[1] - 1]} ${parse(anchor)[0]}` : view === "week" ? `Week of ${addDays(anchor, -mondayIndex(anchor))}` : "All scheduled";
  const step = (dir: -1 | 1) => setAnchor(view === "month" ? addMonths(anchor, dir) : addDays(anchor, dir * 7));

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {view !== "list" && (
            <>
              <button type="button" onClick={() => step(-1)} className="rounded border border-border px-2 py-1 text-xs text-ink hover:bg-bg">←</button>
              <button type="button" onClick={() => setAnchor(today)} className="rounded border border-border px-2 py-1 text-xs text-ink hover:bg-bg">Today</button>
              <button type="button" onClick={() => step(1)} className="rounded border border-border px-2 py-1 text-xs text-ink hover:bg-bg">→</button>
            </>
          )}
          <span className="text-sm font-medium text-ink" data-cal-title>{title}</span>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["month", "week", "list"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${view === v ? "bg-primary text-primary-ink" : "text-muted hover:text-ink"}`} data-view={v}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2" data-cal-filters>
        <FilterSelect value={filters.platform} onChange={(v) => setFilters((f) => ({ ...f, platform: v }))} label="All platforms" options={(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
        <FilterSelect value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} label="Any status" options={(Object.keys(STATUS_LABEL) as PostStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        {campaigns.length > 0 && <FilterSelect value={filters.campaign} onChange={(v) => setFilters((f) => ({ ...f, campaign: v }))} label="Any campaign" options={campaigns.map((c) => ({ value: c.name, label: c.name }))} />}
        {countries.length > 0 && <FilterSelect value={filters.country} onChange={(v) => setFilters((f) => ({ ...f, country: v }))} label="Any country" options={countries.map((c) => ({ value: c, label: c }))} />}
        {authors.length > 0 && <FilterSelect value={filters.author} onChange={(v) => setFilters((f) => ({ ...f, author: v }))} label="Any author" options={authors.map((a) => ({ value: a.id, label: a.name }))} />}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {view === "month" ? monthGrid() : view === "week" ? weekGrid() : listView()}

      {/* post detail */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()} data-cal-detail>
            <div className="mb-2 flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-muted hover:text-ink">✕</button>
            </div>
            <p className="text-sm text-ink">{selected.caption?.trim() || <span className="text-muted">No caption</span>}</p>
            <p className="mt-2 text-xs text-muted">
              {selected.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")} · {karachiYmd(selected.scheduledAt)} {hhmm(selected.scheduledAt)} PKT
              {selected.country ? ` · ${selected.country}` : ""}{selected.campaignName ? ` · ${selected.campaignName}` : ""}
              {selected.authorName ? ` · by ${selected.authorName}` : ""}
            </p>
            {canManage && (
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" size="sm" pending={pending} disabled={pending} onClick={() => act(() => duplicateSocialPost(selected.id))}>Duplicate</Button>
                <Button type="button" variant="danger" size="sm" pending={pending} disabled={pending}
                  onClick={() => { if (window.confirm("Delete this post?")) act(() => deleteSocialPost(selected.id)); }}>Delete</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto text-xs">
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
