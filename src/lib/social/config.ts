// Live-mode configuration for the real providers (Phase F). Everything here is
// read from env; nothing is a secret at rest. A platform is "live" only when the
// module is in live mode AND that platform's app credentials are present —
// otherwise the registry serves the sandbox mock, so an un-configured platform
// (or the whole module, by default) can never make a real API call.

import type { SocialPlatform } from "./types.ts";

export type PlatformCreds = { clientId: string; clientSecret: string } | null;

export function isLiveMode(): boolean {
  return process.env.SOCIAL_LIVE === "yes";
}

function creds(idVar: string | undefined, secretVar: string | undefined): PlatformCreds {
  return idVar && secretVar ? { clientId: idVar, clientSecret: secretVar } : null;
}

// Facebook and Instagram share one Meta app.
export const metaCreds = (): PlatformCreds => creds(process.env.META_APP_ID, process.env.META_APP_SECRET);
// Threads issues its OWN app id/secret, distinct from the Facebook/Instagram
// Meta app — sending the Meta app id to threads.net fails ("No app ID was sent").
// Falls back to the Meta app only if the Threads-specific vars aren't set.
export const threadsCreds = (): PlatformCreds => creds(process.env.THREADS_APP_ID, process.env.THREADS_APP_SECRET) ?? metaCreds();
export const linkedinCreds = (): PlatformCreds => creds(process.env.LINKEDIN_CLIENT_ID, process.env.LINKEDIN_CLIENT_SECRET);
export const tiktokCreds = (): PlatformCreds => creds(process.env.TIKTOK_CLIENT_KEY, process.env.TIKTOK_CLIENT_SECRET);
export const snapchatCreds = (): PlatformCreds => creds(process.env.SNAPCHAT_CLIENT_ID, process.env.SNAPCHAT_CLIENT_SECRET);

export function credsFor(platform: SocialPlatform): PlatformCreds {
  switch (platform) {
    case "facebook":
    case "instagram":
      return metaCreds();
    case "threads":
      return threadsCreds();
    case "linkedin":
      return linkedinCreds();
    case "tiktok":
      return tiktokCreds();
    case "snapchat":
      return snapchatCreds();
  }
}

/** Whether this platform will use its real provider (live mode + its app configured). */
export function isPlatformLive(platform: SocialPlatform): boolean {
  return isLiveMode() && credsFor(platform) !== null;
}
