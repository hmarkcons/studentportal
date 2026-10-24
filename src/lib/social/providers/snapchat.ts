// Real Snapchat provider (Public Profile API). OAuth and account selection are
// implemented; live content publishing to a Public Profile (Story / Saved Story
// / Spotlight) is NOT wired to a verified endpoint yet, so publish() fails
// honestly rather than pretending — Snapchat's content-publish API needs
// approved access to confirm (docs/SOCIAL_SETUP.md). If approval is slow, the
// same SocialProvider interface can sit in front of a third-party publisher
// (e.g. Ayrshare) — ask first. In sandbox the mock handles all of this.

import type { SocialProvider } from "../provider.ts";
import type { ConnectedAccount, PublishResult } from "../types.ts";
import { snapchatCreds } from "../config.ts";
import { httpGet, httpPostForm } from "../http.ts";

const SCOPE = "snapchat-marketing-api";

export function snapchatProvider(): SocialProvider {
  const creds = snapchatCreds();
  return {
    platform: "snapchat",
    configured: creds !== null,

    getAuthUrl(state, redirectUri) {
      if (!creds) return redirectUri;
      const p = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, state });
      return `https://accounts.snapchat.com/login/oauth2/authorize?${p}`;
    },

    async exchangeCode(code, redirectUri): Promise<ConnectedAccount> {
      if (!creds) throw new Error("Snapchat app is not configured.");
      const tok = await httpPostForm<{ access_token: string; refresh_token: string; expires_in: number }>(`https://accounts.snapchat.com/login/oauth2/access_token`, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      });
      if (!tok.ok) throw new Error(tok.error);
      // The Public Profiles the person can publish to, for them to choose from.
      const profiles = await httpGet<{ public_profiles?: { public_profile: { id: string; title?: string } }[] }>(
        `https://businessapi.snapchat.com/v1/me/public_profiles`,
        { authorization: `Bearer ${tok.data.access_token}` },
      );
      const list = profiles.ok ? (profiles.data.public_profiles ?? []).map((p) => ({ id: p.public_profile.id, name: p.public_profile.title ?? p.public_profile.id })) : [];
      return {
        external_id: list[0]?.id ?? "snapchat",
        display_name: list[0]?.name ?? "Snapchat Public Profile",
        username: null,
        avatar_url: null,
        scopes: [SCOPE],
        token: { access_token: tok.data.access_token, refresh_token: tok.data.refresh_token },
        token_expires_at: new Date(Date.now() + tok.data.expires_in * 1000).toISOString(),
        choices: list,
      };
    },

    async refreshToken(token) {
      if (!creds || !token.refresh_token) return null;
      const r = await httpPostForm<{ access_token: string; refresh_token?: string; expires_in: number }>(`https://accounts.snapchat.com/login/oauth2/access_token`, {
        grant_type: "refresh_token",
        refresh_token: String(token.refresh_token),
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      });
      if (!r.ok) return null;
      return { token: { access_token: r.data.access_token, refresh_token: r.data.refresh_token ?? token.refresh_token }, expiresAt: new Date(Date.now() + r.data.expires_in * 1000).toISOString() };
    },

    async validate(_account, token) {
      const r = await httpGet(`https://businessapi.snapchat.com/v1/me`, { authorization: `Bearer ${token.access_token}` });
      return r.ok;
    },
    async disconnect() {},

    async publish(): Promise<PublishResult> {
      return {
        ok: false,
        error: "Snapchat live publishing isn't enabled yet — confirm Public Profile content API access (docs/SOCIAL_SETUP.md), or ask to route it through a third-party publisher.",
        retryable: false,
      };
    },
    async getStatus(): Promise<PublishResult> {
      return { ok: false, error: "Snapchat live publishing isn't enabled yet.", retryable: false };
    },
    async fetchMetrics() {
      return null;
    },
  } satisfies SocialProvider as SocialProvider;
}
