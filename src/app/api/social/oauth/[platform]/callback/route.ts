import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, socialSandboxMode } from "@/lib/social/registry";
import { isSocialPlatform } from "@/lib/social/types";
import { OAUTH_STATE_COOKIE, socialRedirectUri } from "@/lib/social/oauth";

// Finishes a connection: verifies the CSRF state, exchanges the code for an
// account + token, stores the account and (service-role only) the encrypted
// token, then returns to the Accounts page.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/social/accounts?${q}`, req.url));

  if (!isSocialPlatform(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });

  const { staff } = await getStaffSession();
  if (!staff || !(await hasPermission("social.accounts.manage"))) return back("error=forbidden");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  if (!code || !state || expected !== `${platform}:${state}`) return back("error=state");

  let connected;
  try {
    connected = await getProvider(platform).exchangeCode(code, socialRedirectUri(platform));
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`);
  }

  // Service role: the account row (bypasses RLS to set connected_by) and the
  // token, which only service-role code may store.
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("social_accounts")
    .insert({
      platform,
      external_id: connected.external_id,
      display_name: connected.display_name,
      username: connected.username ?? null,
      avatar_url: connected.avatar_url ?? null,
      scopes: connected.scopes ?? [],
      profile_ref: connected.choices?.[0]?.id ?? null,
      is_mock: socialSandboxMode(),
      token_expires_at: connected.token_expires_at ?? null,
      status: "active",
      connected_by: staff.id,
    })
    .select("id")
    .single();
  if (error || !account) return back(`error=${encodeURIComponent(error?.message ?? "save_failed")}`);

  const { error: tokenError } = await admin.rpc("store_social_token", {
    p_account_id: account.id,
    p_plaintext: JSON.stringify(connected.token),
  });
  if (tokenError) {
    // Don't leave an account with no token behind.
    await admin.from("social_accounts").delete().eq("id", account.id);
    return back(`error=${encodeURIComponent(tokenError.message)}`);
  }

  return back(`connected=${platform}`);
}
