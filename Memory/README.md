# Work log

A record of what was changed and why, kept in the repo so it travels with a
clone. Written 2026-09-21.

Nothing here is a credential. Passwords and keys live in the Supabase and Vercel
dashboards; this file names where to look, never the value.

---

## Picking up on another machine

Everything of substance is in git. Four things are not:

1. **`.env.local`** — gitignored. `.env.example` lists every variable the app
   reads, with a note on what happens when each is unset. Copy the real file
   across, or refill it from the Supabase dashboard (Project Settings → API)
   plus your SMTP details.
2. **`scratch/`** — gitignored, and it holds the two migration runners
   (`apply-mig-env.mjs`, `apply-migrations.mjs`). Without them migrations
   cannot be applied. Copy them over.
3. **Dependencies**

   ```bash
   npm install                                   # also installs the git hooks (prepare script)
   npm install --no-save playwright pg exceljs   # all three together — any npm install prunes them
   npx playwright install chromium               # the browser the check:* scripts drive
   ```
4. **`vercel link`** — `.vercel/` is gitignored, so relink to
   `team-hmark/studentportal` before using the Vercel CLI.

Nothing server-side moves: the Supabase project, Vercel environment variables,
the cron schedule and the custom domain are all account-level.

**Confidence check on a new machine:**

```bash
npm test                                             # 745 unit tests, ~3s
VERIFY_AGAINST_PRODUCTION=yes npm run check:invoice   # ~7 min, 108 assertions
```

The second exercises staff login, the staff UI, the student portal, storage and
the public receipt route against production. If it passes, the machine is wired
up correctly.

The portal is at **https://portal.hmarkconsultants.com**; the older
`studentportal-self.vercel.app` still serves the same deployment. `PORTAL_URL`
overrides the target for the check scripts.

---

## What was built and fixed

Grouped by theme. Each defect below was found by exercising the real deployed
app, not by reading code.

### Multi-role staff, and pay

- Staff can hold several roles. `staff.roles` is the authority; `staff.role` is
  only the primary one shown in lists. 24 pages and actions selected `role`
  alone and then asked `hasRole()`, which silently ignored every secondary
  role — a counselor who was also Finance was refused Finance controls.
- Pay (salary, allowances, commission rates, bonus) moved off `staff` onto
  `staff_compensation`. Policy `staff_select` lets five roles read every staff
  row, and RLS has no column dimension, so a plain counselor could read every
  colleague's salary straight from the API. Verified before and after.

### Agreements

- **An e-signature student could never submit their agreement.** The portal
  opened only for an agreement already signed with a scan on file, but outside
  Karachi the student is the one who submits, from inside the portal. No
  submission, no signed agreement; no signed agreement, no portal. The entire
  `portalGate` module was written for a state nothing could produce. Migration
  0253 opens the portal, gated, as soon as an e-signature agreement exists.
- **Paper agreements never booked the counselor's commission.** A commission can
  only be priced from a signed agreement, so signing is the moment it becomes
  possible. Only the e-signature approval asked for it; `uploadSignedAgreement`,
  which is how a paper agreement gets signed, did not. Paper is most students.
- Deleting the last agreement left the student with a fully open portal and
  nothing on file (migration 0254). Reads are untouched — a processing officer
  still sees their own students.
- The button that renders the PDF answered to the same accessible name as the
  button that creates the agreement, while the edit form told staff to use
  "Regenerate PDF", a control that did not exist.

### Invoices

- **Three of the eight writes in `invoices.ts` had no permission check** —
  `generateInvoice`, `markInstallmentPaid`, `generateInvoicePdf`. The last
  writes the same fields as `updateInstallment`, which does check, so the
  restriction was bypassable by using the other button.
- **`MarkPaidForm` discarded its action result**, so a refused or failed payment
  looked exactly like success: the instalment stayed unpaid and nothing said why.
- **Processing could write to invoices through the API.** Five RLS policies
  granted it, while `generate_invoice`, `issue_receipt_token`, every action in
  `invoices.ts` and every invoice control in the UI said finance and
  super_admin. Migration 0255 moved the policies, which were the outlier. See
  the migration's comment for how to widen it again — it takes two changes,
  because the permission system is app-layer only and RLS does not consult it.
- **The student's payments page said "No due date"** for the last instalment of
  a plan — the one that deliberately has no date and falls due on the admission.
  Its query never selected `due_condition`, so the instalment whose timing is
  most carefully explained everywhere else read as an oversight.

### The dashboard crash

`student_profiles.visa_refusal_history` is `jsonb` holding a list and defaults
to `'[]'`. `trackerPrefill` typed it as a string and read it with
`(x ?? "").trim()`; `??` only catches null and undefined, so the default array
walked into `.trim()` and took the whole student dashboard down with a 500. Any
registered student whose tracker carried a `visa_refusal_reason` field was
affected — which is why one student failed and two loaded.

### Infrastructure and housekeeping

- Pre-commit gate: typecheck → eslint on staged files → 745 unit tests →
  production build. It once silently skipped eslint and the build for `.ts` and
  `.mjs` files while still reporting success; `npm run check:hook` exists
  because of that.
- npm advisories cleared to zero with no `overrides`; `exceljs` replaced with
  `write-excel-file` / `read-excel-file`, dropdowns validated in real Excel.
- README, `supabase/README.md`, `AGENTS.md`, `CLAUDE.md` and the early
  migration headers rewritten against the code as it actually is.
- The Anthropic API key was rotated; scholarship-research failures now email
  someone after three consecutive failures.
- Registered students are handed to the Processing Team automatically
  (fewest caseload first, ties by name).
- `portal.hmarkconsultants.com` was pointed at a stale duplicate Vercel project
  with no environment variables, so it served a 500. Moved to the live project;
  the duplicate was deleted.

---

## Migrations applied

| | |
| --- | --- |
| 0247–0248 | multi-role staff, `set_staff_roles` |
| 0249–0250 | `staff_compensation`, then dropping the pay columns from `staff` |
| 0251 | scholarship-failure notice |
| 0252 | backfill processing officers |
| 0253 | open the portal for an outstanding e-signature agreement |
| 0254 | close it when the agreement that justified it is deleted |
| 0255 | invoice writes: finance and super_admin only |
| 0256 | added items reach the schedule, the student and the receipt: `extras_amount` on instalments, student read on `invoice_line_items`, `apply_invoice_line_item_change` (2026-09-22) |

Applied by hand — there is no CLI setup and no tracking table. See
`AGENTS.md` for the exact invocation; the database password is only in the
Supabase dashboard.

---

## The checks

Six `npm run check:*` scripts, all documented in the README table with what
each covers and why it is not in the commit gate.

`check:agreement` (92 assertions) and `check:invoice` (108) drive the deployed
portal with `zztmp *` fixtures and tear them down. They refuse to run without
`VERIFY_AGAINST_PRODUCTION=yes`.

Three habits they are built on, each learned by getting it wrong:

- **Read the component before guessing a selector.** Several early failures were
  wrong selectors, not broken features.
- **Poll the outcome, never sleep.** A server action's write lands before its
  response does.
- **Assert on something that would be absent if the feature were broken**, and
  fetch rows with `select("*")` in check scripts. Naming columns produced three
  assertions that silently compared `undefined`, twice blaming the app when the
  select list was at fault.

---

## Open, and next

**Open decision.** If the office wants Processing to handle invoices, migration
0255's comment says exactly what to change. Nothing is blocked on it — the UI
already excluded them.

**Uncovered flows**, in the order worth doing:

1. **Applications and the per-country document tracker** — the largest surface,
   and where the dashboard crash came from. Stages and requirements differ per
   destination, so the data shapes vary.
2. **Scholarships** — matching, the portal view, and the research proposals a
   person must accept field by field.
3. **The partner university portal** — never exercised at all.
