import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { campaignStats, pct } from "@/lib/emailCampaigns/campaignData";
import { breakdown, COMPARED_RATES, earlierComparison, linkReport, webReport } from "@/lib/emailCampaigns/reportData";
import { karachiStamp } from "@/lib/emailCampaigns/reportRules";
import { readSendingSettings } from "@/lib/emailCampaigns/server";
import { renderEmailCampaignReport } from "@/lib/pdf/emailCampaignReportPdf";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

export const maxDuration = 60;

const refuse = (status: number, message: string) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const n = (v: number) => v.toLocaleString("en-US");
const rate = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** A campaign's results as a branded PDF, read as the caller (email.reports.view). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase, staff } = await getStaffSession();
  if (!(await hasPermission("email.reports.view"))) return refuse(403, "Only someone allowed to see email reports can download them.");
  const { data: c } = await supabase.from("email_campaigns").select("id, name, slug, subject, practice, started_at, finished_at, from_name, from_email").eq("id", id).maybeSingle();
  if (!c) return refuse(404, "That campaign no longer exists.");
  if (!c.started_at) return refuse(409, "It has not been sent yet, so there is nothing to report.");

  const s = (await campaignStats(supabase, [id])).get(id)!;
  const [{ comparison, count }, links, clients, countries, domains, bounces, web, sending] = await Promise.all([
    earlierComparison(supabase, { id, practice: Boolean(c.practice), started_at: c.started_at as string }, s),
    linkReport(supabase, id),
    breakdown(supabase, id, "client"),
    breakdown(supabase, id, "country"),
    breakdown(supabase, id, "domain"),
    breakdown(supabase, id, "bounce_reason"),
    webReport(supabase, id),
    readSendingSettings(supabase),
  ]);
  const reached = s.delivered || s.sent;
  const bounced = s.hard_bounces + s.soft_bounces;
  const people = (rows: { key: string; recipients: number }[]) => {
    const total = rows.reduce((a, r) => a + r.recipients, 0);
    return rows.slice(0, 6).map((r) => ({ key: r.key, value: r.recipients, cells: [n(r.recipients), pct(r.recipients, total)] }));
  };
  const label = (key: string) => sending.conversion_events.find((e) => e.key === key)?.label ?? key;
  const clickers = Math.max(1, s.clicked_human);
  const stamp = karachiStamp(new Date().toISOString());

  const pdf = await renderEmailCampaignReport({
    name: c.name as string,
    subject: (c.subject as string) ?? "",
    practice: Boolean(c.practice),
    from: [c.from_name, c.from_email ? `<${c.from_email}>` : ""].filter(Boolean).join(" ") || "—",
    started: karachiStamp(c.started_at as string) || "—",
    finished: karachiStamp(c.finished_at as string) || "—",
    preparedOn: stamp,
    preparedBy: staff?.full_name?.trim() || null,
    kpis: [
      { label: "Sent", value: n(s.sent), sub: s.failed ? `${n(s.failed)} could not be sent` : undefined },
      { label: "Delivered", value: pct(s.delivered, s.sent), sub: `${n(s.delivered)} people` },
      { label: "Opened (people)", value: pct(s.opened_human, reached), sub: `${n(s.opened_human)} people` },
      { label: "Clicked (people)", value: pct(s.clicked_human, reached), sub: `${n(s.clicked_human)} people` },
      { label: "Clicked, of openers", value: pct(s.clicked_human, s.opened_human) },
      { label: "Visited the website", value: n(s.visited), sub: `${pct(s.visited, reached)} of those reached` },
      { label: "Converted", value: n(s.converted), sub: `${pct(s.converted, reached)} of those reached` },
      { label: "Bounced", value: pct(bounced, s.sent), sub: `${n(s.hard_bounces)} for good, ${n(s.soft_bounces)} for now` },
      { label: "Unsubscribed", value: n(s.unsubscribes), sub: pct(s.unsubscribes, reached) },
      { label: "Marked as spam", value: n(s.complaints), sub: pct(s.complaints, reached) },
    ],
    machineNote:
      s.opened_any > s.opened_human
        ? `${n(s.opened_any - s.opened_human)} more were "opened" only by a machine (Apple Mail's privacy proxy or a security scanner) and are not counted as opens.`
        : null,
    comparedWith: count ? `The average of the ${count} ${c.practice ? "practice " : ""}campaign${count === 1 ? "" : "s"} before it, each counted once.` : `No earlier ${c.practice ? "practice " : ""}campaign to compare with yet.`,
    comparison: COMPARED_RATES.map(([lbl, key, higherIsBetter]) => {
      const r = comparison[key];
      return {
        label: lbl,
        value: rate(r.value),
        average: rate(r.average),
        points: r.points === null ? "—" : `${r.points > 0 ? "+" : ""}${r.points.toFixed(1)} pts`,
        good: r.points === null || r.points === 0 ? null : higherIsBetter ? r.points > 0 : r.points < 0,
      };
    }),
    links: [...links]
      .sort((a, b) => b.people - a.people)
      .slice(0, 10)
      .map((l) => ({ key: l.label || "(no text)", sub: l.url, value: l.people, cells: [n(l.people), pct(l.people, clickers)] })),
    clients: people(clients),
    countries: people(countries),
    domains: domains.slice(0, 6).map((d) => ({ key: d.key, value: d.recipients, cells: [n(d.recipients), pct(d.opened, d.delivered || d.recipients)] })),
    bounces: bounces.slice(0, 6).map((b) => ({ key: b.key, value: b.recipients, cells: [n(b.recipients)] })),
    pages: web.filter((w) => w.kind === "page").slice(0, 8).map((w) => ({ key: w.key, value: w.events, cells: [n(w.events), n(w.people)] })),
    conversions: web.filter((w) => w.kind === "conversion").map((w) => ({ key: label(w.key), value: w.events, cells: [n(w.events), n(w.people)] })),
  });
  await logEmailActivity("report_pdf", { campaignId: id });
  const file = `${(c.slug as string) || "campaign"}-report-${stamp.slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Content-Length": String(pdf.length), "Cache-Control": "no-store, private" },
  });
}
