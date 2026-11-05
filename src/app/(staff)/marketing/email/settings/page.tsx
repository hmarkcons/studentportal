import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { missingProviderEnv, providerConfigured, PROVIDER_ENV } from "@/lib/emailCampaigns/providers";
import { readEmailSettings } from "@/lib/emailCampaigns/server";
import { EmailTabs } from "../EmailTabs";
import { EmailSettingsForm } from "./EmailSettingsForm";

export default async function EmailSettingsPage() {
  const { supabase } = await getStaffSession();
  const [settings, canEdit] = await Promise.all([readEmailSettings(supabase), hasPermission("email.settings.manage")]);
  const connectable = { ses: providerConfigured("ses"), resend: providerConfigured("resend") };
  const connected = settings.provider !== "none" && connectable[settings.provider];

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">The sending service, the sender, and what every campaign email carries.</p>
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

      <Card>
        <EmailSettingsForm settings={settings} canEdit={canEdit} connectable={connectable} />
      </Card>
    </div>
  );
}
