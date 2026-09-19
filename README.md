# HMARK Student Portal CRM

The study-abroad CRM for HMARK Consultants, in three parts:

- **Company & Staff Portal** — the core CRM: leads through registered students, applications, visa and enrollment, with the university and course catalogue, document management, finance and commission, marketing, reporting, and a per-country documentation tracker whose stages and requirements differ by destination.
- **Student Portal** — self-service for the student once their signed agreement is on file: documents, application progress, payments, appointments, messages and support.
- **Partner University Portal** — university staff review applications, maintain their own course directory, and track commissions, feeding back into the staff portal's catalogue.

Seven roles, from Super Admin to Digital Marketing; a staff member can hold several at once and their access is the union of them.

This supersedes the earlier "Case Flow" scope, which described a lighter internal case tracker.

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

These six exist because each covers something that **fails silently** — no error, no failed build, just a wrong result nobody notices. That is also why none of them is in the commit gate: they are slow, and two of them write to the live database.

| | what it covers |
| --- | --- |
| `npm run check:hook` | The pre-commit hook itself, 36 scenarios. Run after changing it — it once skipped eslint and the build for `.ts` and `.mjs` files while still reporting success. Takes ~10 minutes and refuses a dirty tree, since it resets `--hard`. |
| `npm run check:xlsx -- -Path <file.xlsx>` | Opens a generated workbook in real Excel over COM. The import template's dropdowns are hand-written OOXML (`src/lib/xlsxDropdowns.ts`); a wrong element order makes Excel offer to "repair" the file, and every reader in the test suite parses it happily. Windows and Excel only. |
| `npm run check:roles` | Multi-role staff: access is the union of roles, only a Super Admin grants Super Admin, everybody keeps at least one role. The refusals are enforced by `set_staff_roles`, so they are checked against the database, not the form. |
| `npm run check:pay` | Pay lives on `staff_compensation`, not `staff`. Checks both halves: Super Admin and Finance still get what payroll needs through the app, and nobody else can reach it through the API. |
| `npm run check:agreement` | Every branch of the agreement flow through the deployed UI: paper (staff upload the scan), e-signature (the student submits, staff approve), sending either half back (undo one approval, reject that half with a reason, the student replaces only it, staff approve again), editing an unsigned one, and deleting one. Checks it reaches a signed agreement, an open portal and exactly one booked commission, that an edit leaves the PDF alone until Regenerate PDF is pressed, and that a delete takes every file with it — including the ones a rejection archived, since an orphan under a student's own folder stays readable by them — and closes the portal when nothing is left to justify it. It is the hinge of the system and the hardest thing to notice going wrong: the e-signature student was locked out of the only page that could advance it, and paper agreements booked no commission at all. Takes ~6 minutes. |
| `npm run check:invoice` | The invoice flow: the fee, the SRB tax on it, the administrative charge riding on the first installment, and a last installment that falls due on an admission rather than a date — then the PDF, a send that cannot go, taking a payment, and deleting. The arithmetic is computed in one place and printed in four (preview, stored installments, PDF, email), and a public-track destination must bill in EUR whatever the form says. |
`check:roles`, `check:pay`, `check:agreement` and `check:invoice` drive a browser against the deployed portal and create real (self-deleting) staff, student and agreement records in the live Supabase project, so they refuse to start without an explicit opt-in:

```bash
VERIFY_AGAINST_PRODUCTION=yes npm run check:roles
```

They need Playwright, which is deliberately not a dependency — Vercel would download a browser on every build for tooling the app never uses:

```bash
npm install --no-save playwright pg exceljs
```

Any `npm install` prunes those three, so reinstall them together.
