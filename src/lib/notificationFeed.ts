// What the bell and the dashboards list for whoever is signed in: their
// to-dos, worked out from the live records (the staff queue, the student
// summary, the partner's applications), and what happened (notifications,
// 0320). Read through the viewer's own session, so RLS decides what is theirs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { loadStaffQueue } from "@/lib/staffQueue";
import { scopeQueue } from "@/lib/dashboards/queueScope";
import { countLine, sortItems, splitOwnAndOffice, type WaitingItem } from "@/lib/waitingItems";
import { loadPortalSummary } from "@/lib/portalSummary";
import { studentTodos } from "@/lib/studentTodos";
import { summarizePartner, type PartnerApp } from "@/lib/dashboards/partner";
import { karachiToday } from "@/lib/calendarDates";
import { homeOf, type Audience, type NotificationRow } from "@/lib/notificationText";

export const NEWS_COLUMNS = "id, kind, title, title_many, body, link, link_many, count, read_at, updated_at";

/** One thing to do, as the bell lists it. `icon` is a key the bell draws. */
export type BellTodo = {
  key: string;
  icon: string;
  text: string;
  detail: string | null;
  href: string;
  urgent: boolean;
  /** Opened by a plain link: /waiting/open marks a document seen on the way. */
  plain?: boolean;
};

export type BellFeed = {
  audience: Audience;
  home: string;
  /** Unread news. */
  unread: number;
  news: NotificationRow[];
  /** When the news was read. */
  now: number;
  /** The first of the viewer's own to-dos, most pressing first. */
  todos: BellTodo[];
  /** How many to-dos in all. */
  todoCount: number;
  /** Super Admin and Management: the rest of the office, one line a kind. */
  office: BellTodo[];
};

const TODOS_SHOWN = 8;

/** The viewer's news: the latest, and how many are unread. */
export async function loadNews(supabase: SupabaseClient, limit = 20): Promise<{ news: NotificationRow[]; unread: number; now: number }> {
  const [list, unread] = await Promise.all([
    supabase.from("notifications").select(NEWS_COLUMNS).eq("feed", true).order("updated_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("feed", true).is("read_at", null),
  ]);
  // Read here, once: "5 min ago" is worked out from it, and a component may not read the clock.
  return { news: (list.data ?? []) as NotificationRow[], unread: unread.count ?? 0, now: Date.now() };
}

function staffTodo(item: WaitingItem): BellTodo {
  const who = item.studentName && item.kind !== "message" ? `${item.studentName} — ` : "";
  return {
    key: `${item.kind}:${item.id}`,
    icon: item.kind,
    text: item.kind === "message" ? `${item.studentName ?? "A student"} is waiting on a reply` : `${who}${item.title}`,
    detail: item.opened ? `opened by ${item.opened.by}` : item.detail,
    href: item.href,
    urgent: item.urgent,
    plain: item.kind === "document",
  };
}

/** Everything the bell shows, for whoever is signed in; null for nobody. */
export async function loadBellFeed({ newsLimit = 12 }: { newsLimit?: number } = {}): Promise<BellFeed | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const [{ data: staff }, { data: student }, { data: partner }, news] = await Promise.all([
    supabase.from("staff").select("id, role, roles, status").eq("id", user.id).maybeSingle(),
    supabase.from("leads").select("id").eq("auth_user_id", user.id).maybeSingle(),
    supabase.from("partner_university_accounts").select("id, status").eq("id", user.id).maybeSingle(),
    loadNews(supabase, newsLimit),
  ]);

  if (staff && staff.status === "active") {
    const perms = await getEffectivePermissions();
    const queue = scopeQueue(await loadStaffQueue(supabase, { canApproveLeave: perms["leave.approve"] === true }), staff);
    const officeTotals = hasRole(staff, "management", "super_admin");
    const { own, office } = splitOwnAndOffice(queue.items, officeTotals);
    const ordered = sortItems(own);
    return {
      audience: "staff",
      home: homeOf("staff"),
      ...news,
      todos: ordered.slice(0, TODOS_SHOWN).map(staffTodo),
      todoCount: ordered.length,
      office: office.map(({ kind, count }) => ({
        key: `office:${kind}`,
        icon: kind,
        text: countLine(kind, count),
        detail: "across the office",
        href: `/waiting?kind=${kind}`,
        urgent: false,
      })),
    };
  }

  if (partner && partner.status === "active") {
    const { data: apps } = await supabase.rpc("get_partner_applications");
    const rows = ((apps ?? []) as PartnerApp[]).map((a) => ({ ...a, pipeline_stages: Array.isArray(a.pipeline_stages) ? a.pipeline_stages : [] }));
    const summary = summarizePartner({ apps: rows, commissions: [], today: karachiToday() });
    const todos: BellTodo[] = summary.awaitingDecision.map((a) => ({
      key: `decide:${a.id}`,
      icon: "decide",
      text: a.label,
      detail: `awaiting your decision · ${a.days === 0 ? "today" : `${a.days} day${a.days === 1 ? "" : "s"}`}`,
      href: `/partner/applications/${a.id}`,
      urgent: a.days >= 14,
    }));
    return { audience: "partner", home: homeOf("partner"), ...news, todos: todos.slice(0, TODOS_SHOWN), todoCount: summary.awaitingCount, office: [] };
  }

  if (student) {
    const summary = await loadPortalSummary(supabase, student.id as string);
    // Messages and ticket replies are in What's new; listed once.
    const todos = studentTodos(summary)
      .filter((t) => !t.news)
      .map((t) => ({ key: t.key, icon: t.key, text: t.text, detail: t.detail ?? null, href: t.href, urgent: Boolean(t.urgent) }));
    return { audience: "student", home: homeOf("student"), ...news, todos, todoCount: todos.length, office: [] };
  }

  return null;
}

