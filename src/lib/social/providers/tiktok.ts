// Real TikTok provider (Content Posting API). It pulls media from a public URL,
// so no binary upload is needed. Runs only in live mode with TIKTOK_CLIENT_KEY/
// SECRET set; an unaudited app can only post privately (SELF_ONLY) until TikTok
// audits it (docs/SOCIAL_SETUP.md). Live-verify before relying on it.

import type { SocialProvider } from "../provider.ts";
import type { ConnectedAccount, PublishResult } from "../types.ts";
import { tiktokCreds } from "../config.ts";
import { httpGet, httpPostForm, httpPostJson, isRetryableStatus } from "../http.ts";

const API = "https://open.tiktokapis.com/v2";
// photo.publish is intentionally omitted: it isn't offered on HMARK's app, and
// requesting a scope the app lacks breaks the OAuth connect. Video posting works
// with these three; re-add photo.publish here once it is enabled on the app.
const SCOPE = "user.info.basic,video.publish,video.upload";
const PRIVACY: Record<string, string> = { public: "PUBLIC_TO_EVERYONE", friends: "MUTUAL_FOLLOW_FRIENDS", private: "SELF_ONLY" };
const fail = (r: { status: number; error: string }): PublishResult => ({ ok: false, error: r.error, retryable: isRetryableStatus(r.status) });

export function tiktokProvider(): SocialProvider {
  const creds = tiktokCreds();
  return {
    platform: "tiktok",
    configured: creds !== null,

    getAuthUrl(state, redirectUri) {
      if (!creds) return redirectUri;
      const p = new URLSearchParams({ client_key: creds.clientId, redirect_uri: redirectUri, state, scope: SCOPE, response_type: "code" });
      return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
    },

    async exchangeCode(code, redirectUri): Promise<ConnectedAccount> {
      if (!creds) throw new Error("TikTok app is not configured.");
      const tok = await httpPostForm<{ access_token: string; refresh_token: string; open_id: string; expires_in: number }>(`${API}/oauth/token/`, {
        client_key: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      if (!tok.ok) throw new Error(tok.error);
      const me = await httpGet<{ data: { user: { display_name?: string; avatar_url?: string; open_id?: string } } }>(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { authorization: `Bearer ${tok.data.access_token}` });
      const user = me.ok ? me.data.data.user : {};
      return {
        external_id: tok.data.open_id,
        display_name: user.display_name ?? "TikTok account",
        username: null,
        avatar_url: user.avatar_url ?? null,
        scopes: SCOPE.split(","),
        token: { access_token: tok.data.access_token, refresh_token: tok.data.refresh_token },
        token_expires_at: new Date(Date.now() + tok.data.expires_in * 1000).toISOString(),
      };
    },

    async refreshToken(token) {
      if (!creds || !token.refresh_token) return null;
      const r = await httpPostForm<{ access_token: string; refresh_token: string; expires_in: number }>(`${API}/oauth/token/`, {
        client_key: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
        refresh_token: String(token.refresh_token),
      });
      if (!r.ok) return null;
      return { token: { access_token: r.data.access_token, refresh_token: r.data.refresh_token }, expiresAt: new Date(Date.now() + r.data.expires_in * 1000).toISOString() };
    },

    async validate(_account, token) {
      const r = await httpGet(`${API}/user/info/?fields=open_id`, { authorization: `Bearer ${token.access_token}` });
      return r.ok;
    },
    async disconnect() {},

    async publish(_account, token, input): Promise<PublishResult> {
      const access = String(token.access_token ?? "");
      if (!access) return { ok: false, error: "No stored token for this account.", retryable: false };
      const privacy = PRIVACY[String(input.options.privacy ?? "private")] ?? "SELF_ONLY";
      const auth = { authorization: `Bearer ${access}` };

      if (input.mediaKind === "video" && input.mediaUrls[0]) {
        const r = await httpPostJson<{ data: { publish_id: string } }>(`${API}/post/publish/video/init/`, {
          post_info: { title: input.caption, privacy_level: privacy, disable_comment: false },
          source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrls[0] },
        }, auth);
        return r.ok ? { ok: "pending", containerId: r.data.data.publish_id } : fail(r);
      }
      if (input.mediaKind === "image") {
        // photo.publish is not enabled on the app (see SCOPE above), so photo
        // posting would fail at TikTok anyway — say so plainly instead.
        return { ok: false, error: "Photo posting to TikTok isn't enabled for this app yet — post a video, or enable photo.publish on the TikTok app.", retryable: false };
      }
      return { ok: false, error: "TikTok needs a video.", retryable: false };
    },

    async getStatus(_account, token, containerId): Promise<PublishResult> {
      const r = await httpPostJson<{ data: { status: string; publicaly_available_post_id?: string[] } }>(`${API}/post/publish/status/fetch/`, { publish_id: containerId }, { authorization: `Bearer ${token.access_token}` });
      if (!r.ok) return fail(r);
      const s = r.data.data.status;
      if (s === "PUBLISH_COMPLETE") {
        const postId = r.data.data.publicaly_available_post_id?.[0] ?? containerId;
        return { ok: true, platformPostId: postId, url: `https://www.tiktok.com/@/video/${postId}` };
      }
      if (s === "FAILED") return { ok: false, error: "TikTok reported the upload failed.", retryable: false };
      return { ok: "pending", containerId };
    },

    async fetchMetrics() {
      return null; // TikTok metrics require the research/display scopes; analytics phase.
    },
  } satisfies SocialProvider as SocialProvider;
}
