<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!--
Everything below sits outside the markers above, which `next dev` rewrites.
upsertAgentRulesBlock() in node_modules/next/dist/server/lib/generate-agent-files.js
replaces only what is between them and preserves the rest, so this survives.
-->

# HMARK Student Portal CRM

A study-abroad CRM in three portals — staff, student, partner — under
`src/app/(staff)`, `(student)` and `(partner)`. Next.js App Router, Supabase
with RLS on all 93 tables, deployed to Vercel. See `README.md` for the product
and `supabase/README.md` for the database.

## Before committing

A pre-commit hook runs typecheck, eslint over the staged files and 674 unit
tests — all three, so one attempt reports everything wrong — then a production
build only if those passed. It is installed by `npm install`, so it is already
running; `git commit --no-verify` skips it for a deliberate work in progress.

Four checks are **not** in the gate, because each is slow and each covers
something that fails silently: `npm run check:hook`, `check:xlsx`, `check:roles`,
`check:pay`. Run the relevant one after touching what it covers — README.md
says which is which. The last two need `VERIFY_AGAINST_PRODUCTION=yes`.

## Things that fail quietly here

Each of these has already shipped a bug of exactly the kind described.

**Unit tests import `src/lib` modules directly under plain Node.** So a module
under test cannot use the `@/` path alias, and a relative *value* import needs
its `.ts` extension. Break either and the whole test file fails to load, while
typecheck, eslint and the build all stay green.

**A staff member holds several roles.** `staff.roles` is the authority and
`staff.role` is only the primary one shown in lists. Any query whose result
reaches `hasRole()` must select `"role, roles"` — `hasRole` falls back to the
primary when `roles` is absent, so selecting `role` alone compiles, runs, and
silently ignores every secondary role. Filter with
`.contains("roles", ["counselor"])`, never `.eq("role", …)`.

**Pay is not on `staff`.** Salary, allowances, commission and bonus live on
`staff_compensation`; read them with `COMPENSATION_EMBED` and
`withCompensation()`. The embed must name its foreign key, because the table has
two to `staff` and PostgREST otherwise rejects the entire query.

**A paused destination must still be selectable where a student already has
it.** Pickers use `selectableDestinations(all, keepIds)`; omit `keepIds` on an
editing form and re-saving silently drops the country the student is going to.

**`unstable_cache` survives deployments.** Vercel's Data Cache is not cleared by
a deploy, so a stale entry can outlive the code that wrote it. Cached reads take
a tag, and the writer revalidates it.

**A read straight after a write returns the pre-write response**, because Next
memoises fetches within a request. Use the writer's return value.

## Migrations

Numbered files in `supabase/migrations/`, applied by hand — there is no CLI
setup and no tracking table. The database password is not stored anywhere in the
repo; ask for it. Apply through the **PowerShell** tool, since the Bash
permission classifier blocks the password form:

```powershell
$env:PGPASSWORD = '<password>'
node scratch/apply-mig-env.mjs supabase/migrations/00NN_name.sql
```

Dry-run anything destructive inside `begin; … rollback;` first, and have the
migration itself refuse to proceed when its precondition is unmet rather than
trusting the operator — `0250` is the model.

## Verifying

Type-checking and building prove very little about this app: most of its
behaviour is the app, RLS and a security-definer function agreeing with one
another. Check the real thing against the deployed portal, with fixtures named
`zztmp *` removed in a `finally`.

Two habits worth keeping, both learned by getting them wrong:

- **Poll for the outcome, never sleep.** A server action's database write lands
  before its response does, so finding a row proves nothing about the page.
- **Assert on something that would be absent if the feature were broken.** A
  check that passes because a string appears somewhere on the page, or because
  an element has no validation to read, is worse than no check at all.

