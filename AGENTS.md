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

A pre-commit hook runs typecheck, eslint over the staged files and 846 unit
tests — all three, so one attempt reports everything wrong — then a production
build only if those passed. It is installed by `npm install`, so it is already
running; `git commit --no-verify` skips it for a deliberate work in progress.

Six checks are **not** in the gate, because each is slow and each covers
something that fails silently: `npm run check:hook`, `check:xlsx`, `check:roles`,
`check:pay`, `check:studentid`, `check:catalogue`. Run the relevant one after
touching what it covers — README.md says which is which. The last four need
`VERIFY_AGAINST_PRODUCTION=yes`.

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

**A student with no intake has no Student ID, and no portal.** The code is
`HMC-<intake>-<country>-<place in that intake>` (0260), so it cannot be composed
until both the intake and the country are on file. Until then the student holds
their place by registration date and `student_code` stays null — which the
(student) layout and the landing page treat as a hard lock that staff cannot
override. Anything that registers a student and does not set an intake produces
a record that looks complete in the list and cannot sign in. Numbering is all in
triggers; `npm run check:studentid` is what proves any of it.

**Pay is not on `staff`.** Salary, allowances, commission and bonus live on
`staff_compensation`; read them with `COMPENSATION_EMBED` and
`withCompensation()`. The embed must name its foreign key, because the table has
two to `staff` and PostgREST otherwise rejects the entire query.

**A staff member's personal details are not columns you can select.** CNIC,
date of birth, gender, marital status, address, `mobile_personal`,
`email_personal`, `phone`, `whatsapp_number` and the emergency contact are
withheld from signed-in users on `staff` (0285), so naming one — or `*` —
fails with "permission denied", and in an embed it fails the whole query: the
student dashboard asked for its counsellor's `phone`, found no student, and
rendered blank. A number to give anyone is `mobile_official`. Read them through
`staff_personal_details()`, which returns the caller's own or, for a Super
Admin, anyone's. A new column on `staff` is unreadable by the app until it is
granted in a migration; grant it unless it is personal. Only a Super Admin
manages staff or changes anyone's roles (0283, 0284) — `staff.manage` cannot
be granted to anyone else — and only a Super Admin sets or resets anyone's
password, staff, student or partner (0302).

**An import that writes an empty cell wipes a column.** The catalogue
imports add or update, and a blank cell means "said nothing", never null — see
`src/lib/importMerge.ts`. A parser that turns an empty yes/no cell into `false`,
or an insert payload that sends an explicit null instead of omitting the key,
turns every partial sheet into a silent mass edit that reports total success.
The reverse holds too: an edit form's `maxLength` must hold whatever an import
can store, or the record cannot be edited once imported — the scholarship
bodies' limits are shared, in `BODY_TEXT_LIMITS`.

**Any catalogue or scholarship field may hold anything** (0304), so nothing
may assume its format:

- A programme's **level** is free text. Compare levels with `levelKey` /
  `sameLevel` (`src/lib/catalogueText.ts`), never `===`: "Foundation" in a
  sheet is the "foundation" on file. Only bachelors, masters and phd match a
  student (`suggested_programs`, `course_interest_options`), which is why
  `normalizeLevel` writes their usual spellings as exactly those three.
- A **link** field can be words, or `javascript:alert(1)`. Render it through
  `linkHref` or `<SafeLink>`, never `href={value}`, and never `new URL(value)`
  on a stored value: that throws on words, and on the Scholarship tab it took
  the whole page down.
- An **email** field is a list ("a@x.it, b@x.it") or words. Render it with
  `<EmailLinks>`; `addressesIn` gives the addresses to send to.
- A **round's dates** may be words: `start_text` / `deadline_text` are shown
  in place of the date, and only `start_date` / `application_deadline` drive
  reminders, "closed" and the calendar. Read rounds for display with the two
  text columns, or a "Rolling" round shows as a round with no dates.

**A student can read their own `leads` row** (`leads_select_self`, 0022), so a
column added to `leads` is readable from the student's own session, through
the API, whatever the student pages show. Anything internal — a counsellor's
note — goes in a table of its own with a staff-only policy: the lead's remark
was first mirrored onto `leads` (0306) and moved to `lead_remark_current`
(0307) for exactly this.

**An uploaded CSV is not necessarily UTF-8.** Excel on Windows saves CSV in
Windows-1252, and `file.text()` turns each accented letter into "�" without an
error: one import added three duplicate scholarship bodies named "Universit�
degli Studi di …" beside the real ones. Read an upload with `readCsvFile`
(`src/lib/csv.ts`), never `file.text()`.

**A multi-row insert must be rectangular.** PostgREST takes the union of the
keys across the rows and sends NULL for every key a given row is missing, so a
column default never applies to a batch whose rows differ in shape. Building
each row by dropping the fields you have nothing for is the natural thing to
write and is wrong: it put null into a NOT NULL column and failed the whole
insert, and on a nullable column it would have written the nulls silently. See
`universityInsertValues` in `src/lib/catalogueRows.ts`.

**Only a Super Admin can UPDATE a university or a programme** (0039), and an
UPDATE that RLS refuses raises nothing — it matches no rows and reads as a
clean success. Anything that edits these tables on behalf of staff has to check
the role itself and say so, or it will report work it did not do.

**A paused destination must still be selectable where a student already has
it.** Pickers use `selectableDestinations(all, keepIds)`; omit `keepIds` on an
editing form and re-saving silently drops the country the student is going to.

**A fee or a tuition is text, and may be words** (0303). `application_fee` on
universities, programmes and applications, and `programs.tuition_fee`, hold
"30" and "Free for EU students" alike. `Number()` of one is NaN for words, and
NaN shows as "€NaN" or adds up to nothing without an error. Read them through
`src/lib/applicationFee.ts` — `formatFee` to show one, `plainAmount` to ask
whether it is only an amount, `firstAmount` for a sum made from one — and write
them through `parseFeeText` / `parseTuitionText`, so a plain amount is always
stored one way and a re-import does not see it as changed.

**Pre-Enrolled / University Finalized is found by its key, and the key comes
from its label.** It is set when a university is finalized and taken off when
it is un-finalized (`src/lib/finalizedStage.ts`, 0301), keyed `pre_enrolled` /
`university_finalized`. The stage editor in Setup re-derives every key from its
label, so renaming the step there gives it a key nothing sets — it then sits
empty for every student and nothing says why. Keep the label, or change the
keys in `finalizedStage.ts` with it.

**`unstable_cache` survives deployments.** Vercel's Data Cache is not cleared by
a deploy, so a stale entry can outlive the code that wrote it. Cached reads take
a tag, and the writer revalidates it.

**A read straight after a write returns the pre-write response**, because Next
memoises fetches within a request. Use the writer's return value.

**A `revalidatePath` in a server action makes the person wait for the whole
page they are on.** After any revalidation, Next renders the current page into
the action's answer, whatever path was named: an inline status change on the
250-lead list took 2.6 seconds, 1.8 of them the list. An inline edit answers
without it, shows what it saved itself, and calls `markListsStale()` so a copy
of the list held for Back is read again (`src/components/RefreshIfStale.tsx`).

**An RLS policy that calls a function on every row is slow for whoever fails
it.** `has_role()`, `staff_can_view_student()` and `auth.uid()` are queries or
lookups; written bare in a policy they run once per row, so a counsellor
counting 2,804 leads took 2.5 seconds while a Super Admin, who passes early,
took 0.3. Write them as `(select has_role(…))` and `(select auth.uid())` and
Postgres works each out once per query (0317 proves the swap changed nobody's
access before committing it).

**Alerts are written by triggers, and a trigger that fails fails the write it
rides on** (0320). A message, a document's status, an application's stage, a
lead's counsellor, an import of three thousand leads — each insert or update
runs `notify()`, so a null title there would refuse the lead import itself.
Everything a trigger puts in an alert is coalesced; keep it so. Repeats group
into one unread row per person and group, so an import is one alert, not
three thousand.

**Alert emails go out only from a deployment.** A local server shares the
live database, so it would email real people about real alerts, with links
to localhost: `deliversEmail()` (src/lib/notificationDelivery.ts) is true only
on Vercel, or with NOTIFY_EMAILS=yes. The daily reminders obey the same rule.

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

