import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { leadScores, type LeadScore } from "@/lib/emailCampaigns/reportData";
import { didWhat, engagementLevel, HOT_SCORE, LEVEL_LABELS, WARM_SCORE } from "@/lib/emailCampaigns/engagement";

// Engagement scoring (Phase 6, 0362): who is responding to HMARK's emails.
// The scores come from email_lead_scores(), which gives a counsellor their own
// leads and whoever may see email reports everyone's (the office's choice).

const TONE = { hot: "danger", warm: "warning", cold: "neutral" } as const;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" }) : "—";

/** Names and counsellors for scored leads — read past RLS, as the function has already decided who may see them. */
async function namesOf(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; counsellor: string | null }>();
  const admin = createAdminClient();
  const { data } = await admin.from("leads").select("id, full_name, counselor:staff!assigned_counselor_id(full_name)").in("id", ids);
  return new Map(
    (data ?? []).map((l) => {
      const c = (Array.isArray(l.counselor) ? l.counselor[0] : l.counselor) as { full_name?: string } | null;
      return [l.id as string, { name: (l.full_name as string) || "A lead", counsellor: c?.full_name ?? null }];
    })
  );
}

function ScoreTable({ rows, names, showCounsellor }: { rows: LeadScore[]; names: Map<string, { name: string; counsellor: string | null }>; showCounsellor: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" data-hot-leads>
        <thead className="text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">Lead</th>
            {showCounsellor && <th className="py-1 pr-3 font-medium">Counsellor</th>}
            <th className="py-1 pr-3 font-medium">Engagement</th>
            <th className="py-1 pr-3 font-medium">What they did</th>
            <th className="py-1 pr-3 font-medium">Last</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const level = engagementLevel(r.score);
            return (
              <tr key={r.lead_id}>
                <td className="py-1.5 pr-3">
                  <Link prefetch={false} href={`/leads/${r.lead_id}`} className="font-medium text-ink hover:text-primary">
                    {names.get(r.lead_id)?.name ?? "A lead"}
                  </Link>
                </td>
                {showCounsellor && <td className="py-1.5 pr-3 text-muted">{names.get(r.lead_id)?.counsellor ?? "—"}</td>}
                <td className="py-1.5 pr-3">
                  <Badge tone={TONE[level]}>{LEVEL_LABELS[level]}</Badge> <span className="text-muted">{r.score}</span>
                </td>
                <td className="py-1.5 pr-3 text-ink">{didWhat(r)}</td>
                <td className="py-1.5 pr-3 text-muted">{when(r.last_activity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The dashboard's card: the hottest leads this person may see. Nothing at all until someone is warm. */
export async function HotLeadsCard({ className = "" }: { className?: string }) {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return null;
  const rows = (await leadScores(supabase, { limit: 10 })).filter((r) => r.score >= WARM_SCORE);
  if (!rows.length) return null;
  const names = await namesOf(rows.map((r) => r.lead_id));
  return (
    <Card className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">Hot leads from email</h3>
        <span className="text-[11px] text-muted">opens, clicks, website visits and enquiries, last 120 days</span>
      </div>
      <p className="mb-3 text-[11px] text-muted">Leads responding to HMARK&rsquo;s emails right now — a good moment to call.</p>
      <ScoreTable rows={rows} names={names} showCounsellor={hasMany(names)} />
    </Card>
  );
}

const hasMany = (names: Map<string, { counsellor: string | null }>) => new Set([...names.values()].map((n) => n.counsellor)).size > 1;

/** The Reports tab's list: everyone's, for whoever may see reports. */
export async function HotLeadsReport() {
  const { supabase } = await getStaffSession();
  const rows = (await leadScores(supabase, { limit: 50 })).filter((r) => r.score >= WARM_SCORE);
  const names = await namesOf(rows.map((r) => r.lead_id));
  return (
    <div data-hot-leads-report>
      <h3 className="mb-1 text-sm font-medium text-ink">Hot leads</h3>
      <p className="mb-3 text-[11px] text-muted">
        A score from the last 120 days of real campaigns — an open 1, a click 3, a website visit 5, an enquiry 10, each halving every 30 days. {HOT_SCORE} or
        more is hot, {WARM_SCORE} or more warm. Counsellors see their own on their dashboard.
      </p>
      {rows.length ? <ScoreTable rows={rows} names={names} showCounsellor /> : <p className="text-xs text-muted">Nobody yet — scores come from real campaigns only.</p>}
    </div>
  );
}

/** A lead's own line, on their page: for their counsellor and for whoever may see reports. */
export async function LeadEngagementLine({ leadId, className = "" }: { leadId: string; className?: string }) {
  const { supabase } = await getStaffSession();
  const [r] = await leadScores(supabase, { leadIds: [leadId], limit: 1 });
  if (!r) return null;
  const level = engagementLevel(r.score);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`} data-lead-engagement={level}>
      <span className="text-muted">Email engagement:</span>
      <Badge tone={TONE[level]}>{LEVEL_LABELS[level]}</Badge>
      <span className="text-muted">
        {r.score} — {didWhat(r)}, last {when(r.last_activity)}
      </span>
    </div>
  );
}
