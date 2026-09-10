import { createClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/formatDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatAmount, spendState } from "@/lib/marketing";
import { NewCampaignForm } from "./NewCampaignForm";
import { CampaignSpendInput } from "./CampaignSpendInput";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, type, name, city, event_date_start, event_date_end, budget, actual_spend")
    .order("event_date_start", { ascending: false, nullsFirst: false });

  const rows = campaigns ?? [];
  const totalBudget = rows.reduce((sum, c) => sum + Number(c.budget ?? 0), 0);
  const totalSpend = rows.reduce((sum, c) => sum + Number(c.actual_spend ?? 0), 0);

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Campaigns</h2>
      {rows.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          {rows.length} {rows.length === 1 ? "campaign" : "campaigns"} · {formatAmount(totalBudget)} budgeted ·{" "}
          {formatAmount(totalSpend)} spent
        </p>
      )}
      <Card className="mb-6">
        <NewCampaignForm />
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map((c) => {
          const state = spendState(c.budget, c.actual_spend);
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <Badge tone={c.type === "event" ? "info" : "primary"}>{c.type}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {c.city ?? "—"}
                {c.event_date_start && ` · ${formatDateOnly(c.event_date_start)}`}
                {c.event_date_end && c.event_date_end !== c.event_date_start && ` – ${formatDateOnly(c.event_date_end)}`}
              </p>

              {/* Budget and spend were printed as bare numbers — "Budget 50000
                  · Spend 0" — with nothing comparing them, so a campaign three
                  times over budget looked exactly like one comfortably under.
                  And the spend could never be entered: the column was on the
                  page from the start with nothing in the app able to write it,
                  so every campaign read as having cost nothing. */}
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-2">
                <span className="text-xs text-muted">
                  Budget <span className="text-ink">{formatAmount(c.budget)}</span>
                  {state && (
                    <>
                      {" · "}
                      <span
                        className={
                          state.tone === "danger"
                            ? "text-danger"
                            : state.tone === "warning"
                              ? "text-warning"
                              : "text-success"
                        }
                      >
                        {state.label}
                      </span>
                    </>
                  )}
                </span>
                <label className="flex flex-col items-end gap-0.5 text-xs text-muted">
                  Spend
                  <CampaignSpendInput id={c.id} actualSpend={c.actual_spend} />
                </label>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && <EmptyState>No campaigns yet.</EmptyState>}
      </div>
    </div>
  );
}
