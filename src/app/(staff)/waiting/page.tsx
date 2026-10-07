import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { loadStaffQueue } from "@/lib/staffQueue";
import { scopeQueue } from "@/lib/dashboards/queueScope";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemLink, KIND_ICON } from "@/components/StaffQueueCard";
import { WAITING_KINDS, filterItems, groupByStudent, kindCounts, parseKind, type WaitingItem } from "@/lib/waitingItems";

/**
 * Everything waiting on whoever is looking, by student.
 *
 * The dashboard's "Waiting on you" names the first few of each kind; this is
 * all of them. Each item opens where it is dealt with — a document on the
 * student's Documents tab with its section open and the row picked out, a
 * task at its row on the application, a ticket in its thread — and a
 * document opened from here is marked seen (0305), so the next officer can
 * see somebody is on it.
 *
 * Open to every signed-in member of staff, like the dashboard: what it lists
 * is already only what this person can see and whose job it is (RLS, then
 * queueScope), so a role with nothing waiting simply finds an empty page.
 */
export default async function WaitingPage(props: PageProps<"/waiting">) {
  const [{ kind: kindParam, mine: mineParam }, { supabase, staff }] = await Promise.all([props.searchParams, getStaffSession()]);
  const kind = parseKind(typeof kindParam === "string" ? kindParam : null);
  const mine = mineParam === "1";

  const perms = await getEffectivePermissions();
  const all = scopeQueue(await loadStaffQueue(supabase, { canApproveLeave: perms["leave.approve"] === true }), staff).items;
  // The counts on the chips follow the Mine filter, so a chip never promises
  // items the list then does not show.
  const counts = kindCounts(filterItems(all, { mine }));
  const shown = filterItems(all, { kind, mine });
  const groups = groupByStudent(shown);

  const href = (k: string | null, m: boolean) => {
    const q = new URLSearchParams();
    if (k) q.set("kind", k);
    if (m) q.set("mine", "1");
    const s = q.toString();
    return s ? `/waiting?${s}` : "/waiting";
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"}`;
  const kindLabel = kind ? WAITING_KINDS.find((w) => w.kind === kind)!.short.toLowerCase() : null;

  return (
    <div className="w-full" data-waiting-page>
      <Link prefetch={false} href="/dashboard" className="text-sm text-muted hover:text-ink">
        &larr; Dashboard
      </Link>
      <h2 className="mt-2 mb-1 text-xl font-semibold text-ink">Waiting on you</h2>
      <p className="mb-4 text-sm text-muted">
        Everything waiting on you, by student. Open takes you to where it is dealt with; a document opened here is marked as
        under review, with your name, until it is accepted or sent back.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link prefetch={false} href={href(null, mine)} className={chip(kind === null)} data-waiting-filter="all">
          Everything ({filterItems(all, { mine }).length})
        </Link>
        {counts.map((c) => (
          <Link prefetch={false} key={c.kind} href={href(c.kind, mine)} className={chip(kind === c.kind)} data-waiting-filter={c.kind}>
            {c.short} ({c.count})
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Link prefetch={false} href={href(kind, !mine)} className={chip(mine)} data-waiting-mine={mine ? "on" : "off"} aria-pressed={mine}>
          {mine ? "Mine only ✓" : "Mine only"}
        </Link>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState>
            {kind || mine
              ? `Nothing ${kindLabel ? `in ${kindLabel} ` : ""}is waiting on you${mine ? " among your own students" : ""}.`
              : "Nothing is waiting on you."}
          </EmptyState>
          {(kind || mine) && (
            <p className="mt-2 text-center text-xs">
              <Link prefetch={false} href="/waiting" className="text-primary hover:underline">
                See everything
              </Link>
            </p>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Card key={g.studentId ?? "none"} className="p-4" >
              <div data-waiting-student={g.studentId ?? "none"}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  {g.studentId ? (
                    <Link prefetch={false} href={`/students/${g.studentId}`} className="text-sm font-semibold text-ink hover:underline">
                      {g.studentName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-ink">{g.studentName}</span>
                  )}
                  <span className="text-xs text-muted">
                    {g.items.length} waiting
                    {g.items.some((i) => i.mine) && g.studentId && <span className="ml-2"><Badge tone="info">yours</Badge></span>}
                  </span>
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {g.items.map((item) => (
                    <WaitingRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WaitingRow({ item }: { item: WaitingItem }) {
  const Icon = KIND_ICON[item.kind];
  const kindName = WAITING_KINDS.find((w) => w.kind === item.kind)!.short;
  return (
    <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-waiting-row={`${item.kind}:${item.id}`}>
      <span className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${item.urgent ? "text-warning" : "text-muted"}`} />
        <span className="min-w-0">
          <ItemLink item={item} className={`block text-sm hover:underline ${item.urgent ? "font-medium text-warning" : "text-ink"}`}>
            {item.title}
          </ItemLink>
          <span className="block text-xs text-muted">
            {kindName}
            {item.detail && <> · {item.detail}</>}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
        {item.kind === "document" &&
          (item.opened ? (
            <span data-waiting-opened>
              <Badge tone="info">
                Opened by {item.opened.by}
                {item.opened.ago ? ` · ${item.opened.ago}` : ""}
              </Badge>
            </span>
          ) : (
            <Badge tone="warning">New</Badge>
          ))}
        <ItemLink
          item={item}
          className="inline-flex items-center rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open
        </ItemLink>
      </span>
    </div>
  );
}
