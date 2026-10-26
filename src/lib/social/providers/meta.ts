// Real Facebook / Instagram / Threads providers (Meta Graph API). They share one
// Meta app (META_APP_ID/SECRET) but stay separate providers. Written to the
// documented Graph API v21.0 / Threads API shapes; they only run in live mode
// with the app configured, and need the app's review/permissions (see
// docs/SOCIAL_SETUP.md) before a real account can publish.

import type { SocialProvider } from "../provider.ts";
import type { ConnectedAccount, PublishResult } from "../types.ts";
import { metaCreds, threadsCreds } from "../config.ts";
import { httpGet, httpPostForm, isRetryableStatus } from "../http.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const THREADS_GRAPH = "https://graph.threads.net/v1.0";

type MetaPlatform = "facebook" | "instagram" | "threads";

const SCOPES: Record<MetaPlatform, string> = {
  facebook: "pages_show_list,pages_read_engagement,pages_manage_posts,business_management",
  instagram: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
  threads: "threads_basic,threads_content_publish",
};

const fail = (r: { status: number; error: string }): PublishResult => ({ ok: false, error: r.error, retryable: isRetryableStatus(r.status) });

export function metaProvider(platform: MetaPlatform): SocialProvider {
  const isThreads = platform === "threads";
  // Threads authenticates against its own app; Facebook/Instagram use the Meta app.
  const creds = isThreads ? threadsCreds() : metaCreds();

  return {
    platform,
    configured: creds !== null,

    getAuthUrl(state, redirectUri) {
      if (!creds) return redirectUri;
      if (isThreads) {
        const p = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirectUri, scope: SCOPES.threads, response_type: "code", state });
        return `https://threads.net/oauth/authorize?${p}`;
      }
      const p = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirectUri, scope: SCOPES[platform], response_type: "code", state });
      return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
    },

    async exchangeCode(code, redirectUri): Promise<ConnectedAccount> {
      if (!creds) throw new Error("Meta app is not configured.");

      if (isThreads) {
        const tok = await httpPostForm<{ access_token: string; user_id: string }>(`${THREADS_GRAPH}/oauth/access_token`, {
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        });
        if (!tok.ok) throw new Error(tok.error);
        const me = await httpGet<{ id: string; username: string; threads_profile_picture_url?: string }>(`${THREADS_GRAPH}/me?fields=id,username,threads_profile_picture_url&access_token=${tok.data.access_token}`);
        return {
          external_id: tok.data.user_id ?? (me.ok ? me.data.id : ""),
          display_name: me.ok ? `@${me.data.username}` : "Threads account",
          username: me.ok ? me.data.username : null,
          avatar_url: me.ok ? me.data.threads_profile_picture_url ?? null : null,
          scopes: SCOPES.threads.split(","),
          token: { access_token: tok.data.access_token },
        };
      }

      // Facebook / Instagram: code -> user token -> long-lived -> the Page(s).
      const short = await httpGet<{ access_token: string }>(
        `${GRAPH}/oauth/access_token?client_id=${creds.clientId}&client_secret=${creds.clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
      );
      if (!short.ok) throw new Error(short.error);
      const long = await httpGet<{ access_token: string }>(
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${creds.clientId}&client_secret=${creds.clientSecret}&fb_exchange_token=${short.data.access_token}`,
      );
      const userToken = long.ok ? long.data.access_token : short.data.access_token;

      const pages = await httpGet<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[] }>(
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`,
      );
      if (!pages.ok) throw new Error(pages.error);
      const list = pages.data.data ?? [];

      if (platform === "facebook") {
        const page = list[0];
        if (!page) throw new Error("No Facebook Page is available on this account.");
        return {
          external_id: page.id,
          display_name: page.name,
          username: null,
          avatar_url: null,
          scopes: SCOPES.facebook.split(","),
          token: { access_token: page.access_token, user_token: userToken },
          choices: list.map((p) => ({ id: p.id, name: p.name })),
        };
      }

      // Instagram: the IG business account linked to a Page.
      const withIg = list.filter((p) => p.instagram_business_account);
      const page = withIg[0];
      if (!page?.instagram_business_account) throw new Error("No Instagram Business account is linked to a Page on this login.");
      const ig = await httpGet<{ username: string; profile_picture_url?: string }>(
        `${GRAPH}/${page.instagram_business_account.id}?fields=username,profile_picture_url&access_token=${page.access_token}`,
      );
      return {
        external_id: page.instagram_business_account.id,
        display_name: ig.ok ? `@${ig.data.username}` : page.name,
        username: ig.ok ? ig.data.username : null,
        avatar_url: ig.ok ? ig.data.profile_picture_url ?? null : null,
        scopes: SCOPES.instagram.split(","),
        token: { access_token: page.access_token, user_token: userToken },
        choices: withIg.map((p) => ({ id: p.instagram_business_account!.id, name: p.name })),
      };
    },

    async refreshToken(token) {
      // Page tokens don't expire; a Threads/long-lived user token can be refreshed.
      if (!creds || isThreads) return null;
      const t = token.user_token as string | undefined;
      if (!t) return null;
      const r = await httpGet<{ access_token: string; expires_in?: number }>(
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${creds.clientId}&client_secret=${creds.clientSecret}&fb_exchange_token=${t}`,
      );
      if (!r.ok) return null;
      return { token: { ...token, user_token: r.data.access_token }, expiresAt: r.data.expires_in ? new Date(Date.now() + r.data.expires_in * 1000).toISOString() : null };
    },

    async validate(account, token) {
      const base = isThreads ? THREADS_GRAPH : GRAPH;
      const r = await httpGet(`${base}/${account.external_id}?fields=id&access_token=${token.access_token}`);
      return r.ok;
    },

    async disconnect() {
      /* tokens are dropped locally; no mandatory revoke endpoint */
    },

    async publish(account, token, input): Promise<PublishResult> {
      const access = String(token.access_token ?? "");
      if (!access) return { ok: false, error: "No stored token for this account.", retryable: false };

      if (platform === "facebook") {
        if (input.mediaKind === "image" && input.mediaUrls[0]) {
          const r = await httpPostForm<{ id: string; post_id?: string }>(`${GRAPH}/${account.external_id}/photos`, { url: input.mediaUrls[0], caption: input.caption, access_token: access });
          return r.ok ? { ok: true, platformPostId: r.data.post_id ?? r.data.id, url: `https://facebook.com/${r.data.post_id ?? r.data.id}` } : fail(r);
        }
        if (input.mediaKind === "video" && input.mediaUrls[0]) {
          const r = await httpPostForm<{ id: string }>(`${GRAPH}/${account.external_id}/videos`, { file_url: input.mediaUrls[0], description: input.caption, access_token: access });
          return r.ok ? { ok: true, platformPostId: r.data.id, url: `https://facebook.com/${r.data.id}` } : fail(r);
        }
        const r = await httpPostForm<{ id: string }>(`${GRAPH}/${account.external_id}/feed`, { message: input.caption, ...(input.link ? { link: input.link } : {}), access_token: access });
        return r.ok ? { ok: true, platformPostId: r.data.id, url: `https://facebook.com/${r.data.id}` } : fail(r);
      }

      // Instagram & Threads: create a container, then publish it (videos finish asynchronously → poll via getStatus).
      const base = isThreads ? THREADS_GRAPH : GRAPH;
      const isVideo = input.mediaKind === "video";
      const container = await httpPostForm<{ id: string }>(`${base}/${account.external_id}/${isThreads ? "threads" : "media"}`, {
        ...(isThreads
          ? { media_type: isVideo ? "VIDEO" : input.mediaUrls[0] ? "IMAGE" : "TEXT", text: input.caption, ...(input.mediaUrls[0] ? (isVideo ? { video_url: input.mediaUrls[0] } : { image_url: input.mediaUrls[0] }) : {}) }
          : { caption: input.caption, ...(isVideo ? { media_type: "REELS", video_url: input.mediaUrls[0] } : { image_url: input.mediaUrls[0] }) }),
        access_token: access,
      });
      if (!container.ok) return fail(container);
      // A video needs time to process; come back to publish it.
      if (isVideo) return { ok: "pending", containerId: container.data.id };
      return this.getStatus(account, token, container.data.id);
    },

    async getStatus(account, token, containerId): Promise<PublishResult> {
      const access = String(token.access_token ?? "");
      const base = isThreads ? THREADS_GRAPH : GRAPH;
      // For a video container, make sure it finished processing first.
      const status = await httpGet<{ status_code?: string; status?: string }>(`${base}/${containerId}?fields=status_code,status&access_token=${access}`);
      if (status.ok) {
        const s = status.data.status_code ?? status.data.status;
        if (s && s !== "FINISHED" && s !== "PUBLISHED") {
          if (s === "ERROR" || s === "EXPIRED") return { ok: false, error: `Media processing ${s.toLowerCase()}.`, retryable: false };
          return { ok: "pending", containerId };
        }
      }
      const pub = await httpPostForm<{ id: string }>(`${base}/${account.external_id}/${isThreads ? "threads_publish" : "media_publish"}`, { creation_id: containerId, access_token: access });
      if (!pub.ok) return fail(pub);
      const host = isThreads ? "threads.net" : "instagram.com";
      return { ok: true, platformPostId: pub.data.id, url: `https://${host}/${pub.data.id}` };
    },

    async fetchMetrics(account, token, platformPostId) {
      const base = isThreads ? THREADS_GRAPH : GRAPH;
      const metric = isThreads ? "likes,replies,reposts,views" : "like_count,comments_count";
      const r = await httpGet<Record<string, number> & { like_count?: number; comments_count?: number }>(`${base}/${platformPostId}?fields=${metric}&access_token=${token.access_token}`);
      if (!r.ok) return null;
      const d = r.data as Record<string, number>;
      return isThreads ? d : { likes: d.like_count ?? 0, comments: d.comments_count ?? 0 };
    },
  } satisfies SocialProvider as SocialProvider;
}
