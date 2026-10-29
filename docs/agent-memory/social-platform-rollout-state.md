---
name: social-platform-rollout-state
description: "Live-vs-pending status of the Social Media module's platform connections and the outstanding follow-ups"
metadata:
  node_type: memory
  type: project
  originSessionId: 824ead93-2e09-425b-a56b-c045e7353628
  modified: 2026-10-29T13:15:40.044Z
---

Going-live state of the Social Media module (as of 2026-10-29):

- **Facebook / Instagram / Threads** — live, public posting. Meta app approved enough for HMARK's own accounts. Threads uses its OWN app creds (`THREADS_APP_ID`/`THREADS_APP_SECRET`), separate from the Meta app.
- **TikTok** — connected in **sandbox** only (private/self-only to @hmark.consultants). Production app **submitted for review 2026-10-29**. Vercel currently holds the **sandbox** `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`. **After TikTok approves, swap those back to the PRODUCTION key/secret (prod key `awm9qoe803r18657`) and redeploy** — otherwise public posting still won't work. `photo.publish` was dropped from the requested scope (app doesn't grant it); video only.
- **LinkedIn** — blocked: needs Company Page verification + **Community Management API** approval (LinkedIn review, not instant). App created, Sign In with LinkedIn + CM API requested.
- **Snapchat** — not set up; provider OAuth exists but publish() is intentionally not wired (needs Public Profile content API access).

Vercel env (Production): `SOCIAL_LIVE=yes`, `META_APP_ID/SECRET`, `THREADS_APP_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET` (sandbox for now). A platform goes live only when SOCIAL_LIVE=yes AND its creds exist, else it stays on the sandbox mock.

Public `/terms` and `/privacy` pages were added to the portal (served from `public`/page routes, opened in the proxy) specifically because every platform's app review needs reachable legal URLs. Company specifics (contact email `info@hmarkconsultants.com`, governing law) are placeholders to confirm. May later point to hmarkconsultants.com's own pages.

The user drove all the platform-console steps by hand with screenshots; TikTok was by far the hardest (sandbox + target-user flow). See [[decide-dont-ask]] and [[user-tests-on-live-portal]].
