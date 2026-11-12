# Email campaigns

Marketing › Email campaigns sends a ready-made HTML email to contacts already in
the portal and reports what each recipient did. The brief is
`reference/Email Marketing/hmark-email-campaigns-prompt.md`; the plan agreed for
it is `reference/Email Marketing/HMARK Email Campaigns - Phase 0 Plan.docx`.

The work goes in phases. This file grows with each.

| Phase | What | State |
|---|---|---|
| 1 | Templates: upload, processing, pre-flight checks, preview, test send | **Built** (0354) |
| 2 | Audience: contact status, segments, lists, import, suppression, preference centre | **Built** (0355) |
| 3 | Campaigns: drafts, approval, scheduling, the sending engine | **Built** (0356, 0357) — practice mode until the service is bought |
| 4 | Tracking: opens, clicks, bounces, complaints, website visits | **Built** (0356–0358) — bounces and complaints wait for the service |
| 5 | Reports: per campaign, the dashboard, PDF, exports, the lead's history | **Built** (0359) |
| 6 | Extras: resend to non-openers, content blocks, spam check, Slack alerts, activity log, data retention (0361); engagement scoring and hot leads, the sunset policy, each person's best hour (0362); A/B tests (0363); automations to come | **In progress** |

## The sending service — not connected yet

Campaigns are sent through a bulk email service, never the office mailbox. The
office buys it later; Amazon SES is recommended (about $0.10 per 1,000 emails),
Resend is the alternative. Until one is connected:

- everything else works: templates, previews, test emails, and later audiences
  and campaign drafts;
- a **test** email (up to five addresses) goes out through the portal's own
  SMTP mailbox — fine for a handful of tests, never used for a campaign;
- Settings shows the service as "Not connected" and lists the keys it needs.

To connect a service: set its keys in Vercel's environment settings (listed in
`.env.example` under "Email campaigns"), redeploy, then choose it in
Marketing › Email campaigns › Settings. The adapter for the chosen service is
written against `src/lib/emailCampaigns/providers/types.ts` when it is bought.

### Sending domain (when the service is bought)

Send from a subdomain — `news.hmarkconsultants.com` — so the main domain's
reputation is protected. **Settings › Sending domain and DNS** (0360,
`src/lib/emailCampaigns/dnsCheck.ts`) takes the domain and the three DKIM
tokens Amazon gives, lists every record to add at the DNS host, and **Check
DNS** looks each up in public DNS (Cloudflare and Google) and says whether it
is right:

| Record | Name | Value |
|---|---|---|
| DKIM ×3 (CNAME) | `<token>._domainkey.<domain>` | `<token>.dkim.amazonses.com` |
| MAIL FROM (MX) | `bounce.<domain>` | `10 feedback-smtp.<region>.amazonses.com` |
| SPF (TXT) | `bounce.<domain>` | `v=spf1 include:amazonses.com ~all` |
| DMARC (TXT) | `_dmarc.<domain>` | `v=DMARC1; p=none; rua=mailto:dmarc-reports@hmarkconsultants.com` |

The custom MAIL FROM is what makes SPF align with our own domain rather than
Amazon's. A subdomain with no DMARC record of its own is covered by the parent
domain's, and the check says so. DKIM shows "Waiting for Amazon" until the
tokens are saved.

## Phase 1 — Templates

### Uploading

An email is uploaded as one `.html` file, or a `.zip` holding `index.html` with
its images, stylesheets and fonts (largest upload: 20 MB, changeable in
Settings). The file goes from the browser straight into storage (the 40 MB
staging bucket) and the form posts only a reference, because Vercel refuses a
request over 4.5 MB.

The zip is refused outright if any path leaves the zip ("zip-slip"), if it
holds anything executable, if it unpacks to more than 80 MB, or if a file named
as an image is not one. JavaScript and unused files are set aside and listed.

### Processing (`src/lib/emailCampaigns/templateHtml.ts`)

1. Scripts, onclick-style handlers, iframes and embeds, forms and their fields,
   video and audio, and `javascript:` links are taken out — email clients block
   them — and each kind is listed with why.
2. Every image, background and font the upload carries is put in the public
   `email-assets` bucket and the HTML pointed at its address. A local file the
   upload does not have is listed (and fails the check).
3. The CSS — the zip's stylesheets included — is written onto the elements with
   `juice`. Media queries stay in a `<style>` block; Outlook's conditional
   comments survive.
4. If the email has no `{{unsubscribe_url}}`, a footer is added with the
   unsubscribe, preferences and "view in browser" links and HMARK's address
   (from Settings).
5. A plain-text version is made (editable on the template's page).

### Pre-flight checks (`src/lib/emailCampaigns/preflight.ts`)

Email size (Gmail clips over ~102 KB), every image present, alt text,
http-only images, image-to-text balance, the unsubscribe link, unknown merge
tags, what was removed — and every link and web image asked whether it loads
(a 404 fails; a site that does not answer warns). The checker never fetches a
private or local address. "Check links again" re-asks.

### Personalisation tags

`{{first_name}}`, `{{last_name}}`, `{{full_name}}`, `{{email}}`,
`{{country_of_interest}}`, `{{intake}}`, `{{counsellor_name}}`,
`{{unsubscribe_url}}`, `{{preferences_url}}`, `{{web_version_url}}`, with a
fallback after a bar: `{{first_name|there}}`. They are filled from the
contact's lead record (first/last name are split from `full_name`) and their
counsellor's name. Values are HTML-escaped.

### Preview and test

Desktop or phone width, light or imitated dark mode, as the sample contact or
any lead the viewer may see. The preview is served by
`/api/marketing/email-preview/<version>` under a sandbox policy (no script, an
opaque origin), after the HTML is cleaned with `sanitize-html`. A test goes to
up to five addresses as "[Test] …"; its unsubscribe and preferences links open
`/email/test-link`, which says it was a test. Tests never count in a report.

### Versions

Re-uploading makes the next version; earlier ones stay and any can be made the
one in use. "Duplicate" copies the version in use into a new template. Archived
templates are hidden and can be restored. Images are never deleted: an email
already sent may still show them.

### Who may do what

| Permission | Default roles | Gives |
|---|---|---|
| `page.marketing.email` | Management, Marketing, Digital Marketing | Open Marketing › Email campaigns |
| `email.templates.manage` | Marketing, Digital Marketing | Upload, edit, duplicate, archive; send tests |
| `email.settings.manage` | (Super Admin only) | Change the settings |

Super Admin holds all of them. Retune in Admin › Role Permissions.

### Testing it by hand

1. Marketing › Email campaigns › Templates › upload a `.zip` with `index.html`
   and an image, with a `<script>` and a `<form>` in it.
2. The template page lists both as removed, shows the image loading, and the
   pre-flight checks.
3. Preview on Mobile and Dark; "Preview as" a lead; send a test to yourself.
4. Upload it again: version 2 appears; "Use this version" on version 1.

Unit tests: `scripts/email-templates-test.mjs`. Against the deployed portal: `VERIFY_AGAINST_PRODUCTION=yes npm run check:emailtemplates`.

## Phase 2 — Audience

Campaigns go to the people already in the portal — every lead with an email,
students included — and to **imported contacts** (`email_contacts`), people from
a spreadsheet who are not leads and so never appear in counsellors' lead lists.
Nothing is copied: a segment is evaluated each time it is used.

### An address's state (`email_contact_status`)

One row per email address (lower-cased): `subscribed`, `unsubscribed`,
`bounced`, `complained`, `suppressed` (by staff) or `invalid`; why; where
consent came from; the topics chosen on the preference page; and the private
token its preference and unsubscribe links carry. An address with no row is a
lead who enquired — consent "Enquiry", subscribed to everything. Keyed by the
address, so a person on two lead records is one subscriber. Staff-only: a
student can read their own `leads` row, so nothing email-related is on it.

### Who a send reaches (`src/lib/emailCampaigns/audience.ts`)

1. Everyone in any included segment or list (or everyone).
2. Less anyone in an excluded segment or list.
3. Less records with no usable address.
4. One per address — a lead before an imported contact.
5. Less leads marked **Not interested** or **Not eligible** (by default).
6. Less the **do-not-email list** — it wins over every segment and list.
7. Less anyone who opted out of the campaign's topic.

The same function gives the segment builder's live count, a campaign's
audience, and the snapshot taken when it is sent.

### Segments

Saved filters, all or any of up to 30 rules: lead status, country of interest,
city, level, lead source, counsellor, intake, enquiry date (last N days, before,
after — Karachi days), registered student, has an application, application
stage, on a list, contact type — and **Email activity** (0360): opened, or
clicked in, the last campaign they got; did not open it; has never opened
one; has never been sent one; opened or clicked in the last N days; not for
N days. Only **real** campaigns count (a practice send reached nobody), and
only people's opens and clicks, never machines'. Each address's record comes
from `email_engagement_by_address()`; "not engaged" means sent at least one
and silent since — someone never sent anything is "never been sent one".

### Lists and importing

A list holds leads and imported contacts. Add by pasting addresses, or import a
CSV: the columns are guessed from the headers and confirmed; each row's
address is checked; repeats are kept once; an address that is a lead joins as
that lead; a new address's domain is asked whether it takes email (MX, else an
A/AAAA record) and refused if not; the consent source given is recorded on
every new contact.

### The do-not-email list

Every non-subscribed address, with why and since when. Staff add addresses with
a reason; they can take off one they added, one found invalid, or one that
bounced and has been fixed — never one the person unsubscribed or marked as
spam: only they can undo that, from their preference page.

### The pages a recipient reaches (public, no login)

- `/email/preferences/<token>` — choose topics (Settings holds the list), or
  unsubscribe from everything; subscribe again after unsubscribing.
- `/email/unsubscribe/<token>` — confirms with a button (a mail scanner opens
  every link, so opening it changes nothing).
- `POST /api/email/unsubscribe/<token>` — the RFC 8058 one-click unsubscribe a
  mail app sends: acts at once, answers 200.

`/email/*` and `/api/email/*` are let through `src/proxy.ts` without a session.

Permission: `email.audience.manage` (Marketing, Digital Marketing) — segments,
lists, imports, the do-not-email list. Viewing needs `page.marketing.email`.

Unit tests: `scripts/email-audience-test.mjs`. Against the deployed portal: `VERIFY_AGAINST_PRODUCTION=yes npm run check:emailaudience`.

## Phase 3 — Campaigns

Marketing › Email campaigns › Campaigns. A campaign is a template version, a
subject (and preview text), a sender, an audience and tracking choices.

### Life of a campaign (`email_campaigns.status`)

`draft` → (`pending_approval` →) `scheduled` → `sending` → `sent`, with
`paused`, `cancelled` and `failed` on the way.

- **Create** (`email.campaigns.create`: Marketing, Digital Marketing): drafts,
  test sends (to five addresses, through the portal's own mailbox), duplicates,
  and sending for approval.
- **Send** (`email.campaigns.send`): send now or at a Karachi time without
  approval. A send to more than 500 people (`CONFIRM_ABOVE`) is confirmed by
  typing its size or SEND.
- **Approve** (`email.campaigns.approve`: Super Admin): approve or send back
  with a note. Changing a campaign that is waiting sends it back to draft.
- Pause, resume and cancel while it is sending; a cancelled email is never sent.

### Sending (`src/lib/emailCampaigns/sender.ts`)

`/api/cron/email-send` runs every minute (vercel.json) and spends at most 45
seconds:

1. A campaign whose time has come **starts**: its audience is resolved once
   and frozen into `email_campaign_recipients` — whoever unsubscribes or
   bounces after that is skipped at their turn, nobody is added — and the
   email is prepared once (`render.ts`: tracked links numbered, the pixel's
   place marked, the preview text put in).
2. The run's **budget** is the smallest of the speed (per second × 50 s), what
   is left of the hourly limit and, while warming up, the daily cap
   (`sendingRules.ts`; Settings › Sending holds the numbers, the warm-up and
   the topic list).
3. Recipients are **claimed** by a conditional update, so two overlapping runs
   never send the same email twice; one claimed and abandoned for ten minutes
   is marked failed rather than resent blind.
4. Each is **rendered** for its person (merge tags, their own tracking and
   unsubscribe addresses, the List-Unsubscribe headers) and sent. A failure
   waits 2, 4, 8, 16 minutes and is given up after five tries.
5. A campaign with everyone sent is **finished**; one whose bounces pass 5%
   or complaints 0.1% (once 100 are sent) **pauses itself** and says why.
   Whoever created it, and the Super Admins, are told either way.

A campaign may be **spread over 1–72 hours** (the draft's "Pace", 0360): each
run sends at most its share of the time gone so far, less what has gone
(`spreadAllowance`), so a slow minute is made up in the next and it finishes
on time — within the speed, hourly and warm-up limits, which still apply.

### Practice mode — until the service is bought

With no service connected (`getCampaignProvider` returns null) a campaign can
still be sent, as **practice**: everything above runs, nobody is emailed, and
every email is recorded as sent through a stand-in (`PRACTICE_SENDER`). It is
badged Practice everywhere. On a practice campaign that has finished,
**Simulate activity** (`simulate.ts`) makes up a believable story — deliveries,
a few bounces, Apple's machine opens, link scanners, real opens and clicks,
website visits and conversions — so the reports can be tried. Simulated events
carry `simulated = true` and never touch an address's real state; they can be
cleared again from the same place.

## Phase 4 — Tracking

All tracking addresses carry the recipient's token (32 hex characters), never
an id, and are public (`src/proxy.ts` lets `/api/email/*` and `/email/*`
through). Each answers at once and records afterwards (`after()`), so a slow
database never delays a person's click.

| Address | What it does |
|---|---|
| `/api/email/o/<token>.gif` | The open pixel. Records an open; flags Apple's privacy proxy and opens within 20 s of sending as machine opens (`tracking.ts`). |
| `/api/email/c/<token>?l=<n>` | A tracked link. Redirects to the URL **stored** for link n of that campaign — never one taken from the address, so it cannot be used as an open redirect — with UTM tags (unless the link has its own) and, on hmarkconsultants.com, `hm_rid`. Clicks within 10 s of sending, bursts, and scanners' user agents are bot clicks. |
| `/email/view/<token>` | The web version: the email in the browser, with no pixel (viewing it is not an open), under a sandboxing CSP. |
| `/api/email/unsubscribe/<address>?r=<token>` | The one-click unsubscribe, now credited to the campaign that carried it. |
| `/api/email/webhooks/ses` | Amazon SES's delivery reports through SNS: delivered, bounced, complained, delayed, rejected. Every message's signature is checked against Amazon's certificate before it is believed (`providers/sesWebhook.ts`); `SES_SNS_TOPIC_ARN` limits it to HMARK's own topic. |
| `/api/email/web-event` | Website visits and conversions, from the website script below. |

A hard bounce or a complaint changes the address's state at once (bounced,
complained) and no campaign emails it again; three soft bounces count as a
hard one. Opens and clicks set the address's `last_engaged_at`.

Counts per campaign come from `email_campaign_stats()` (0358), which separates
everything from what people did: "opened" in the portal means a person opened.

### The website script

On hmarkconsultants.com (not the portal), add before `</body>`:

```html
<script src="https://portal.hmarkconsultants.com/hmark-track.js" async></script>
```

When someone arrives from a campaign link (`?hm_rid=…`) it remembers them for
30 days and reports each page they see. A form's thank-you, or any other goal,
reports a conversion with:

```js
window.hmarkTrack && window.hmarkTrack("conversion", "contact_form");
```

The keys it may use are listed in Settings › Sending › Conversion events, and
Settings › Website tracking shows the line to add, with the portal's address. A conversion
also credits the campaign on the person's lead, if the lead has no campaign
yet. The endpoint accepts calls only from *.hmarkconsultants.com, at most 100
an hour per recipient.

Unit tests: `scripts/email-campaigns-test.mjs`. Against the deployed portal: `VERIFY_AGAINST_PRODUCTION=yes npm run check:emailcampaigns`.

## Phase 5 — Reports

Who sees them: `email.reports.view` (Management, Marketing, Digital
Marketing). Every number is counted in the database by a security-invoker
function (0358, 0359) over tables only that permission can read, so a
report is never assembled from rows someone else may see. "Opened" and
"clicked" always mean **people**: machine opens (Apple Mail's privacy proxy,
gateways) and scanner clicks are kept and shown apart, never added in.

### A campaign's report — `/marketing/email/campaigns/<id>/report`

| Tab | What it shows |
|---|---|
| Overview | Sent, delivered, opened, clicked, click-to-open, website visits, conversions, bounces, unsubscribes, spam complaints; the funnel from inbox to website; the rates against the ten campaigns before it (practice against practice, each counted once whatever its size); opens and clicks hour by hour for the first 72 hours, then day by day (Karachi time). |
| Recipients | Everyone, filtered (opened, did not open, opened but did not click, clicked, visited, converted, bounced, unsubscribed, marked as spam, could not be sent) and searchable; one person's whole timeline; **Export CSV / Excel** of the filter; **Make a list** of the filter (needs `email.audience.manage`) for a follow-up campaign; **Give follow-up tasks**: one task per lead in the filter, to that lead's own counsellor and linked to the lead (a lead with no counsellor goes to a person picked, or is skipped; imported contacts are left out; a lead with the same task already open is not given it twice; at most 500 at a time). |
| Links | Each link's people, share and scanner clicks, and the **click map**: the email as sent, every link dead, a badge on each with its share. |
| Deliverability | Bounces by reason and by provider; per-provider delivery, open, click and bounce rates; mail apps, devices, countries and cities of the people who opened. |
| Website | Visitors, pages seen, pages a visit, **time on site** (first page to last, averaged over visits of two pages or more — a one-page visit has no measurable length), conversions by kind (named as in Settings), and who converted. |

**Download PDF summary** (`…/report/pdf`) is one branded page of the same:
the numbers, the comparison, the top links, mail apps, countries, providers,
bounces, pages and conversions. A practice campaign's PDF says, at the top,
that nothing was sent and the activity is simulated.

The rules behind these — the filters, the export's columns, the CSV's formula
guard, the timeline's empty hours, the comparison — are in
`src/lib/emailCampaigns/reportRules.ts`; the database reads in `reportData.ts`.

### The dashboard — Marketing › Email campaigns › Reports

- **Sender health** over the last 30 days: sent, bounce and complaint rates
  against the limits (bounces under 2%, complaints under 0.1%; Gmail blocks
  above 0.3%), day by day. Real sends only, unless "Include practice sends".
- **The audience's state**: how many addresses are subscribed, unsubscribed,
  bounced, marked as spam, on the do-not-email list or invalid, and how many
  changed in the last 30 days; **engaged in the last 90 days** (of the people
  sent a campaign, the share who opened or clicked); and **the last 12 weeks**:
  new leads and imported contacts against unsubscribes, bounces and spam
  complaints, week by week (`email_audience_trend()`, 0360).
- **Campaigns side by side**: the last 100, sortable by any column (rates sort
  by rate), each linking to its report; **Export CSV / Excel** in the order
  shown.

### On a lead

A lead's page, and a registered student's, show the campaigns sent to them
and what they did with each, and their address's state, to whoever may see
email reports.

Unit tests: `scripts/email-reports-test.mjs`, `scripts/email-extras-test.mjs` (the 0360 additions). Against the deployed portal: `VERIFY_AGAINST_PRODUCTION=yes npm run check:emailreports`.

## Phase 6 — Extras

### Resend to non-openers

On a campaign that has gone, **Resend to the people who did not open it**
makes a new draft of the same email with a new subject (it must differ),
`parent_campaign_id` pointing back. Its audience is `resendOf` (sender.ts
`nonOpenerKeys`): the first campaign's recipients with no open or click by a
person, no bounce, unsubscribe or spam report — worked out again when the
resend goes, so anyone who opens the first one meanwhile is left out. The
do-not-email list, topics and exclusions still apply.

### Content blocks (0361)

Templates › Content blocks keeps headers, footers, signatures and social rows
once (`email_content_blocks`). A template writes `{{block:key}}`; the block
goes in when an email is previewed, tested or sent (`withContentBlocks`,
server.ts) — into the plain-text version as text too. A campaign is put
together once, when it starts, so later edits to a block do not change an
email already sent. A block's HTML is cleaned like a template's
(`cleanBlockHtml`); a block holds no blocks. A template naming a block that no
longer exists cannot be sent (the send panel says which), and a test refuses.

### Spam check

The send panel scores the subject, preview text and email (`spamCheck.ts`, the
office chose built-in checks: nothing leaves the portal) from 0 to 10 — low,
some risk, high — and lists each finding with its fix: capitals, exclamation
marks, money-and-urgency phrases (whole phrases only, "guaranteed" and
"visa guaranteed" among them), a fake RE:/FW:, an email that is nearly all
pictures, no plain-text version, link shorteners, bare IP addresses, a link
whose text shows one website and goes to another, non-https links. A warning,
not a block.

### Alerts

Approval waiting, finished, and stopped by itself already reach people in the
portal and by email (the portal's alert emails). Set `SLACK_WEBHOOK_URL` (a
Slack incoming webhook) in Vercel and they are posted to that channel too
(`slack.ts`; a deployment only). WhatsApp would need the WhatsApp Business
API, which the portal does not have.

### Who did what (0361)

`email_activity_log`, written by the server only (`logEmailActivity`, never
failing what it records): sends, schedules, approvals and send-backs,
pause/resume/cancel, tests, simulations, resends, duplicates and deletes,
exports and PDFs, lists and follow-up tasks made from reports, settings and
content-block changes. Reports › **Who did what** lists them, filterable;
readable with `email.reports.view`. Row-level changes are in the portal's
audit log as before.

### Data retention (0361)

Settings › Sending › "keep each open's and click's browser and city for N
months" (12 to start; 0 keeps them for ever). `/api/cron/email-retention`
runs daily at 03:15 Karachi and calls `email_purge_event_details()`, which
clears `user_agent` and `ip_city` on older events and `city` on older
recipients. Counts, device, mail app and country stay, so every report still
adds up.

### Engagement scoring and hot leads (0362)

`email_lead_scores()` scores each lead from the last 120 days of **real**
campaigns: an open 1, a click 3, a website visit 5, an enquiry or other
conversion 10, each halving every 30 days; anyone who unsubscribed or reported
spam scores nothing. 8 or more is **hot**, 3 or more **warm**
(`engagement.ts`). Security definer: whoever may see email reports gets every
lead, anyone else on the staff only the leads assigned to them (the office's
choice). Shown on the dashboard ("Hot leads from email", only once someone is
warm), as a line on a lead's and a student's page, and as **Hot leads** on the
Reports tab.

### The sunset policy (0362)

Audience › **Sunset**: people sent at least two real campaigns, the first over
N months ago (6 to start), who have opened or clicked nothing since
(`email_sunset_candidates()`). Step one makes a list of them and a
re-engagement campaign to it ("Do you still want to hear from HMARK?");
step two, once that has finished and the grace period (30 days) has passed,
puts whoever is still silent on the do-not-email list with the reason.
`email_settings.sunset_mode`: **confirm** (a person presses each button — the
default) or **automatic** (`/api/cron/email-sunset`, daily 03:30 Karachi, does
both, and needs the re-engagement template chosen). Rounds are kept in
`email_sunset_runs`. A practice re-engagement suppresses nobody.

### Each person's best hour (0362)

The draft's Pace: **send each person at the hour they usually open** — from
their real opens by a person in the last 180 days (two or more,
`email_best_hours()`); they get it the next time that Karachi hour comes round
within 24 hours (`nextBestHour`), everyone else at once. The draft also says
when the office's recipients open most (`email_open_hours()`, `peakWindow`).

### A/B tests (0363)

The draft's **6. A/B test**: version A is the campaign's own subject and
template; version B another subject (and preview text), another template, or
both. When the campaign starts (`abTest.ts`), the audience is shuffled by the
campaign — fair and repeatable — and the test share (10–50%, 20 to start) is
split half to A and half to B; everyone else is **held** (a recipient status).
After the wait (1–48 hours, 4 to start) the sender's every-minute run picks
the version a larger share of its test group opened (or clicked) — a tie keeps
A — and releases everyone held with the winner; the creator is told, and the
activity log says so. B's email is prepared once like A's
(`ab_prepared_html_b`); a B template's links are numbered from 1001, so each
click finds its own link, and the web version shows the version the person
got. A test send sends both versions, "[Test A]" and "[Test B]". It needs at
least 20 people and does not combine with spreading or best hours. The report's
Overview shows each version's test-group results and the winner
(`email_campaign_variant_stats()`). In practice mode nobody opens, so A wins.

Unit tests: `scripts/email-phase6-test.mjs`.

## Not built, on purpose

- **The `mailto:` half of List-Unsubscribe.** It needs a mailbox the portal
  reads (SES inbound receiving); it comes with the SES connection. The https
  one-click unsubscribe, which Gmail and Yahoo require, is in every email.
- **A seed script of fake contacts.** There is one database, the live one: fake
  contacts would be in every "Everyone" audience and a real send would bounce
  on them. The simulate tool and the `check:email*` scripts (which clean up
  after themselves) cover what a seed was for.
