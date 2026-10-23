# Social Media module — external setup

This is what **you** do in each platform's developer console to let the portal
publish to HMARK's accounts. Nothing here is needed to use the module in
**sandbox mode** (the default) — the whole UI, calendar and scheduler work with
test accounts first. Do this when you're ready to go live, then set
`SOCIAL_LIVE=yes` and fill the matching env vars (see `.env.example`).

Tokens are encrypted at rest in Postgres (pgcrypto, the portal's existing Vault
key) and are never exposed to the browser or logs. Secrets you paste below go
only in environment variables — **never commit them**.

## Redirect URIs (register both for every app)

| | URL |
|---|---|
| Production | `https://portal.hmarkconsultants.com/api/social/oauth/<platform>/callback` |
| Local dev | `http://localhost:3000/api/social/oauth/<platform>/callback` |

`<platform>` is one of `facebook`, `instagram`, `threads`, `linkedin`,
`tiktok`, `snapchat`.

---

## 1–3. Meta: Facebook, Instagram, Threads (one app)

Facebook, Instagram and Threads share **one** Meta app, but stay separate inside
the portal.

1. **developers.facebook.com → Create App** → type **Business**.
2. Add products: **Facebook Login**, **Instagram** (Instagram Graph API /
   Instagram with Facebook Login), and **Threads API**.
3. **Permissions/scopes** to request in App Review:
   - Facebook Page posting: `pages_show_list`, `pages_read_engagement`,
     `pages_manage_posts`, `business_management`.
   - Instagram publishing: `instagram_basic`, `instagram_content_publish`
     (+ the Page permissions above — IG publishing goes through the linked Page).
   - Threads: `threads_basic`, `threads_content_publish`.
4. Add both redirect URIs under Facebook Login → Settings → Valid OAuth Redirect
   URIs (and the Threads app's redirect settings).
5. Copy **App ID** and **App Secret** → `META_APP_ID`, `META_APP_SECRET`.

**Limitations — read before promising dates:**
- **Instagram must be a Business or Creator account linked to a Facebook Page.**
  A personal IG account cannot publish via the API.
- Meta requires **App Review + Business Verification** before the publishing
  permissions work for accounts other than the app's own admins/testers. Allow
  time for this. Until then, add HMARK's accounts as **testers** to publish.

---

## 4. LinkedIn (Page)

1. **linkedin.com/developers → Create app**, linked to the HMARK **Company
   Page**.
2. Products: request **Community Management API** (this is what allows posting
   as a Page). Also **Sign In with LinkedIn using OpenID Connect**.
3. Scopes: `w_organization_social`, `r_organization_social`,
   `rw_organization_admin`, `openid`, `profile`.
4. Add both redirect URIs under Auth → OAuth 2.0 settings.
5. Copy **Client ID** / **Client Secret** → `LINKEDIN_CLIENT_ID`,
   `LINKEDIN_CLIENT_SECRET`.

**Limitation:** Page posting needs **approved Community Management API access** —
LinkedIn reviews this and it is not instant.

---

## 5. TikTok

1. **developers.tiktok.com → Manage apps → Create**.
2. Add the **Content Posting API** product; enable **Direct Post**.
3. Scopes: `video.publish`, `video.upload`, `user.info.basic` (and
   `photo.publish` for photo-mode posts).
4. Add both redirect URIs.
5. Copy **Client Key** / **Client Secret** → `TIKTOK_CLIENT_KEY`,
   `TIKTOK_CLIENT_SECRET`.

**Limitation:** an **unaudited** TikTok app can only post **privately** (self-only)
until it passes TikTok's audit. The composer collects the required **privacy
level** and **commercial-content disclosure** fields regardless.

---

## 6. Snapchat

1. **business.snapchat.com** — create/own a **Public Profile** for HMARK.
2. **developers.snap.com → create an app** and request **Public Profile API /
   Marketing API** access.
3. Scopes: `snapchat-marketing-api` (and the public-profile content scopes Snap
   grants on approval).
4. Add both redirect URIs.
5. Copy **Client ID** / **Client Secret** → `SNAPCHAT_CLIENT_ID`,
   `SNAPCHAT_CLIENT_SECRET`.

**Limitations:** requires a **Public Profile (Business)** and **approved API
access**. After connecting, you choose which Public Profile to publish to.
Destinations are **Story**, **Saved Story** (short title limit) and **Spotlight**
(short vertical video, limited length/size).

---

## If TikTok or Snapchat approval is blocking you

Both can take a while. If you need to go live before then, tell me and I can add
a **third-party publishing API** (e.g. Ayrshare) behind the same `SocialProvider`
interface for just those platforms — no change to the composer, calendar or
scheduler. I won't switch to a third party without asking you first.

## Sandbox vs live

- **Sandbox (default, `SOCIAL_LIVE` unset):** "Connect" creates a test account;
  posts "publish" to a fake URL. Use this to try the whole workflow now.
- **Live (`SOCIAL_LIVE=yes`):** the real providers are used for any platform
  whose app credentials are set; anything not yet configured stays on sandbox.
