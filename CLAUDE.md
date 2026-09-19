@AGENTS.md

<!--
The import above is the point of this file. Everything the project needs an
agent to know lives in AGENTS.md, so it reaches every tool rather than only
this one. Put project rules there. What follows is only the handful of things
specific to working here through Claude Code.

`next dev` does not rewrite this file. writeAgentFiles() in
node_modules/next/dist/server/lib/generate-agent-files.js skips CLAUDE.md
whenever AGENTS.md already hosts its block, which it does.
-->

# Working here

## Secrets

`.env.local` holds the Supabase anon and service-role keys, SMTP credentials
and the E2E login. Read them; never echo one into the transcript, a commit, a
log line or a scratch file. The service-role key bypasses RLS entirely.

**The database password is not in the repo and not in `.env.local`** — it is
only in the Supabase dashboard. Ask for it each time rather than hunting for
it, and pass it through `$env:PGPASSWORD` rather than a command line.

## Tool choice

Migrations and any read-back that needs the database password go through the
**PowerShell** tool. The Bash tool's permission classifier refuses the command
shape that carries the password, including the env-var variant; the same
command through PowerShell is allowed. AGENTS.md has the exact invocation.

Otherwise prefer Bash — the repo's scripts are `sh` and `node`, and PowerShell
5.1 here is old enough to be its own hazard: no `&&`, no ternary, and it reads
a file without a BOM as ANSI, so a UTF-8 dash in a `.ps1` breaks string parsing
with errors pointing many lines away.

## Scratch files

`scratch/` is gitignored and holds only the two migration runners. Anything
temporary — a one-off probe, a fixture, a downloaded artifact — belongs in the
session scratchpad directory, not here, so it does not accumulate. Verification
worth keeping is worth committing to `scripts/`, where the existing ones live.

Some scratch work needs `playwright`, `pg` and `exceljs`, which are deliberately
not dependencies. Install them together, because any `npm install` prunes what
is not in `package.json`:

```bash
npm install --no-save playwright pg exceljs
```

## Committing

A pre-commit hook runs the gate, so a commit takes up to ~35s and may be
refused; that is it working. Do not reach for `--no-verify` to get past a
failure. `git commit -F <file>` with a message file avoids the heredoc mistakes
that `-F -` invites.
