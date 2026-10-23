// OAuth connection helpers shared by the start and callback routes.

import { getSiteUrl } from "@/lib/siteUrl";
import type { SocialPlatform } from "./types.ts";

/** The callback the platform returns to — must match what is registered in each app. */
export function socialRedirectUri(platform: SocialPlatform): string {
  return `${getSiteUrl()}/api/social/oauth/${platform}/callback`;
}

/** Holds the CSRF state across the round trip; checked against the `state` the platform returns. */
export const OAUTH_STATE_COOKIE = "hmark_social_oauth_state";

export function newOAuthState(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}
