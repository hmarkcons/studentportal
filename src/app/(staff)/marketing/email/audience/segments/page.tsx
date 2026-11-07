import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadAudience } from "@/lib/emailCampaigns/audienceLoad";
import { FIELDS, resolveAudience, validateRuleSet } from "@/lib/emailCampaigns/audience";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { AudienceNav } from "../AudienceNav";

export default async function EmailSegmentsPage() {
  const { supabase } = await getStaffSession();
  const [canManage, { data: segments }, audience] = await Promise.all([
    hasPermission("email.audience.manage"),
    supabase.from("email_segments").select("id, name, description, rules, updated_at").order("name"),
    loadAudience(createAdminClient()),
  ]);

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">A segment is a saved filter on the portal&rsquo;s own fields. Its members follow the records: who it reaches is worked out each time it is used.</p>
      <EmailTabs active="audience" />
      <AudienceNav active="segments" />

      {canManage && (
        <div className="mb-4">
          <Link prefetch={false} href="/marketing/email/audience/segments/new" className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink hover:opacity-90">
            New segment
          </Link>
        </div>
      )}

      {!segments?.length ? (
        <EmptyState>No segments yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-segment-list>
          {segments.map((s) => {
            const rules = validateRuleSet(s.rules);
            const reach = "error" in rules ? null : resolveAudience({ contacts: audience.contacts, include: { segments: [rules], lists: [] }, statuses: audience.statuses }).counts.final;
            const summary = "error" in rules ? "Rules could not be read" : rules.rules.length ? rules.rules.map((r) => FIELDS[r.field].label).join(rules.match === "all" ? " and " : " or ") : "Everyone";
            return (
              <Link key={s.id} prefetch={false} href={`/marketing/email/audience/segments/${s.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink group-hover:text-primary">{s.name}</p>
                    <p className="text-lg font-semibold text-ink">{reach?.toLocaleString("en-US") ?? "—"}</p>
                  </div>
                  {s.description && <p className="text-xs text-muted">{s.description}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    {summary} · reaches now · updated {karachiTime(s.updated_at)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
