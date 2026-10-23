// Sandbox provider. Lets the whole module — connecting accounts, the composer,
// the calendar, the scheduler and the publisher — be exercised end to end before
// any real platform app is approved. It never calls a network, and marks its
// accounts is_mock so the live publisher would never touch a real API for them.

import type { SocialProvider } from "../provider.ts";
import type { ConnectedAccount, PublishInput, PublishResult, SocialPlatform } from "../types.ts";
import { PLATFORM_LABELS } from "../types.ts";

export function mockProvider(platform: SocialPlatform): SocialProvider {
  const n = () => Math.floor(Math.random() * 1_000_000);
  const inSixtyDays = () => new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

  return {
    platform,
    configured: true,

    getAuthUrl(state, redirectUri) {
      // Points straight back at our own callback with a mock=1 flag, so the
      // connect flow completes without leaving the portal.
      const u = new URL(redirectUri);
      u.searchParams.set("mock", "1");
      u.searchParams.set("code", `mock-code-${n()}`);
      u.searchParams.set("state", state);
      return u.toString();
    },

    async exchangeCode(): Promise<ConnectedAccount> {
      const id = n();
      return {
        external_id: `mock-${platform}-${id}`,
        display_name: `HMARK ${PLATFORM_LABELS[platform]} (Sandbox)`,
        username: `hmark_${platform}`,
        avatar_url: null,
        scopes: ["mock"],
        token: { access_token: `mock-token-${id}`, mock: true },
        token_expires_at: inSixtyDays(),
        choices: platform === "snapchat" ? [{ id: `profile-${id}`, name: "HMARK Public Profile" }] : undefined,
      };
    },

    async refreshToken(token) {
      return { token, expiresAt: inSixtyDays() };
    },

    async validate() {
      return true;
    },

    async disconnect() {
      /* nothing to revoke for a sandbox account */
    },

    async publish(_account, _token, _input: PublishInput): Promise<PublishResult> {
      const id = `mock_${platform}_${Date.now()}`;
      return { ok: true, platformPostId: id, url: `https://sandbox.local/${platform}/${id}` };
    },

    async getStatus(_account, _token, containerId): Promise<PublishResult> {
      return { ok: true, platformPostId: containerId, url: `https://sandbox.local/${platform}/${containerId}` };
    },

    async fetchMetrics() {
      return { likes: Math.floor(Math.random() * 200), comments: Math.floor(Math.random() * 40), shares: Math.floor(Math.random() * 20) };
    },
  };
}
