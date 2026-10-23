// Which provider implementation handles a platform. Phase A ships the sandbox
// mock for every platform; the real per-platform providers are added in later
// phases and chosen here once SOCIAL_LIVE=yes and that platform's app is
// configured in env. Anything the registry can't serve live stays on the mock,
// so the module keeps working while app approvals are pending.

import { mockProvider } from "./providers/mock.ts";
import type { SocialProvider } from "./provider.ts";
import type { SocialPlatform } from "./types.ts";

/** True while we are in sandbox mode: no live platform calls are made. */
export function socialSandboxMode(): boolean {
  return process.env.SOCIAL_LIVE !== "yes";
}

export function getProvider(platform: SocialPlatform): SocialProvider {
  // Live providers slot in here per phase F; until then, the mock.
  return mockProvider(platform);
}
