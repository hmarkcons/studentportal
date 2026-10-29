# Agent memory (shared snapshot)

Working notes captured by Claude Code while building recent features, copied
here so they're versioned and visible to the team. They originate from a
per-developer memory folder outside the repo (`~/.claude/projects/.../memory/`),
so this is a **point-in-time snapshot** — it does not auto-update.

Each file has `metadata.type` frontmatter from the memory system; ignore it when
reading. These are informal notes, not formal docs — the authoritative product
and database docs remain `README.md`, `AGENTS.md`, and `supabase/README.md`.

## Files
- **session-oct-2026-overview.md** — index of the whole late-October-2026 work stretch (visa types, application-suggestions highlight, per-section permissions, Social Media module A–G, platform connect, UI components, merged-PDF download), with pointers to the notes below.
- **social-platform-rollout-state.md** — Social Media module go-live state (Facebook/Instagram/Threads live; TikTok in sandbox pending review; LinkedIn/Snapchat pending). Includes the reminder to swap the TikTok Vercel keys back to production after approval.
- **integrating-21st-components.md** — how to adapt a pasted 21st.dev / Aceternity component into this Tailwind-v4 project (local `cx`, `<img>` not `next/image`, token mapping, self-contained `<style>`, `/preview/*` pages).
- **document-download-pdf.md** — the merged-PDF document download ("Download all" / "Download selected") and the now-dead ZIP component pending removal.
- **ui-tooling-installed.md** — the UI/UX Pro Max skill (`uipro-cli`) and Python 3.12 install (winget), including the Windows `python3.exe` / PATH fixes.
