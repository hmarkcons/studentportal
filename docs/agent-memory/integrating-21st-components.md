---
name: integrating-21st-components
description: How to adapt a 21st.dev / Aceternity React component into this Tailwind-v4 project
metadata:
  node_type: memory
  type: feedback
  originSessionId: 824ead93-2e09-425b-a56b-c045e7353628
  modified: 2026-10-29T18:52:48.155Z
---

Integrating a pasted 21st.dev / shadcn component here (did ~7 in Oct 2026: aurora-background, connected-carousel, elastic-gallery, elegant-dark-pattern, velaris, gradual-spacing, text-block-animation).

**Why:** the project is Tailwind v4 + a custom token system, not a stock shadcn app, so pasted components never drop in unchanged.

**How to apply — the standard adaptations:**
- **Getting the code:** 21st.dev's registry is **auth-gated** (anonymous fetch returns "Authentication required", code isn't in the page HTML). So the user pastes the full "integrate this component" block; only reproduce a component yourself if it's a well-known public one (e.g. Aceternity aurora).
- **No `cn` util exists** → add a tiny local `cx(...parts)` joiner in the file.
- **`next/image` → plain `<img>`** with `{/* eslint-disable-next-line @next/next/no-img-element ... */}` — next.config has **no `images.remotePatterns`**, and the repo already uses `<img>` for remote stock URLs (see perspective-tunnel-hero).
- **shadcn tokens → project tokens:** `bg-card`/`text-card` exist; map `text-foreground`→`text-ink`, `bg-secondary`→`bg-border`, `text-muted-foreground`→`text-muted`, `ring-ring`→`ring-primary`, accent colors → brand `#52be96` (`bg-primary`/`accent-primary`). Opacity modifiers like `text-ink/85` work.
- **Tailwind v4 has no `tailwind.config.js`** → don't "extend the config". Put keyframes/animations in a **self-contained `<style>`** in the component; drive dark mode with the portal's `data-theme` convention (`:root[data-theme="dark"]` + guarded `@media (prefers-color-scheme: dark)`), not the `dark:` class.
- **Add a props interface** if the original has none (strict typecheck fails on implicit-any props), and fix strict-null (`node.parentNode?`).
- **Images:** replace the 21st.dev CDN URLs with Unsplash, and **curl each to confirm HTTP 200** before committing.
- **Preview:** add a standalone page at `src/app/preview/<name>/page.tsx` that renders the component full-screen. These sit outside the route groups (root layout only, no sidebar) and are **behind auth** (the proxy only opens /login, /register/partner, /terms, /privacy) — the signed-in user views them at `portal.hmarkconsultants.com/preview/<name>`.
- `framer-motion` + `lucide-react` are already deps; **gsap + @gsap/react** were added for text-block-animation. Flag any other new dep before adding ([[decide-dont-ask]]).

See [[adding-a-gated-staff-section]] for the proxy/public-path rules those preview pages rely on.
