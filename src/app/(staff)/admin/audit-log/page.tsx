import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { SectionTabs } from "@/components/SectionTabs";
import { Badge } from "@/components/ui/Badge";
import { formatStamp } from "@/lib/activityStamp";
import { AUDIT_TABS, actionTone, actionWord, auditTab, changedFields, fieldLabel, groupByChange, recordLabel, tableLabel } from "@/lib/auditLabels";
import { actorLabel, nameActors, nameIds } from "@/lib/auditNames";
import { AuditTimeline, type TimelineItem } from "./AuditTimeline";

// Everything people change in the portal (0322), by whose it is: a tab for
// each kind — registered students, leads, staff, universities, the rest — and
// in each, one log per person or place. An event opens to show the record
// before, after and as it is now, with the way back: revert an edit, restore
// a deletion, take back an addition.

const SUBJECTS_PER_PAGE = 40;
/** Rows, not lines: one line can be a student deleted with thirty records. */
const EVENTS_PER_PAGE = 100;

type Params = { tab?: string; q?: string; s?: string; p?: string; sp?: string; auto?: string };

type SubjectRow = {
  subject_id: string | null;
  entity: string;
  label: string;
  sublabel: string | null;
  events: number;
  last_at: string;
  deleted: boolean;
};

type EventRow = {
  id: string;
  actor_id: string | null;
  action_type: string;
  entity_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[] | null;
  created_at: string;
  source_event: string | null;
  subject_type: string | null;
  subject_id: string | null;
  internal: boolean;
  txid: number | null;
};

function href(base: Params, change: Partial<Params>): string {
  const merged = { ...base, ...change };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/admin/audit-log?${qs}` : "/admin/audit-log";
}

/** Whose log this is, by name — from the record, or from the log once it is deleted. */
const NAME_OF: Record<string, { table: string; column: string }> = {
  students: { table: "leads", column: "full_name" },
  leads: { table: "leads", column: "full_name" },
  staff: { table: "staff", column: "full_name" },
  universities: { table: "universities", column: "name" },
};

async function subjectName(
  supabase: Awaited<ReturnType<typeof getStaffSession>>["supabase"],
  tabKey: string,
  id: string
): Promise<{ label: string; deleted: boolean } | null> {
  const of = NAME_OF[tabKey];
  if (!of) return null;
  const { data } = await supabase.from(of.table).select(of.column).eq("id", id).maybeSingle();
  const now = (data as Record<string, unknown> | null)?.[of.column];
  if (typeof now === "string") return { label: now, deleted: false };
  const { data: last } = await supabase
    .from("audit_log")
    .select("before, after")
    .eq("entity_type", of.table)
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const was = (last?.after ?? last?.before)?.[of.column];
  return { label: typeof was === "string" ? was : "Unknown", deleted: true };
}

function recordHref(tab: string, id: string): string | null {
  if (tab === "students") return `/students/${id}`;
  if (tab === "leads") return `/leads/${id}`;
  if (tab === "universities") return `/setup/universities/${id}`;
  return null;
}

export default async function AuditLogPage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  if (!staff || !hasRole(staff, "super_admin")) redirect("/dashboard");

  const tab = auditTab(params.tab);
  const q = (params.q ?? "").trim();
  const subjectPage = Math.max(0, Number(params.sp) || 0);
  const eventPage = Math.max(0, Number(params.p) || 0);
  const showAutomatic = params.auto === "1";
  const subject = tab.key === "all" ? null : params.s || null;
  const base: Params = { tab: tab.key, q: q || undefined, s: subject ?? undefined, sp: params.sp, auto: params.auto };

  // The tab's people (or, on the last tab, kinds of record) …
  const subjectsQuery =
    tab.kind === null
      ? Promise.resolve({ data: [] as SubjectRow[], error: null })
      : supabase.rpc("audit_subjects", {
          p_kind: tab.kind,
          p_search: q || null,
          p_limit: SUBJECTS_PER_PAGE + 1,
          p_offset: subjectPage * SUBJECTS_PER_PAGE,
        });

  // … and the log of the one chosen: everything that happened to them, newest first.
  let events = supabase
    .from("audit_log")
    .select("id, actor_id, action_type, entity_type, before, after, changed, created_at, source_event, subject_type, subject_id, internal, txid")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(eventPage * EVENTS_PER_PAGE, eventPage * EVENTS_PER_PAGE + EVENTS_PER_PAGE);
  if (!showAutomatic) events = events.eq("internal", false);
  if (tab.key === "other" && subject) events = events.eq("entity_type", subject).or("subject_type.eq.other,subject_type.is.null");
  else if (subject) events = events.eq("subject_type", tab.kind === "lead" ? "student" : tab.kind!).eq("subject_id", subject);
  const eventsQuery = subject || tab.key === "all" ? events : Promise.resolve({ data: [] as EventRow[], error: null });

  const [{ data: subjectData, error: subjectError }, { data: eventData, error: eventError }, named] = await Promise.all([
    subjectsQuery,
    eventsQuery,
    subject ? subjectName(supabase, tab.key, subject) : Promise.resolve(null),
  ]);
  const subjects = ((subjectData ?? []) as SubjectRow[]).slice(0, SUBJECTS_PER_PAGE);
  const moreSubjects = (subjectData ?? []).length > SUBJECTS_PER_PAGE;
  const rows = ((eventData ?? []) as EventRow[]).slice(0, EVENTS_PER_PAGE);
  const moreEvents = (eventData ?? []).length > EVENTS_PER_PAGE;

  // Who did each thing, and — on All activity — whose each record is.
  const [actors, subjectNames] = await Promise.all([
    nameActors(supabase, rows.map((r) => r.actor_id)),
    tab.key === "all" ? nameIds(supabase, rows.map((r) => r.subject_id).filter((id): id is string => Boolean(id))) : Promise.resolve(new Map<string, string>()),
  ]);

  const items: TimelineItem[] = groupByChange(rows).map(({ main: r, rest }) => {
    const row = r.after ?? r.before;
    const fields = r.action_type === "UPDATE" ? changedFields(r.before, r.after, r.changed).map(fieldLabel) : [];
    return {
      id: r.id,
      action: r.action_type,
      word: actionWord(r.action_type, r.source_event),
      tone: actionTone(r.action_type),
      table: tableLabel(r.entity_type),
      record: recordLabel(r.entity_type, row),
      fields,
      actor: actorLabel(actors, r.actor_id),
      when: formatStamp(r.created_at),
      internal: r.internal,
      whose: tab.key === "all" && r.subject_id && r.entity_type !== "leads" && r.entity_type !== "staff" && r.entity_type !== "universities"
        ? subjectNames.get(r.subject_id) ?? null
        : null,
      more: rest.map((x) => ({
        id: x.id,
        word: actionWord(x.action_type, x.source_event),
        tone: actionTone(x.action_type),
        table: tableLabel(x.entity_type),
        record: recordLabel(x.entity_type, x.after ?? x.before),
      })),
    };
  });

  const chosen = subjects.find((s) => (s.subject_id ?? s.entity) === subject) ?? null;
  const heading =
    tab.key === "all"
      ? "Everything, newest first"
      : tab.key === "other" && subject
        ? tableLabel(subject)
        : (named?.label ?? chosen?.label ?? (subject ? "This record" : null));
  const deleted = named?.deleted ?? chosen?.deleted ?? false;
  const link = subject && tab.key !== "other" ? recordHref(tab.key, subject) : null;

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Audit Log</h2>
      <p className="mb-4 text-sm text-muted">
        Every change made in the portal, by whose record it is. Open a change to see what it was before and what it is now, and to
        revert it, restore what was deleted, or take back what was added. Deleted files are kept for 90 days.
      </p>

      <SectionTabs tabs={AUDIT_TABS.map((t) => ({ key: t.key, label: t.label, href: href({}, { tab: t.key }) }))} active={tab.key} />

      <div className={tab.key === "all" ? "" : "grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]"}>
        {tab.key !== "all" && (
          <section aria-label={tab.label} className="min-w-0">
            <form action="/admin/audit-log" className="mb-2 flex gap-2">
              <input type="hidden" name="tab" value={tab.key} />
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search {tab.label.toLowerCase()}</span>
                <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder={tab.key === "other" ? "Search kinds of record" : tab.key === "staff" || tab.key === "universities" ? "Search by name" : "Name, Student ID or phone"}
                  className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2 text-sm text-ink"
                />
              </label>
              <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm text-ink hover:bg-bg">
                Search
              </button>
            </form>
            {subjectError ? (
              <p className="text-sm text-danger">{subjectError.message}</p>
            ) : subjects.length === 0 ? (
              <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted">
                {q ? "Nothing matches that." : "Nothing has been logged here yet."}
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" data-audit-subjects>
                {subjects.map((s) => {
                  const key = s.subject_id ?? s.entity;
                  const active = key === subject;
                  return (
                    <li key={key}>
                      <Link
                        href={href(base, { s: key, p: undefined })}
                        prefetch={false}
                        aria-current={active ? "true" : undefined}
                        data-audit-subject={key}
                        className={`block px-3 py-2 ${active ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : "hover:bg-bg"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm font-medium ${active ? "text-primary" : "text-ink"}`}>
                            {tab.key === "other" ? tableLabel(s.entity) : s.label}
                          </span>
                          {s.deleted && <Badge tone="danger">Deleted</Badge>}
                        </span>
                        <span className="mt-0.5 flex gap-2 text-xs text-muted">
                          {s.sublabel && <span className="min-w-0 truncate">{s.sublabel}</span>}
                          <span className="ml-auto shrink-0 tabular-nums">
                            {s.events.toLocaleString("en-US")} {s.events === 1 ? "change" : "changes"} · {formatStamp(s.last_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {(subjectPage > 0 || moreSubjects) && (
              <div className="mt-2 flex justify-between text-sm">
                {subjectPage > 0 ? (
                  <Link prefetch={false} href={href(base, { sp: subjectPage > 1 ? String(subjectPage - 1) : undefined })} className="text-primary hover:underline">
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                {moreSubjects && (
                  <Link prefetch={false} href={href(base, { sp: String(subjectPage + 1) })} className="text-primary hover:underline">
                    Next →
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        <section aria-label="Changes" className="min-w-0">
          {heading ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-base font-semibold text-ink" data-audit-heading>
                  {heading}
                </h3>
                {deleted && <Badge tone="danger">Deleted</Badge>}
                {link && !deleted && (
                  <Link prefetch={false} href={link} className="text-sm text-primary hover:underline">
                    Open record
                  </Link>
                )}
                <Link
                  prefetch={false}
                  href={href(base, { auto: showAutomatic ? undefined : "1", p: undefined })}
                  className="ml-auto text-xs text-muted hover:text-ink"
                >
                  {showAutomatic ? "Hide automatic changes" : "Show automatic changes too"}
                </Link>
              </div>
              {eventError ? (
                <p className="text-sm text-danger">{eventError.message}</p>
              ) : (
                <AuditTimeline items={items} />
              )}
              {(eventPage > 0 || moreEvents) && (
                <div className="mt-2 flex justify-between text-sm">
                  {eventPage > 0 ? (
                    <Link prefetch={false} href={href(base, { p: eventPage > 1 ? String(eventPage - 1) : undefined })} className="text-primary hover:underline">
                      ← Newer
                    </Link>
                  ) : (
                    <span />
                  )}
                  {moreEvents && (
                    <Link prefetch={false} href={href(base, { p: String(eventPage + 1) })} className="text-primary hover:underline">
                      Older →
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              Choose {tab.key === "other" ? "a kind of record" : tab.key === "universities" ? "a university" : "someone"} to see everything that
              happened to {tab.key === "other" ? "it" : tab.key === "universities" ? "it" : "them"}.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
