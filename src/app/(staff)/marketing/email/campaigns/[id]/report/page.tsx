import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionTabs } from "@/components/SectionTabs";
import { campaignStats, pct } from "@/lib/emailCampaigns/campaignData";
import { breakdown, campaignDaily, campaignTimeline, COMPARED_RATES, earlierComparison, linkReport, recipientEvents, recipientPage, webReport, webSessions } from "@/lib/emailCampaigns/reportData";
import {
  fillHours,
  filterLabel,
  recipientFilter,
  recipientOutcome,
  RECIPIENT_FILTERS,
  timelineHours,
  daysSince,
  fillDays,
  durationText,
  type RecipientFilter,
} from "@/lib/emailCampaigns/reportRules";
import { clickMapHtml } from "@/lib/emailCampaigns/render";
import { previewValues, readSendingSettings } from "@/lib/emailCampaigns/server";
import { EmailTabs, karachiTime } from "../../../EmailTabs";
import { STATUS } from "../../campaignStatus";
import { BarTable, DayChart, Funnel, Kpi, TimelineChart } from "./ReportParts";
import { FollowUpTasksForm, MakeListForm } from "./ReportClient";
import { loadTaskPeople } from "@/lib/staffTasksLoad";
import { karachiDay } from "@/lib/emailCampaigns/sendingRules";

const TABS = ["overview", "recipients", "links", "deliverability", "website"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", recipients: "Recipients", links: "Links", deliverability: "Deliverability", website: "Website" };
const PAGE_SIZE = 50;

/** Two Karachi days from now, for a follow-up's due date. */
function dueInTwoDays(): string {
  return karachiDay(new Date(Date.now() + 2 * 86_400_000));
}

const rate = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function CampaignReportPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(one("tab")) ? (one("tab") as Tab) : "overview";

  const { supabase } = await getStaffSession();
  const [{ data: c }, canReports, canAudience] = await Promise.all([
    supabase.from("email_campaigns").select("id, name, subject, status, practice, started_at, finished_at, recipients_total, prepared_html, from_name").eq("id", id).maybeSingle(),
    hasPermission("email.reports.view"),
    hasPermission("email.audience.manage"),
  ]);
  if (!c) notFound();
  const base = `/marketing/email/campaigns/${id}/report`;
  const st = STATUS[c.status as string] ?? STATUS.draft;

  const header = (
    <>
      <Link prefetch={false} href={`/marketing/email/campaigns/${id}`} className="mb-2 inline-block text-xs text-primary hover:underline">
        ← The campaign
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Report: {c.name as string}</h2>
        <Badge tone={st.tone}>{st.label}</Badge>
        {c.practice && <Badge tone="warning">Practice — nothing was sent</Badge>}
        {canReports && c.started_at && (
          <a href={`${base}/pdf`} className="ml-auto text-xs text-primary hover:underline" data-report-pdf>
            Download PDF summary
          </a>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">
        {c.subject as string} · started {karachiTime(c.started_at as string)}
        {c.finished_at ? ` · finished ${karachiTime(c.finished_at as string)}` : ""}
      </p>
      <EmailTabs active="campaigns" />
    </>
  );

  if (!canReports) {
    return (
      <div className="w-full">
        {header}
        <Card>
          <p className="text-sm text-muted">Only someone allowed to see email reports can see what people did with it.</p>
        </Card>
      </div>
    );
  }
  if (!c.started_at) {
    return (
      <div className="w-full">
        {header}
        <Card>
          <p className="text-sm text-muted">It has not been sent yet, so there is nothing to report.</p>
        </Card>
      </div>
    );
  }

  const stats = (await campaignStats(supabase, [id])).get(id)!;
  const bounced = stats.hard_bounces + stats.soft_bounces;
  const base100 = stats.delivered || stats.sent;

  let body: React.ReactNode = null;

  if (tab === "overview") {
    const started = new Date(c.started_at as string);
    const hours = timelineHours(started);
    // Hour by hour for the first 72 hours; after that, day by day as well.
    const days = daysSince(started);
    const firstDay = karachiDay(started);
    const [points, { comparison: cmp, count: earlierCount }, dayPoints] = await Promise.all([
      campaignTimeline(supabase, id, started, hours),
      earlierComparison(supabase, { id, practice: Boolean(c.practice), started_at: c.started_at as string }, stats),
      days > 3 ? campaignDaily(supabase, id, new Date(`${firstDay}T00:00:00+05:00`), days) : Promise.resolve(null),
    ]);
    const machineOnly = stats.opened_any - stats.opened_human;
    body = (
      <div className="flex flex-col gap-6">
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-report-kpis>
            <Kpi label="Sent" value={stats.sent.toLocaleString("en-US")} sub={stats.failed ? `${stats.failed} could not be sent` : undefined} />
            <Kpi label="Delivered" value={pct(stats.delivered, stats.sent)} sub={`${stats.delivered.toLocaleString("en-US")} people`} />
            <Kpi label="Opened (people)" value={pct(stats.opened_human, base100)} sub={`${stats.opened_human.toLocaleString("en-US")} people`} />
            <Kpi label="Clicked (people)" value={pct(stats.clicked_human, base100)} sub={`${stats.clicked_human.toLocaleString("en-US")} people`} />
            <Kpi label="Clicked, of openers" value={pct(stats.clicked_human, stats.opened_human)} />
            <Kpi label="Visited the website" value={stats.visited.toLocaleString("en-US")} sub={pct(stats.visited, base100) + " of those reached"} />
            <Kpi label="Converted" value={stats.converted.toLocaleString("en-US")} sub={pct(stats.converted, base100) + " of those reached"} tone={stats.converted ? "good" : undefined} />
            <Kpi label="Bounced" value={pct(bounced, stats.sent)} sub={`${stats.hard_bounces} for good, ${stats.soft_bounces} for now`} tone={stats.sent >= 100 && bounced / stats.sent > 0.05 ? "warn" : undefined} />
            <Kpi label="Unsubscribed" value={stats.unsubscribes.toLocaleString("en-US")} sub={pct(stats.unsubscribes, base100)} />
            <Kpi label="Marked as spam" value={stats.complaints.toLocaleString("en-US")} sub={pct(stats.complaints, base100)} tone={stats.complaints && stats.sent >= 100 && stats.complaints / stats.sent > 0.001 ? "warn" : undefined} />
          </div>
          {machineOnly > 0 && (
            <p className="mt-3 text-xs text-muted" data-report-machine>
              {machineOnly.toLocaleString("en-US")} more were “opened” only by a machine — Apple Mail’s privacy proxy or a security scanner fetching the
              images — and are not counted as opens.
            </p>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-medium text-ink">From inbox to website</h3>
            <Funnel
              steps={[
                { label: "Sent", value: stats.sent },
                { label: "Delivered", value: stats.delivered },
                { label: "Opened", value: stats.opened_human },
                { label: "Clicked", value: stats.clicked_human },
                { label: "Visited the website", value: stats.visited },
                { label: "Converted", value: stats.converted },
              ]}
            />
          </Card>
          <Card>
            <h3 className="mb-1 text-sm font-medium text-ink">Compared with earlier campaigns</h3>
            <p className="mb-3 text-[11px] text-muted">
              {earlierCount
                ? `The average of the ${earlierCount} ${c.practice ? "practice " : ""}campaign${earlierCount === 1 ? "" : "s"} before it, each counted once.`
                : `No earlier ${c.practice ? "practice " : ""}campaign to compare with yet.`}
            </p>
            <table className="w-full text-left text-xs" data-report-compare>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium" />
                  <th className="py-1 pr-3 text-right font-medium">This one</th>
                  <th className="py-1 pr-3 text-right font-medium">Earlier</th>
                  <th className="py-1 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARED_RATES.map(([label, key, higherIsBetter]) => {
                  const r = cmp[key];
                  const better = r.points === null || r.points === 0 ? null : higherIsBetter ? r.points > 0 : r.points < 0;
                  return (
                    <tr key={key}>
                      <td className="py-1.5 pr-3 text-ink">{label}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{rate(r.value)}</td>
                      <td className="py-1.5 pr-3 text-right text-muted">{rate(r.average)}</td>
                      <td className={`py-1.5 text-right ${better === null ? "text-muted" : better ? "text-success" : "text-danger"}`}>
                        {r.points === null ? "—" : `${r.points > 0 ? "+" : ""}${r.points.toFixed(1)} pts`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">When people opened and clicked{dayPoints ? " — the first 72 hours" : ""}</h3>
          <TimelineChart points={fillHours(points, started, hours)} />
        </Card>
        {dayPoints && (
          <Card>
            <h3 className="mb-3 text-sm font-medium text-ink">Day by day</h3>
            <DayChart points={fillDays(dayPoints, firstDay, days)} />
          </Card>
        )}
      </div>
    );
  }

  if (tab === "recipients") {
    const filter: RecipientFilter = recipientFilter(one("filter"));
    const search = one("q");
    const page = Math.max(0, Number.parseInt(one("page") || "0", 10) || 0);
    const rid = one("r");
    const [{ rows, total }, detail, people] = await Promise.all([
      recipientPage(supabase, id, { filter, search, page, size: PAGE_SIZE }),
      /^[0-9a-f-]{36}$/.test(rid) ? Promise.all([supabase.from("email_campaign_recipients").select("id, email, merge_values").eq("id", rid).eq("campaign_id", id).maybeSingle(), recipientEvents(supabase, rid)]) : null,
      loadTaskPeople(supabase),
    ]);
    const known: Partial<Record<RecipientFilter, number>> = {
      all: stats.sent,
      delivered: stats.delivered,
      opened: stats.opened_human,
      clicked: stats.clicked_human,
      visited: stats.visited,
      converted: stats.converted,
      bounced,
      unsubscribed: stats.unsubscribes,
      complained: stats.complaints,
      failed: stats.failed,
    };
    const qs = (over: Record<string, string | number>) => {
      const p = new URLSearchParams({ tab: "recipients", filter, ...(search ? { q: search } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
      for (const [k, v] of [...p.entries()]) if (v === "" || (k === "page" && v === "0") || (k === "filter" && v === "all")) p.delete(k);
      return `${base}?${p.toString()}`;
    };
    const exportQs = new URLSearchParams({ filter, ...(search ? { q: search } : {}) }).toString();
    const name = (m: Record<string, string | null> | null) => m?.full_name || [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "";
    body = (
      <div className="flex flex-col gap-6">
        {detail && detail[0].data && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink">
                {name(detail[0].data.merge_values as never) || detail[0].data.email} <span className="font-normal text-muted">{detail[0].data.email}</span>
              </h3>
              <Link prefetch={false} href={qs({ r: "" })} className="text-xs text-primary hover:underline">
                Close
              </Link>
            </div>
            <ol className="flex flex-col gap-1 text-xs" data-recipient-timeline>
              {detail[1].map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 border-l-2 border-border pl-2">
                  <span className="w-36 text-muted">{karachiTime(e.occurred_at)}</span>
                  <span className="font-medium text-ink">{e.type.replace(/_/g, " ")}</span>
                  {e.url && <span className="max-w-md truncate text-muted">{e.url}</span>}
                  {[e.client, e.device, [e.ip_city, e.ip_country].filter(Boolean).join(", ")].filter(Boolean).length > 0 && (
                    <span className="text-muted">· {[e.client, e.device, [e.ip_city, e.ip_country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                  )}
                  {e.is_machine && <Badge tone="neutral">machine</Badge>}
                  {e.simulated && <Badge tone="warning">simulated</Badge>}
                  {e.diagnostic && <span className="text-muted">— {e.diagnostic}</span>}
                </li>
              ))}
              {!detail[1].length && <li className="text-muted">Nothing recorded yet.</li>}
            </ol>
          </Card>
        )}
        <Card>
          <div className="mb-3 flex flex-wrap gap-1.5" data-recipient-filters>
            {RECIPIENT_FILTERS.map((f) => (
              <Link
                key={f.key}
                prefetch={false}
                href={qs({ filter: f.key, page: 0, r: "" })}
                className={`rounded-full border px-2.5 py-1 text-xs ${f.key === filter ? "border-primary bg-primary text-white" : "border-border text-ink hover:border-primary"}`}
              >
                {f.label}
                {known[f.key] !== undefined ? ` · ${known[f.key]!.toLocaleString("en-US")}` : ""}
              </Link>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <form method="get" action={base} className="flex items-end gap-2">
              <input type="hidden" name="tab" value="recipients" />
              {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
              <label className="flex flex-col gap-1 text-xs text-muted">
                Find an address
                <input name="q" defaultValue={search} className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink" placeholder="name@example.com" />
              </label>
              <button type="submit" className="rounded-md border border-border px-3 py-1 text-sm text-ink hover:border-primary">
                Find
              </button>
            </form>
            <div className="flex gap-3 text-xs">
              <a href={`${base}/export?format=csv&${exportQs}`} className="text-primary hover:underline" data-export-csv>
                Export CSV
              </a>
              <a href={`${base}/export?format=xlsx&${exportQs}`} className="text-primary hover:underline" data-export-xlsx>
                Export Excel
              </a>
            </div>
          </div>
          <p className="mb-2 text-xs text-muted" data-recipient-total>
            {total.toLocaleString("en-US")} {filterLabel(filter).toLowerCase()}
            {search ? ` matching “${search}”` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-recipient-table>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Recipient</th>
                  <th className="py-1 pr-3 font-medium">What they did</th>
                  <th className="py-1 pr-3 text-right font-medium">Opens</th>
                  <th className="py-1 pr-3 text-right font-medium">Clicks</th>
                  <th className="py-1 pr-3 font-medium">Last activity</th>
                  <th className="py-1 pr-3 font-medium">Where, on what</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3">
                      <Link prefetch={false} href={qs({ r: r.id, page })} className="font-medium text-ink hover:text-primary">
                        {r.email}
                      </Link>
                      <p className="text-muted">
                        {name(r.merge_values)}
                        {r.lead_id && (
                          <>
                            {" "}
                            ·{" "}
                            <Link prefetch={false} href={`/leads/${r.lead_id}`} className="text-primary hover:underline">
                              lead
                            </Link>
                          </>
                        )}
                      </p>
                    </td>
                    <td className="py-1.5 pr-3 text-ink">
                      {recipientOutcome(r)}
                      {r.bounce_reason && <p className="text-muted">{r.bounce_reason}</p>}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-ink">
                      {r.human_open_count}
                      {r.open_count > r.human_open_count && <span className="text-muted"> (+{r.open_count - r.human_open_count})</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-ink">
                      {r.human_click_count}
                      {r.click_count > r.human_click_count && <span className="text-muted"> (+{r.click_count - r.human_click_count})</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{karachiTime(r.last_activity_at)}</td>
                    <td className="py-1.5 pr-3 text-muted">{[r.city, r.country].filter(Boolean).join(", ") || "—"}{r.client ? ` · ${r.client}` : ""}{r.device ? ` · ${r.device}` : ""}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted">
                      Nobody here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">In brackets: opens and clicks by machines (mail privacy proxies, link scanners), not counted as the person’s.</p>
          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              {page > 0 && (
                <Link prefetch={false} href={qs({ page: page - 1 })} className="text-primary hover:underline">
                  ← Previous
                </Link>
              )}
              <span className="text-muted">
                {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total.toLocaleString("en-US")}
              </span>
              {(page + 1) * PAGE_SIZE < total && (
                <Link prefetch={false} href={qs({ page: page + 1 })} className="text-primary hover:underline">
                  Next →
                </Link>
              )}
            </div>
          )}
        </Card>
        {!search && filter !== "all" && (
          <Card>
            <FollowUpTasksForm
              campaignId={id}
              filter={filter}
              filterLabel={filterLabel(filter)}
              count={total}
              defaultTitle={`Follow up: ${c.name as string}`.slice(0, 200)}
              defaultDue={dueInTwoDays()}
              people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.full_name }))}
            />
          </Card>
        )}
        {canAudience && !search && (
          <Card>
            <MakeListForm campaignId={id} filter={filter} filterLabel={filterLabel(filter)} count={total} />
          </Card>
        )}
      </div>
    );
  }

  if (tab === "links") {
    const [links, sample] = await Promise.all([linkReport(supabase, id), previewValues(supabase, null)]);
    const clickers = Math.max(1, stats.clicked_human);
    const counts = Object.fromEntries(links.map((l) => [l.pos, { people: l.people, share: pct(l.people, clickers) }]));
    body = (
      <div className="flex flex-col gap-6">
        <Card>
          <h3 className="mb-1 text-sm font-medium text-ink">Each link</h3>
          <p className="mb-3 text-[11px] text-muted">People who clicked it, and their share of everyone who clicked anything. Scanner clicks are counted apart.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-link-table>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">Link</th>
                  <th className="py-1 pr-3 text-right font-medium">People</th>
                  <th className="py-1 pr-3 text-right font-medium">Share</th>
                  <th className="py-1 pr-3 text-right font-medium">Clicks</th>
                  <th className="py-1 pr-3 text-right font-medium">By machines</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {links.map((l) => (
                  <tr key={l.link_id}>
                    <td className="py-1.5 pr-3 text-muted">{l.pos}</td>
                    <td className="py-1.5 pr-3">
                      <p className="text-ink">{l.label || "(no text)"}</p>
                      <p className="max-w-[32rem] truncate text-muted" title={l.url}>
                        {l.url}
                      </p>
                    </td>
                    <td className="py-1.5 pr-3 text-right text-ink">{l.people.toLocaleString("en-US")}</td>
                    <td className="py-1.5 pr-3 text-right text-ink">{pct(l.people, clickers)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink">{l.human_clicks.toLocaleString("en-US")}</td>
                    <td className="py-1.5 pr-3 text-right text-muted">{(l.clicks - l.human_clicks).toLocaleString("en-US")}</td>
                  </tr>
                ))}
                {!links.length && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted">
                      It had no tracked links.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        {c.prepared_html && (
          <Card>
            <h3 className="mb-1 text-sm font-medium text-ink">Click map</h3>
            <p className="mb-3 text-[11px] text-muted">The email as sent, with each link’s share of the people who clicked — and how many.</p>
            <iframe
              title="Click map"
              sandbox=""
              srcDoc={clickMapHtml(c.prepared_html as string, sample.values, counts)}
              className="h-[42rem] w-full rounded-md border border-border bg-white"
              data-click-map
            />
          </Card>
        )}
      </div>
    );
  }

  if (tab === "deliverability") {
    const [reasons, bounceDomains, domains, clients, devices, countries, cities] = await Promise.all([
      breakdown(supabase, id, "bounce_reason"),
      breakdown(supabase, id, "bounce_domain"),
      breakdown(supabase, id, "domain"),
      breakdown(supabase, id, "client"),
      breakdown(supabase, id, "device"),
      breakdown(supabase, id, "country"),
      breakdown(supabase, id, "city"),
    ]);
    const share = (rows: { recipients: number }[]) => rows.reduce((s, r) => s + r.recipients, 0);
    const people = (rows: typeof clients) => rows.map((r) => ({ key: r.key, value: r.recipients, cells: [r.recipients, pct(r.recipients, share(rows))] }));
    body = (
      <div className="flex flex-col gap-6">
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Delivered" value={pct(stats.delivered, stats.sent)} sub={`${stats.delivered.toLocaleString("en-US")} of ${stats.sent.toLocaleString("en-US")}`} />
            <Kpi label="Bounced for good" value={stats.hard_bounces.toLocaleString("en-US")} sub="never emailed again" />
            <Kpi label="Bounced for now" value={stats.soft_bounces.toLocaleString("en-US")} sub="three in a row and they stop" />
            <Kpi label="Marked as spam" value={stats.complaints.toLocaleString("en-US")} sub="never emailed again" />
          </div>
          {stats.delivered === 0 && stats.sent > 0 && !c.practice && (
            <p className="mt-3 text-xs text-muted">Deliveries are reported by the sending service; none have come in yet.</p>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <BarTable title="Why emails bounced" dataAttr="bounce-reasons" columns={["Reason", "Emails"]} rows={reasons.map((r) => ({ key: r.key, value: r.recipients, cells: [r.recipients] }))} empty="Nothing bounced." />
          </Card>
          <Card>
            <BarTable title="Bounces by email provider" columns={["Domain", "Bounced", "Of all sent there"]} rows={bounceDomains.map((r) => ({ key: r.key, value: r.recipients, cells: [r.recipients, pct(r.recipients, domains.find((d) => d.key === r.key)?.recipients ?? 0)] }))} empty="Nothing bounced." />
          </Card>
        </div>
        <Card>
          <BarTable
            title="By email provider"
            dataAttr="domains"
            columns={["Domain", "Sent", "Delivered", "Opened", "Clicked", "Bounced"]}
            rows={domains.slice(0, 15).map((r) => ({ key: r.key, value: r.recipients, cells: [r.recipients, pct(r.delivered, r.recipients), pct(r.opened, r.delivered || r.recipients), pct(r.clicked, r.delivered || r.recipients), pct(r.bounced, r.recipients)] }))}
          />
        </Card>
        <p className="-mb-3 text-[11px] text-muted">Mail apps, devices and places are of the people who opened it — machines are left out.</p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
          <Card>
            <BarTable title="Mail apps" dataAttr="clients" columns={["App", "People", "Share"]} rows={people(clients)} />
          </Card>
          <Card>
            <BarTable title="Devices" columns={["Device", "People", "Share"]} rows={people(devices)} />
          </Card>
          <Card>
            <BarTable title="Countries" columns={["Country", "People", "Share"]} rows={people(countries)} />
          </Card>
          <Card>
            <BarTable title="Cities" columns={["City", "People", "Share"]} rows={people(cities.slice(0, 15))} />
          </Card>
        </div>
      </div>
    );
  }

  if (tab === "website") {
    const [web, sending, sessions] = await Promise.all([webReport(supabase, id), readSendingSettings(supabase), webSessions(supabase, id)]);
    const pages = web.filter((w) => w.kind === "page");
    const conversions = web.filter((w) => w.kind === "conversion");
    const label = (key: string) => sending.conversion_events.find((e) => e.key === key)?.label ?? key;
    const pageViews = pages.reduce((s, p) => s + p.events, 0);
    body = (
      <div className="flex flex-col gap-6">
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-website-kpis>
            <Kpi label="Visited the website" value={stats.visited.toLocaleString("en-US")} sub={`${pct(stats.visited, stats.clicked_human)} of those who clicked`} />
            <Kpi label="Pages seen" value={pageViews.toLocaleString("en-US")} sub={stats.visited ? `${(pageViews / stats.visited).toFixed(1)} a visitor` : undefined} />
            <Kpi label="Pages a visit" value={sessions.visits ? (sessions.pageViews / sessions.visits).toFixed(1) : "—"} sub={`${sessions.visits.toLocaleString("en-US")} visit${sessions.visits === 1 ? "" : "s"}`} />
            <Kpi
              label="Time on site"
              value={durationText(sessions.avgSeconds)}
              sub={sessions.multiPageVisits ? `average of the ${sessions.multiPageVisits.toLocaleString("en-US")} visit${sessions.multiPageVisits === 1 ? "" : "s"} of 2+ pages` : "needs a visit of 2+ pages"}
            />
            <Kpi label="Converted" value={stats.converted.toLocaleString("en-US")} sub={`${pct(stats.converted, stats.visited)} of visitors`} tone={stats.converted ? "good" : undefined} />
            <Kpi label="Conversions" value={conversions.reduce((s, x) => s + x.events, 0).toLocaleString("en-US")} />
          </div>
          {!stats.visited && (
            <p className="mt-3 text-xs text-muted">
              Visits are reported by the website script; Settings › Website tracking shows the line to add to hmarkconsultants.com.
            </p>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <BarTable title="Pages they saw" dataAttr="web-pages" columns={["Page", "Views", "People"]} rows={pages.map((p) => ({ key: p.key, value: p.events, cells: [p.events, p.people] }))} empty="No visits yet." />
          </Card>
          <Card>
            <BarTable title="What they did" dataAttr="web-conversions" columns={["Conversion", "Times", "People"]} rows={conversions.map((p) => ({ key: label(p.key), value: p.events, cells: [p.events, p.people] }))} empty="No conversions yet." />
            {stats.converted > 0 && (
              <Link prefetch={false} href={`${base}?tab=recipients&filter=converted`} className="mt-3 inline-block text-xs text-primary hover:underline">
                Who converted →
              </Link>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {header}
      <SectionTabs active={tab} tabs={TABS.map((t) => ({ key: t, label: TAB_LABEL[t], href: t === "overview" ? base : `${base}?tab=${t}` }))} />
      {body}
    </div>
  );
}
