import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NewAdCampaignForm } from "./NewAdCampaignForm";
import { ActualSpendInput } from "./ActualSpendInput";

export default async function AdCampaignsPage() {
  const supabase = await createClient();
  const { data: universities } = await supabase.from("universities").select("id, name").order("name");
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id, platform, country, budget_period, planned_spend, actual_spend, start_date, end_date, university:universities(name)")
    .order("start_date", { ascending: false });

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Digital Marketing — Ad Campaigns</h2>
      <Card className="mb-6">
        <NewAdCampaignForm universities={universities ?? []} />
      </Card>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Planned</th>
              <th className="px-4 py-3 text-right">Actual</th>
              <th className="px-4 py-3">Dates</th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{c.platform}</td>
                <td className="px-4 py-3">
                  {c.country ?? "—"} {one(c.university)?.name && `· ${one(c.university)?.name}`}
                </td>
                <td className="px-4 py-3">{c.budget_period}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.planned_spend ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <ActualSpendInput id={c.id} actualSpend={c.actual_spend} />
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"}
                  {c.end_date && ` – ${new Date(c.end_date).toLocaleDateString()}`}
                </td>
              </tr>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No ad campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
