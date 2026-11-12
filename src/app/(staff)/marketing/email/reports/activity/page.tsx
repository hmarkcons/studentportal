import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { ACTIVITY_LABELS, type EmailActivity } from "@/lib/emailCampaigns/activity";
import { EmailTabs, karachiTime } from "../../EmailTabs";

const PAGE = 100;

/** Who did what in Email campaigns (0361): sends, approvals, exports, lists, tasks, settings. */
export default async function EmailActivityPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const action = (Object.keys(ACTIVITY_LABELS) as EmailActivity[]).includes(one("action") as EmailActivity) ? (one("action") as EmailActivity) : null;
  const page = Math.max(0, Number.parseInt(one("page") || "0", 10) || 0);
  const { supabase } = await getStaffSession();
  const header = (
    <>
      <Link prefetch={false} href="/marketing/email/reports" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← Reports
      </Link>
      <h2 className="mb-1 text-lg font-semibold text-ink">Who did what</h2>
      <p className="mb-4 text-sm text-muted">Every send, approval, export, list, follow-up and settings change in Email campaigns, newest first.</p>
      <EmailTabs active="reports" />
    </>
  );
  if (!(await hasPermission("email.reports.view"))) {
    return (
      <div className="w-full">
        {header}
        <Card>
          <p className="text-sm text-muted">Only someone allowed to see email reports can see this.</p>
        </Card>
      </div>
    );
  }
  let q = supabase
    .from("email_activity_log")
    .select("id, at, action, summary, campaign_id, staff:staff(full_name), campaign:email_campaigns(name)", { count: "exact" })
    .order("at", { ascending: false });
  if (action) q = q.eq("action", action);
  const { data, count } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
  const rows = data ?? [];
  const total = count ?? 0;
  const href = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | null> = { action, page: page || null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && v !== 0) p.set(k, String(v));
    const s = p.toString();
    return s ? `/marketing/email/reports/activity?${s}` : "/marketing/email/reports/activity";
  };
  const name = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { full_name?: string; name?: string } | null;

  return (
    <div className="w-full">
      {header}
      <Card>
        <div className="mb-3 flex flex-wrap gap-1.5" data-activity-filters>
          <Link prefetch={false} href={href({ action: null, page: null })} className={`rounded-full border px-2.5 py-1 text-xs ${!action ? "border-primary bg-primary text-white" : "border-border text-ink hover:border-primary"}`}>
            Everything
          </Link>
          {(Object.keys(ACTIVITY_LABELS) as EmailActivity[]).map((a) => (
            <Link
              key={a}
              prefetch={false}
              href={href({ action: a, page: null })}
              className={`rounded-full border px-2.5 py-1 text-xs ${a === action ? "border-primary bg-primary text-white" : "border-border text-ink hover:border-primary"}`}
            >
              {ACTIVITY_LABELS[a]}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-activity-table>
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">When</th>
                <th className="py-1 pr-3 font-medium">Who</th>
                <th className="py-1 pr-3 font-medium">What</th>
                <th className="py-1 pr-3 font-medium">Campaign</th>
                <th className="py-1 pr-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id as number}>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{karachiTime(r.at as string)}</td>
                  <td className="py-1.5 pr-3 text-ink">{name(r.staff)?.full_name ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-ink">{ACTIVITY_LABELS[r.action as EmailActivity] ?? (r.action as string)}</td>
                  <td className="py-1.5 pr-3">
                    {r.campaign_id ? (
                      <Link prefetch={false} href={`/marketing/email/campaigns/${r.campaign_id}`} className="text-primary hover:underline">
                        {name(r.campaign)?.name ?? "A campaign"}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{(r.summary as string) || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            {page > 0 && (
              <Link prefetch={false} href={href({ page: page - 1 })} className="text-primary hover:underline">
                ← Newer
              </Link>
            )}
            <span className="text-muted">
              {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString("en-US")}
            </span>
            {(page + 1) * PAGE < total && (
              <Link prefetch={false} href={href({ page: page + 1 })} className="text-primary hover:underline">
                Older →
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
