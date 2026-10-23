import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { hasPermission } from "@/lib/auth/permissions";
import { getProvider } from "@/lib/social/registry";
import { isSocialPlatform } from "@/lib/social/types";
import { OAUTH_STATE_COOKIE, newOAuthState, socialRedirectUri } from "@/lib/social/oauth";

// Begins a connection: checks the permission, sets a CSRF state cookie, then
// sends the user to the platform's authorise screen. In sandbox mode the mock
// provider points straight back at our callback, so the whole flow completes
// without a real platform app.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isSocialPlatform(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  if (!(await hasPermission("social.accounts.manage"))) {
    return NextResponse.redirect(new URL("/social/accounts?error=forbidden", req.url));
  }

  const state = newOAuthState();
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, `${platform}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(getProvider(platform).getAuthUrl(state, socialRedirectUri(platform)));
}
