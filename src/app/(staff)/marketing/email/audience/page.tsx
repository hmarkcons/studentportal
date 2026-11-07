import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { loadAudience } from "@/lib/emailCampaigns/audienceLoad";
import { CONTACT_STATUS_LABELS, resolveAudience, suppressedTotal, type ContactStatus } from "@/lib/emailCampaigns/audience";
import { EmailTabs } from "../EmailTabs";
import { AudienceNav } from "./AudienceNav";
import { AudienceLookupPanel } from "./AudienceLookupPanel";

// Who email campaigns can reach: everyone in the portal with an email, and
// how many of them fall out, and why.
export default async function EmailAudiencePage() {
  const { contacts, statuses } = await loadAudience(createAdminClient());
  const { counts } = resolveAudience({ contacts, include: { all: true, segments: [], lists: [] }, statuses });
  const leads = contacts.filter((c) => c.kind === "lead").length;
  const imported = contacts.length - leads;

  const cards: { label: string; value: number; note: string; tone?: string }[] = [
    { label: "Reachable", value: counts.final, note: "One per address, subscribed, not left out", tone: "text-success" },
    { label: "Leads and students", value: leads, note: "Every lead record" },
    { label: "Imported contacts", value: imported, note: "From spreadsheets, not leads" },
    { label: "Same address twice", value: counts.duplicates, note: "Emailed once" },
    { label: "No usable address", value: counts.invalid, note: "Blank, or not an address" },
    { label: "Left out by lead status", value: counts.skippedLeadStatus, note: "Not interested, Not eligible (by default)" },
    { label: "Do-not-email list", value: suppressedTotal(counts), note: "Unsubscribed, bounced, spam, staff" },
  ];

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        Campaigns go to the people already in the portal — every lead with an email, students included — and to contacts
        imported from spreadsheets. Nothing is copied: a segment follows the records as they change.
      </p>
      <EmailTabs active="audience" />
      <AudienceNav active="overview" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7" data-audience-kpis>
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">{c.label}</p>
            <p className={`text-xl font-semibold ${c.tone ?? "text-ink"}`}>{c.value.toLocaleString("en-US")}</p>
            <p className="text-[11px] text-muted">{c.note}</p>
          </div>
        ))}
      </div>

      {suppressedTotal(counts) > 0 && (
        <p className="mb-6 text-xs text-muted">
          On the do-not-email list:{" "}
          {(Object.entries(counts.suppressed) as [ContactStatus, number][])
            .map(([s, n]) => `${CONTACT_STATUS_LABELS[s]} ${n}`)
            .join(" · ")}
        </p>
      )}

      <Card>
        <h3 className="mb-1 text-sm font-medium text-ink">Look someone up</h3>
        <p className="mb-3 text-xs text-muted">Their email status, where their consent came from, the topics they chose and the lists they are on.</p>
        <AudienceLookupPanel />
      </Card>
    </div>
  );
}
