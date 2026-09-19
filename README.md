# Case Flow

Internal student-case management portal for HMark Consultants — tracks students through the study-abroad journey from inquiry to enrollment, with a document checklist tracker for counselors and admin.

Phase 1 scope, design rationale, and build plan: see the published design artifacts (Case Flow Canvas, Case Flow Blueprint) shared in project discussion.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Supabase (Postgres, Auth, Storage)
- Vercel (hosting)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` — see `.env.example`.

## Checks

### On every commit

`.githooks/pre-commit` runs four checks and refuses the commit if any fails. It is installed by `npm install` (the `prepare` script points git at `.githooks`), so it arrives with a clone.

| | scope | ~time |
| --- | --- | --- |
| `npm run typecheck` | whole project — types cross files | 5s |
| `eslint` | staged files only. The whole tree is `npm run lint`, but at 49s in the hook it costs a minute to learn nothing more about a three-file commit | 8s |
| `npm test` | 674 unit tests | 6s |
| `npm run build` | last, and only if the three above passed | 30s |

About 35s for a commit that changes source, 9s for one that cannot affect a build. For a deliberate work-in-progress commit: `git commit --no-verify`.

### By hand

These four exist because each covers something that **fails silently** — no error, no failed build, just a wrong result nobody notices. That is also why none of them is in the commit gate: they are slow, and two of them write to the live database.

| | what it covers |
| --- | --- |
| `npm run check:hook` | The pre-commit hook itself, 36 scenarios. Run after changing it — it once skipped eslint and the build for `.ts` and `.mjs` files while still reporting success. Takes ~10 minutes and refuses a dirty tree, since it resets `--hard`. |
| `npm run check:xlsx -- -Path <file.xlsx>` | Opens a generated workbook in real Excel over COM. The import template's dropdowns are hand-written OOXML (`src/lib/xlsxDropdowns.ts`); a wrong element order makes Excel offer to "repair" the file, and every reader in the test suite parses it happily. Windows and Excel only. |
| `npm run check:roles` | Multi-role staff: access is the union of roles, only a Super Admin grants Super Admin, everybody keeps at least one role. The refusals are enforced by `set_staff_roles`, so they are checked against the database, not the form. |
| `npm run check:pay` | Pay lives on `staff_compensation`, not `staff`. Checks both halves: Super Admin and Finance still get what payroll needs through the app, and nobody else can reach it through the API. |

`check:roles` and `check:pay` drive a browser against the deployed portal and create real (self-deleting) staff accounts in the live Supabase project, so they refuse to start without an explicit opt-in:

```bash
VERIFY_AGAINST_PRODUCTION=yes npm run check:roles
```

They need Playwright, which is deliberately not a dependency — Vercel would download a browser on every build for tooling the app never uses:

```bash
npm install --no-save playwright pg exceljs
```

Any `npm install` prunes those three, so reinstall them together.
