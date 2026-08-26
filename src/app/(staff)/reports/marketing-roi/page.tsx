import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";

export default async function MarketingRoiPage() {
  const supabase = await createClient();

  const { data: campaigns } = await supabase.from("campaigns").select("id, name, budget, actual_spend");
  const { data: leads } = await supabase.from("leads").select("campaign_id, platform_source, registered_at");

  const leadsByCampaign = new Map<string, number>();
  (leads ?? []).forEach((l) => {
    if (!l.campaign_id) return;
    leadsByCampaign.set(l.campaign_id, (leadsByCampaign.get(l.campaign_id) ?? 0) + 1);
  });

  const campaignRows = (campaigns ?? []).map((c) => {
    const leadCount = leadsByCampaign.get(c.id) ?? 0;
    const spend = c.actual_spend ?? c.budget ?? 0;
    return {
      id: c.id,
      name: c.name,
      spend,
      leads: leadCount,
      costPerLead: leadCount ? Math.round((spend / leadCount) * 100) / 100 : null,
    };
  });

  const bySource = new Map<string, { leads: number; registered: number }>();
  (leads ?? []).forEach((l) => {
    const key = l.platform_source ?? "Unknown";
    const entry = bySource.get(key) ?? { leads: 0, registered: 0 };
    entry.leads += 1;
    if (l.registered_at) entry.registered += 1;
    bySource.set(key, entry);
  });

  return (
    <div className="w-full">
      <Link href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold text-ink">Marketing Channel ROI</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Campaign cost-per-lead</h3>
        <DataTable
          exportFilename="campaign-roi"
          columns={[
            { key: "name", header: "Campaign" },
            { key: "spend", header: "Spend", align: "right" },
            { key: "leads", header: "Leads", align: "right" },
            { key: "cpl", header: "Cost / lead", align: "right" },
          ]}
          rows={campaignRows.map((r) => ({
            id: r.id,
            cells: { name: r.name, spend: r.spend, leads: r.leads, cpl: r.costPerLead ?? "—" },
            csv: { name: r.name, spend: String(r.spend), leads: String(r.leads), cpl: String(r.costPerLead ?? "") },
          }))}
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Lead source performance</h3>
        <div className="flex flex-col divide-y divide-border">
          {[...bySource.entries()].map(([source, v]) => (
            <div key={source} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">{source}</span>
              <span className="text-muted">
                {v.leads} leads · {v.registered} registered ({v.leads ? Math.round((v.registered / v.leads) * 100) : 0}%)
              </span>
            </div>
          ))}
          {bySource.size === 0 && <p className="py-2 text-sm text-muted">No leads yet.</p>}
        </div>
      </Card>
    </div>
  );
}
