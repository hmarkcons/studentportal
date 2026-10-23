import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialAccount, type SocialAccountStatus } from "@/lib/social/types";
import { socialSandboxMode } from "@/lib/social/registry";
import { DisconnectAccountButton } from "./DisconnectAccountButton";

const STATUS: Record<SocialAccountStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  token_expiring: { label: "Token expiring", tone: "warning" },
  needs_reconnect: { label: "Reconnect needed", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
};

export default async function SocialAccountsPage(props: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { connected, error } = await props.searchParams;
  const supabase = await createClient();
  const canManage = await hasPermission("social.accounts.manage");
  const sandbox = socialSandboxMode();

  const { data } = await supabase
    .from("social_accounts")
    .select("id, platform, external_id, display_name, username, avatar_url, status, scopes, profile_ref, is_mock, token_expires_at, connected_at")
    .neq("status", "disconnected")
    .order("connected_at", { ascending: false });
  const accounts = (data ?? []) as SocialAccount[];

  const byPlatform = (p: string) => accounts.filter((a) => a.platform === p);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Social Accounts</h1>
        <p className="mt-1 text-sm text-muted">Connect HMARK&rsquo;s social accounts so posts can publish to them.</p>
      </div>

      {sandbox && (
        <div className="rounded-md border border-info bg-info-bg px-4 py-2.5 text-sm text-info" data-sandbox-banner>
          <strong className="font-medium">Sandbox mode.</strong> Connecting creates a test account so the whole module can be used
          before the platform apps are approved. Set <code className="font-mono text-xs">SOCIAL_LIVE=yes</code> once the apps are live.
        </div>
      )}
      {connected && (
        <div className="rounded-md border border-success bg-success-bg px-4 py-2 text-sm text-success">
          Connected your {PLATFORM_LABELS[connected as keyof typeof PLATFORM_LABELS] ?? connected} account.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-danger bg-danger-bg px-4 py-2 text-sm text-danger">
          {error === "forbidden"
            ? "You don't have permission to connect accounts."
            : error === "state"
              ? "That connection attempt expired or didn't match — please try again."
              : `Couldn't connect: ${error}`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const rows = byPlatform(platform);
          return (
            <div key={platform} data-platform={platform}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{PLATFORM_LABELS[platform]}</h2>
                {canManage && (
                  <Link
                    prefetch={false}
                    href={`/api/social/oauth/${platform}/start`}
                    className="rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    data-connect={platform}
                  >
                    + Connect{sandbox ? " (sandbox)" : ""}
                  </Link>
                )}
              </div>

              {rows.length === 0 ? (
                <p className="text-xs text-muted">No account connected.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {rows.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2" data-account={a.id}>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">
                          {a.display_name}
                          {a.is_mock && <span className="ml-1.5 text-xs text-muted">(sandbox)</span>}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {a.username ? `@${a.username}` : a.external_id}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                        {canManage && <DisconnectAccountButton accountId={a.id} name={a.display_name} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            </div>
          );
        })}
      </div>

      {accounts.length === 0 && !canManage && (
        <Card>
          <EmptyState>No social accounts are connected yet.</EmptyState>
        </Card>
      )}
    </div>
  );
}
