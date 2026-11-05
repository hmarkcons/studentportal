# Email campaigns

Marketing › Email campaigns sends a ready-made HTML email to contacts already in
the portal and reports what each recipient did. The brief is
`reference/Email Marketing/hmark-email-campaigns-prompt.md`; the plan agreed for
it is `reference/Email Marketing/HMARK Email Campaigns - Phase 0 Plan.docx`.

The work goes in phases. This file grows with each.

| Phase | What | State |
|---|---|---|
| 1 | Templates: upload, processing, pre-flight checks, preview, test send | **Built** (0354) |
| 2 | Audience: contact status, segments, lists, suppression, preference centre | Next |
| 3 | Campaigns: wizard, approval, sending engine | — |
| 4 | Tracking: opens, clicks, bounces, complaints, website visits | — |
| 5 | Reports | — |
| 6 | Extras (A/B tests, automations, …) | — |

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
reputation is protected. The service gives the DNS records to add at the DNS
host: SPF, DKIM (2048-bit) and DMARC, aligned. Settings will show them with a
"Check DNS" button (Phase 3).

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

Unit tests: `scripts/email-templates-test.mjs`.
