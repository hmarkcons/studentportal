import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignStats = {
  campaign_id: string;
  recipients: number;
  queued: number;
  sent: number;
  failed: number;
  delivered: number;
  opened_any: number;
  opened_human: number;
  clicked_any: number;
  clicked_human: number;
  hard_bounces: number;
  soft_bounces: number;
  complaints: number;
  unsubscribes: number;
  visited: number;
  converted: number;
};

export const EMPTY_STATS = (id: string): CampaignStats => ({
  campaign_id: id,
  recipients: 0,
  queued: 0,
  sent: 0,
  failed: 0,
  delivered: 0,
  opened_any: 0,
  opened_human: 0,
  clicked_any: 0,
  clicked_human: 0,
  hard_bounces: 0,
  soft_bounces: 0,
  complaints: 0,
  unsubscribes: 0,
  visited: 0,
  converted: 0,
});

/** Each campaign's counts (0358), read as the caller: empty for someone who may not see reports. */
export async function campaignStats(supabase: SupabaseClient, ids: string[]): Promise<Map<string, CampaignStats>> {
  const out = new Map<string, CampaignStats>(ids.map((id) => [id, EMPTY_STATS(id)]));
  if (!ids.length) return out;
  const { data } = await supabase.rpc("email_campaign_stats", { p_campaign_ids: ids });
  for (const row of (data ?? []) as CampaignStats[]) {
    out.set(row.campaign_id, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, k === "campaign_id" ? v : Number(v)])) as CampaignStats);
  }
  return out;
}

/** A share as a percentage, one decimal; "—" when there is nothing to divide by. */
export function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}
