// Which provider handles a platform. The sandbox mock is the default; a real
// provider is used only when the module is in live mode AND that platform's app
// is configured (config.ts). Anything else stays on the mock, so the module
// keeps working while app approvals are pending and an un-configured platform
// can never make a real API call.

import { mockProvider } from "./providers/mock.ts";
import { metaProvider } from "./providers/meta.ts";
import { linkedinProvider } from "./providers/linkedin.ts";
import { tiktokProvider } from "./providers/tiktok.ts";
import { snapchatProvider } from "./providers/snapchat.ts";
import { isLiveMode, isPlatformLive } from "./config.ts";
import type { SocialProvider } from "./provider.ts";
import type { SocialAccount, SocialPlatform } from "./types.ts";

/** True while the module is in sandbox mode (no live platform calls). */
export function socialSandboxMode(): boolean {
  return !isLiveMode();
}

function realProvider(platform: SocialPlatform): SocialProvider {
  switch (platform) {
    case "facebook":
    case "instagram":
    case "threads":
      return metaProvider(platform);
    case "linkedin":
      return linkedinProvider();
    case "tiktok":
      return tiktokProvider();
    case "snapchat":
      return snapchatProvider();
  }
}

export function getProvider(platform: SocialPlatform): SocialProvider {
  return isPlatformLive(platform) ? realProvider(platform) : mockProvider(platform);
}

/** A sandbox account always uses the mock, even if its platform has since gone live. */
export function providerForAccount(account: Pick<SocialAccount, "platform" | "is_mock">): SocialProvider {
  return account.is_mock ? mockProvider(account.platform) : getProvider(account.platform);
}
