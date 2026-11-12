import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { missingProviderEnv, providerConfigured, PROVIDER_ENV, sesRegion } from "@/lib/emailCampaigns/providers";
import { readEmailSettings, readSendingDomain, readSendingSettings } from "@/lib/emailCampaigns/server";
import { expectedRecords } from "@/lib/emailCampaigns/dnsCheck";
import { karachiDay, warmupCap } from "@/lib/emailCampaigns/sendingRules";
import { getSiteUrl } from "@/lib/siteUrl";
import { EmailTabs } from "../EmailTabs";
import { EmailSettingsForm } from "./EmailSettingsForm";
import { SendingSettingsForm } from "./SendingSettingsForm";
import { SendingDomainCard } from "./SendingDomainCard";
import { slackConfigured } from "@/lib/emailCampaigns/slack";

export default async function EmailSettingsPage() {
  const { supabase } = await getStaffSession();
  const [settings, sending, sendingDomain, canEdit] = await Promise.all([
    readEmailSettings(supabase),
    readSendingSettings(supabase),
    readSendingDomain(supabase),
    hasPermission("email.settings.manage"),
  ]);
  const todaysCap = warmupCap(
    { enabled: sending.warmup_enabled, startCap: sending.warmup_start_cap, growthPct: sending.warmup_growth_pct, startedOn: sending.warmup_started_on },
    karachiDay()
  );
  const connectable = { ses: providerConfigured("ses"), resend: providerConfigured("resend") };
  const connected = settings.provider !== "none" && connectable[settings.provider];

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">The sending service, the sender, how fast campaigns go, and the website tracking.</p>
      <EmailTabs active="settings" />

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">Sending service</h3>
          <Badge tone={connected ? "success" : "warning"}>{connected ? `Connected — ${PROVIDER_ENV[settings.provider as "ses" | "resend"].label}` : "Not connected"}</Badge>
        </div>
        {!connected && (
          <p className="mb-3 text-sm text-muted">
            Campaigns are sent through an email sending service, never the office mailbox. Until one is bought and its keys
            are added, everything else works — templates, previews, audiences — and a test email goes out through the
            portal&rsquo;s own mailbox. Amazon SES is the one recommended.
          </p>
        )}
        <p className="mb-3 text-xs text-muted" data-slack-status>
          Alerts — a campaign waiting for approval, finished, or stopped by itself — go to people in the portal and by email.
          {slackConfigured() ? " They also go to the Slack channel set in SLACK_WEBHOOK_URL." : " To post them to a Slack channel too, set SLACK_WEBHOOK_URL (a Slack incoming-webhook address) in Vercel."}
        </p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-email-providers>
          {(Object.keys(PROVIDER_ENV) as ("ses" | "resend")[]).map((id) => {
            const missing = missingProviderEnv(id);
            return (
              <li key={id} className="rounded-md border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {PROVIDER_ENV[id].label}
                    {id === "ses" && <span className="ml-1 text-xs font-normal text-muted">(recommended)</span>}
                  </p>
                  <Badge tone={missing.length ? "neutral" : "success"}>{missing.length ? "Keys not set" : "Keys set"}</Badge>
                </div>
                {missing.length > 0 && (
                  <p className="text-[11px] text-muted">
                    Needs, in Vercel&rsquo;s environment settings: <code className="break-all">{missing.join(", ")}</code>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-6">
        <EmailSettingsForm settings={settings} canEdit={canEdit} connectable={connectable} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-1 text-sm font-medium text-ink">Sending domain and DNS</h3>
        <p className="mb-3 text-sm text-muted">
          Gmail, Yahoo and Outlook deliver bulk email only from a domain that proves the mail is its own. Add these records once
          the domain is set up in Amazon SES, then press Check DNS.
        </p>
        <SendingDomainCard
          domain={sendingDomain.domain}
          saved={sendingDomain.saved}
          dkimTokens={sendingDomain.dkimTokens}
          records={sendingDomain.domain ? expectedRecords({ domain: sendingDomain.domain, region: sesRegion(), dkimTokens: sendingDomain.dkimTokens }) : []}
          canEdit={canEdit}
        />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Sending</h3>
        <SendingSettingsForm settings={sending} canEdit={canEdit} todaysCap={todaysCap} />
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-medium text-ink">Website tracking</h3>
        <p className="mb-2 text-sm text-muted">
          To see who went on to visit hmarkconsultants.com from a campaign, add this line to every page of the website, before{" "}
          <code>&lt;/body&gt;</code>:
        </p>
        <pre className="mb-2 overflow-x-auto rounded-md bg-bg p-3 text-xs text-ink" data-tracking-snippet>{`<script src="${getSiteUrl()}/hmark-track.js" async></script>`}</pre>
        <p className="mb-2 text-sm text-muted">Where a visitor does something that counts — sends the enquiry form, taps WhatsApp — the website adds:</p>
        <pre className="overflow-x-auto rounded-md bg-bg p-3 text-xs text-ink">{`window.hmarkTrack && window.hmarkTrack("conversion", "${sending.conversion_events[0]?.key ?? "enquiry_form"}");`}</pre>
      </Card>
    </div>
  );
}
