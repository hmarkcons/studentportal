---
name: ui-tooling-installed
description: UI/UX Pro Max skill (uipro-cli) and Python 3.12 installed on this machine in Oct 2026
metadata:
  node_type: memory
  type: reference
  originSessionId: 824ead93-2e09-425b-a56b-c045e7353628
  modified: 2026-10-29T19:03:19.607Z
---

Tooling installed late Oct 2026 for the UI work on this machine.

**UI/UX Pro Max skill** — installed via `uipro-cli` (global npm, `npm i -g uipro-cli`, v2.2.3). `uipro init --ai claude` writes it to `.claude/skills/ui-ux-pro-max/` (SKILL.md + CSV design data + Python scripts); `--ai cursor` writes `.cursor/`. A user-level copy also exists at `~/.claude/skills/ui-ux-pro-max/` (from 2026-10-23), so the skill is available across projects. **`.cursor/` was added to the repo `.gitignore`** (`.claude/` was already there) so neither pollutes the repo. Avoid `uipro init --ai all` — it creates ~13 extra, non-gitignored assistant folders (.windsurf, .github, .gemini, …) that then need deleting. Update with `uipro update`.

**Python 3.12.10** — installed via winget (`winget install -e --id Python.Python.3.12`) at `%LOCALAPPDATA%\Programs\Python\Python312`, because the skill's `search.py` / `design_system.py` need it (and only the Windows Store **alias stubs** were on PATH before). Two Windows fixes applied:
- Windows Python ships `python.exe` but **not `python3.exe`**, and the skill calls `python3` — so a `python3.exe` copy was placed next to `python.exe`.
- The real Python dirs are **ahead of `…\WindowsApps`** in the registry user PATH, so a **fresh** terminal resolves `python`/`python3` to the real Python (the Store stub no longer shadows). An already-open shell keeps the stale PATH — call Python by full path there, or restart.

Node + Git were likewise winget-installed earlier ([[git-installed-via-winget]]).
