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
- Supabase (Postgres, Auth, Storage) — **ap-southeast-2, Sydney**
- Vercel (hosting) — functions pinned to **syd1, Sydney**

### Why the functions are pinned to Sydney

`vercel.json` sets `"regions": ["syd1"]`, and it matters more than it looks. The functions used to run in Vercel's default `iad1` (Washington DC) while the database sits in Sydney, so every query crossed the Pacific twice — about 210ms, against about 2ms in-region. A page here makes six or seven round trips one after another before it can render (the proxy's `getUser`, its office-access check, the session lookup, then two waves of page queries), so that was roughly one and a half seconds of pure network on every navigation. Pinning the functions beside the database removed it. Karachi to Sydney is also marginally shorter than Karachi to Virginia, so users lost nothing.

The better end state for a Karachi office is both in `ap-south-1` (Mumbai), about 40ms from the users rather than 180ms. Supabase cannot change a project's region in place, so that means migrating to a new project — a separate, planned job. **Do not move the functions to `bom1` on their own:** the queries would still cross to Sydney and every page would get slower, not faster.

`npm run check:speed` measures this. It signs in and times each page, and prints the median of several loads. Time-to-first-byte is flat at about 80ms everywhere because the App Router flushes a shell and streams the rest, so it ranks pages by full load instead.

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
| `npm test` | 745 unit tests | 6s |
| `npm run build` | last, and only if the three above passed | 30s |

About 35s for a commit that changes source, 9s for one that cannot affect a build. For a deliberate work-in-progress commit: `git commit --no-verify`.

### By hand

These eight exist because each covers something that **fails silently** — no error, no failed build, just a wrong result nobody notices. That is also why none of them is in the commit gate: they are slow, and most of them write to the live database.

| | what it covers |
| --- | --- |
| `npm run check:hook` | The pre-commit hook itself, 36 scenarios. Run after changing it — it once skipped eslint and the build for `.ts` and `.mjs` files while still reporting success. Takes ~10 minutes and refuses a dirty tree, since it resets `--hard`. |
| `npm run check:xlsx -- -Path <file.xlsx>` | Opens a generated workbook in real Excel over COM. The import template's dropdowns are hand-written OOXML (`src/lib/xlsxDropdowns.ts`); a wrong element order makes Excel offer to "repair" the file, and every reader in the test suite parses it happily. Windows and Excel only. |
| `npm run check:roles` | Multi-role staff: access is the union of roles, only a Super Admin grants Super Admin, everybody keeps at least one role. The refusals are enforced by `set_staff_roles`, so they are checked against the database, not the form. |
| `npm run check:pay` | Pay lives on `staff_compensation`, not `staff`. Checks both halves: Super Admin and Finance still get what payroll needs through the app, and nobody else can reach it through the API. |
| `npm run check:studentid` | Student IDs by intake (0260). The number restarts at 0001 for every intake; a student with no intake yet holds their place by registration date so a later one cannot overtake them; a back-dated import takes the next free number and renumbers nobody; and no Student ID means no portal, with `portal_active` deliberately left on to prove staff cannot wave one through. The first two rules pull against each other and the whole thing is triggers and a held-places table, so nothing about it shows up in a build. |
| `npm run check:catalogue` | The catalogue imports: Super Admin only, previewed before they write, adding or updating across as many destinations as the sheet names. Asserts on what the database holds, because each of these fails without erroring: a preview writes nothing; an empty cell leaves the stored value alone (a partial sheet must not blank the columns it does not mention); a similar name updates the one record it resembles and keeps the stored name, without duplicating it, while a name close to two records — or a programme already on file twice — is held back and touches neither; and a counsellor is not offered the import. Admission rounds from the Rounds sheet reach the scope they name (a whole university, a level, or one programme, including programmes created by the same upload), merge by name without removing anything, keep the id of a round they update, and leave the soonest open deadline first, which is what reminders read. Also asserts the round trip for one destination and for all of them: export through /api/export/catalogue, upload it back untouched, and nothing may happen — if a clean round trip reports changes then every real edit is carrying changes nobody asked for. Works in `zztmp` destinations of its own. `PORTAL_URL=http://localhost:3000` runs it against a local `next start` before deploying. |
| `npm run check:buttons` | Every button as wide as its text, and a Save that says so beside itself. Signs in as a Super Admin and a registered student, visits every page their navigation links to (opening each collapsible section), and flags any button more than 16px wider than its content — a flex column or grid cell stretches whatever it holds, so only the rendered layout can tell. Rows that are full width by design carry `data-full-width` (or sit in `[data-menu]`). Also presses Save on a student profile and asserts the confirmation appears on the same line, to its right. |
| `npm run check:staffcreds` | A Super Admin issuing a staff member's login, asserted on the login itself: the new password signs in and the old one does not, a session already open is ended, Reveal shows the password that was issued, Management is neither offered the panel nor let through by the database (the functions and the `staff_login_credentials` table refuse them directly), and editing the official email moves the login with it. Needs migration 0270. |
| `npm run check:staffagreements` | Staff agreements (0271), on outcomes: a staff template is written in the Staff tab and one carrying a student placeholder is refused; a generated agreement is a real PDF and generating for someone missing a field the wording uses is refused and leaves nothing behind; the signing loop (send, returned, sent back with a note they see, returned, verified) moves the status the database holds; an agreement signed outside the portal is filed straight to signed from Staff Management; a staff member never sees a draft or anyone else's; Management gets no Staff tab and is refused the tables, the files and the submit function — until the permission is granted to them. |
| `npm run check:leave` | Staff leave (0272), on what the database and payroll hold: a request is previewed for the approver and approving fixes its days as paid; payroll does not count paid leave as an absence, counts and labels unpaid leave, and treats an office holiday as nobody's working day; sick leave without a certificate is unpaid; overlapping leave is refused and a pending request can be withdrawn; nobody decides their own leave, in the page or in the database; a counsellor can neither open the Leave page nor read anyone else's leave. Adds and removes one zztmp office holiday in last month. |
| `npm run check:pageaccess` | The menu and the pages agree on who may open what (0273): finance and a counsellor each see only their own pages, a section with nothing left in it is not shown, and typing a hidden page's address — or a detail page under it — shows the guard's refusal rather than the page. A Management member holding staff.manage sees the official email read-only, a forged save is refused with its reason, and neither the staff row nor their login email moves (0274). Needs migrations 0273 and 0274. |
| `npm run check:uploads` | Uploads up to 5 MB, sent from the browser straight into a staging bucket (0275) rather than through Vercel, which refuses any request over 4.5 MB: a 4.8 MB certificate arrives whole and no server request carries it; Submit pressed mid-upload is sent when the upload lands; a 5.3 MB PDF is refused with advice and nothing uploaded; an oversized photo is offered Shrink to fit and nothing is uploaded until it is pressed; Storage itself refuses an over-limit file, another person's folder and reading another person's file. Needs migration 0275. |
| `npm run check:dashboards` | The role dashboards and a counsellor's stages-only view of a registered student. The counsellor gets no processing tabs, is refused the processing pages and sees a read-only profile without the visa history; the database refuses their stage, document and application changes after registration (0276) while processing, and the counsellor before registration, still can; saving the Registration card keeps the country stages; payroll is private (0277). Each role gets its own dashboard with its own figures — the counsellor's stale lead and registered student, the officer's waiting document, every tab for Super Admin, Management's overview. Needs migrations 0276 and 0277. |
| `npm run check:login` | The login screen's figures (0278): the public page shows the stored figures in order, the headline and the photo; a Super Admin's change on Setup → Login screen shows on the public page at once, which proves saving clears its cache; a counsellor is refused the Setup page and the database refuses their writes. Changes only the last figure's icon, for seconds, and puts it back through the same page. Needs migration 0278. |
| `npm run check:agreement` | Every branch of the agreement flow through the deployed UI: paper (staff upload the scan), e-signature (the student submits, staff approve), sending either half back (undo one approval, reject that half with a reason, the student replaces only it, staff approve again), editing an unsigned one, and deleting one. Checks it reaches a signed agreement, an open portal and exactly one booked commission, that an edit leaves the PDF alone until Regenerate PDF is pressed, and that a delete takes every file with it — including the ones a rejection archived, since an orphan under a student's own folder stays readable by them — and closes the portal when nothing is left to justify it. It is the hinge of the system and the hardest thing to notice going wrong: the e-signature student was locked out of the only page that could advance it, and paper agreements booked no commission at all. Takes ~6 minutes. |
| `npm run check:invoice` | The invoice flow: the fee, the SRB tax on it, the administrative charge riding on the first installment, and a last installment that falls due on an admission rather than a date — then the PDF, an added item (taxed, collected on the first instalment while nothing is paid and on the next unpaid one once money has come in, removable, and visible to the student — it used to reach the staff card and nothing else), a send that cannot go, taking a payment, splitting an instalment on a part payment (the balance becomes an instalment of its own, so something chases it), the tokenised receipt link (the one public surface that serves a named person's financial document), what the student is shown on their payments page, that the daily overdue-reminder cron refuses a stranger (its dry run names the students it would chase), deleting, and the Invoice Generator page — where a discount, a nine-instalment plan and the live preview are checked by comparing the figures on screen with the rows written. The arithmetic is computed in one place and printed in four (preview, stored instalments, PDF, email), and a public-track destination must bill in EUR whatever the form says. |
`check:roles`, `check:pay`, `check:studentid`, `check:catalogue`, `check:buttons`, `check:staffcreds`, `check:staffagreements`, `check:leave`, `check:pageaccess`, `check:uploads`, `check:dashboards`, `check:login`, `check:agreement` and `check:invoice` drive a browser against the deployed portal and create real (self-deleting) staff, student and agreement records in the live Supabase project, so they refuse to start without an explicit opt-in:

```bash
VERIFY_AGAINST_PRODUCTION=yes npm run check:roles
```

They point at `https://portal.hmarkconsultants.com`. Set `PORTAL_URL` to aim
them somewhere else — a preview deployment, or a local `next dev`.

They need Playwright, which is deliberately not a dependency — Vercel would download a browser on every build for tooling the app never uses:

```bash
npm install --no-save playwright pg exceljs
```

Any `npm install` prunes those three, so reinstall them together.
