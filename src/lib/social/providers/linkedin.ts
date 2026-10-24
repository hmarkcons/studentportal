// Real LinkedIn provider (Community Management / Posts API), posting as a Company
// Page (Organization). Written to the documented API; runs only in live mode with
// LINKEDIN_CLIENT_ID/SECRET set and the Community Management product approved
// (docs/SOCIAL_SETUP.md). Live-verify before relying on it.

import type { SocialProvider } from "../provider.ts";
import type { ConnectedAccount, PublishResult } from "../types.ts";
import { linkedinCreds } from "../config.ts";
import { httpGet, httpPostForm, httpPostJson, isRetryableStatus } from "../http.ts";

const API = "https://api.linkedin.com";
const VERSION = "202410"; // LinkedIn-Version header (YYYYMM)
const SCOPE = "openid profile w_organization_social r_organization_social rw_organization_admin";

const headers = (token: string) => ({ authorization: `Bearer ${token}`, "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0" });
const fail = (r: { status: number; error: string }): PublishResult => ({ ok: false, error: r.error, retryable: isRetryableStatus(r.status) });

export function linkedinProvider(): SocialProvider {
  const creds = linkedinCreds();
  return {
    platform: "linkedin",
    configured: creds !== null,

    getAuthUrl(state, redirectUri) {
      if (!creds) return redirectUri;
      const p = new URLSearchParams({ response_type: "code", client_id: creds.clientId, redirect_uri: redirectUri, state, scope: SCOPE });
      return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
    },

    async exchangeCode(code, redirectUri): Promise<ConnectedAccount> {
      if (!creds) throw new Error("LinkedIn app is not configured.");
      const tok = await httpPostForm<{ access_token: string; expires_in: number }>(`https://www.linkedin.com/oauth/v2/accessToken`, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      });
      if (!tok.ok) throw new Error(tok.error);
      // The Organizations (Company Pages) this person administers.
      const orgs = await httpGet<{ elements: { "organizationalTarget": string }[] }>(
        `${API}/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget))`,
        headers(tok.data.access_token),
      );
      const targets = orgs.ok ? (orgs.data.elements ?? []).map((e) => e.organizationalTarget) : [];
      const urn = targets[0];
      if (!urn) throw new Error("No LinkedIn Organization (Company Page) is administered by this login.");
      const orgId = urn.split(":").pop()!;
      const info = await httpGet<{ localizedName?: string }>(`${API}/v2/organizations/${orgId}?projection=(localizedName)`, headers(tok.data.access_token));
      return {
        external_id: urn, // urn:li:organization:123
        display_name: info.ok ? info.data.localizedName ?? "LinkedIn Page" : "LinkedIn Page",
        username: null,
        avatar_url: null,
        scopes: SCOPE.split(" "),
        token: { access_token: tok.data.access_token },
        token_expires_at: new Date(Date.now() + tok.data.expires_in * 1000).toISOString(),
        choices: targets.map((t) => ({ id: t, name: t })),
      };
    },

    async refreshToken() {
      // LinkedIn access tokens are long-lived (60 days) and refreshed by re-auth.
      return null;
    },
    async validate(account, token) {
      const r = await httpGet(`${API}/v2/organizations/${String(account.external_id).split(":").pop()}?projection=(id)`, headers(String(token.access_token)));
      return r.ok;
    },
    async disconnect() {},

    async publish(account, token, input): Promise<PublishResult> {
      const access = String(token.access_token ?? "");
      if (!access) return { ok: false, error: "No stored token for this account.", retryable: false };
      const author = String(account.external_id); // urn:li:organization:123

      let mediaContent: Record<string, unknown> | undefined;
      if (input.mediaKind === "image" && input.mediaUrls[0]) {
        const asset = await uploadImage(access, author, input.mediaUrls[0]);
        if ("error" in asset) return { ok: false, error: asset.error, retryable: asset.retryable };
        mediaContent = { media: { id: asset.urn } };
      }
      // Video posting uses the Videos upload API (register → upload → reference);
      // not implemented here — add once the app is approved and testable.

      const body = {
        author,
        commentary: input.caption,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        ...(mediaContent ? { content: mediaContent } : {}),
      };
      const r = await httpPostJson<unknown>(`${API}/rest/posts`, body, { ...headers(access), "content-type": "application/json" });
      // The created post id comes back in the x-restli-id / x-linkedin-id header, which fetch exposes via the response; our helper returns the body, so fall back to a best-effort id.
      if (!r.ok) return fail(r);
      const id = (r.data as { id?: string } | null)?.id ?? "posted";
      return { ok: true, platformPostId: id, url: id.startsWith("urn:") ? `https://www.linkedin.com/feed/update/${id}` : null };
    },

    async getStatus(_account, _token, containerId): Promise<PublishResult> {
      return { ok: true, platformPostId: containerId, url: null };
    },

    async fetchMetrics() {
      // Organization share statistics API; left for the analytics phase.
      return null;
    },
  } satisfies SocialProvider as SocialProvider;
}

// Register + upload a single image, returning its asset urn.
async function uploadImage(access: string, author: string, publicUrl: string): Promise<{ urn: string } | { error: string; retryable: boolean }> {
  const init = await httpPostJson<{ value: { uploadUrl: string; image: string } }>(`${API}/rest/images?action=initializeUpload`, { initializeUploadRequest: { owner: author } }, { authorization: `Bearer ${access}`, "LinkedIn-Version": VERSION, "content-type": "application/json" });
  if (!init.ok) return { error: init.error, retryable: isRetryableStatus(init.status) };
  const bytes = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
  if (!bytes) return { error: "Couldn't read the image to upload.", retryable: true };
  const up = await fetch(init.data.value.uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${access}` }, body: Buffer.from(bytes) }).catch(() => null);
  if (!up || !up.ok) return { error: "LinkedIn image upload failed.", retryable: true };
  return { urn: init.data.value.image };
}
