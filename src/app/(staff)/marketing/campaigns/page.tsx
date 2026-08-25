import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewCampaignForm } from "./NewCampaignForm";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, type, name, city, event_date_start, budget, actual_spend")
    .order("event_date_start", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Campaigns</h2>
      <Card className="mb-6">
        <NewCampaignForm />
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(campaigns ?? []).map((c) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{c.name}</p>
              <Badge tone={c.type === "event" ? "info" : "primary"}>{c.type}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {c.city ?? "—"} {c.event_date_start && `· ${new Date(c.event_date_start).toLocaleDateString()}`}
            </p>
            {c.budget != null && (
              <p className="mt-2 text-xs text-muted">
                Budget {c.budget} · Spend {c.actual_spend ?? 0}
              </p>
            )}
          </Card>
        ))}
        {(!campaigns || campaigns.length === 0) && <p className="text-sm text-muted">No campaigns yet.</p>}
      </div>
    </div>
  );
}
