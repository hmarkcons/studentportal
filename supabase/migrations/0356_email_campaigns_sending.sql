-- Email campaigns, parts 3 and 4: campaigns, sending, and tracking.
--
-- A campaign is a template version sent to an audience (0355) with a subject,
-- sender and tracking options, now or at a time in Karachi. When it starts,
-- the audience is frozen into email_campaign_recipients — one row per address,
-- with a private token and the merge values as they were — so a later change
-- to a lead never changes a campaign already sent. A worker (the email-send
-- cron, every minute) sends the queue in batches at the configured speed,
-- never twice to one recipient (unique campaign + address, and a recipient
-- claimed but not confirmed is failed, never re-sent).
--
-- Until a sending service is bought (email_settings.provider = 'none') a send
-- is a PRACTICE run: every step happens except the email leaving the portal,
-- and the campaign says so everywhere. Practice campaigns can be given made-up
-- activity to try the reports with.
--
-- Tracking: email_events holds everything that happens to a recipient —
-- sent, delivered, bounced, opened, clicked, unsubscribed, a website visit, a
-- conversion — each with what was known (link, device, client, country, a
-- machine or bot flag). The recipient row keeps the counts the reports read.
-- Both are written by the server (service role) alone, and kept out of the
-- audit log: they are logs, and a campaign writes tens of thousands of rows.

-- 1 ------------------------------------------------------------ campaigns
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- For utm_campaign: lower-case, hyphens.
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  type text not null default 'regular' check (type in ('regular', 'resend_non_openers')),
  -- The campaign this resends to people who did not open it.
  parent_campaign_id uuid references public.email_campaigns (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed')),
  from_name text,
  from_email text,
  reply_to text,
  subject text check (subject is null or char_length(subject) <= 200),
  preheader text check (preheader is null or char_length(preheader) <= 250),
  template_version_id uuid references public.email_template_versions (id) on delete restrict,
  -- A preference-page topic; people who opted out of it are not sent this.
  topic text,
  -- {"include": {"all": bool, "segments": [ids], "lists": [ids]}, "exclude": {...}, "skipLeadStatuses": [..]}
  audience jsonb not null default '{"include":{"all":false,"segments":[],"lists":[]},"exclude":{"segments":[],"lists":[]},"skipLeadStatuses":["not_interested","not_eligible"]}'::jsonb,
  track_opens boolean not null default true,
  track_clicks boolean not null default true,
  add_utm boolean not null default true,
  scheduled_at timestamptz,
  -- Sent with no sending service connected: nothing left the portal.
  practice boolean not null default false,
  recipients_total integer not null default 0,
  -- The audience counted when it was frozen: {matched, duplicates, suppressed: {...}, ...}.
  audience_counts jsonb,
  submitted_by uuid references public.staff (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.staff (id) on delete set null,
  approved_at timestamptz,
  review_note text,
  started_at timestamptz,
  finished_at timestamptz,
  paused_reason text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_status on public.email_campaigns (status, scheduled_at);

-- 2 ------------------------------------------------------------ who it went to
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  contact_id uuid references public.email_contacts (id) on delete set null,
  email text not null,
  -- The merge values as they were when the campaign started.
  merge_values jsonb not null default '{}'::jsonb,
  -- In this recipient's tracking, web-version and unsubscribe links.
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_open_at timestamptz,
  open_count integer not null default 0,
  human_open_count integer not null default 0,
  first_click_at timestamptz,
  click_count integer not null default 0,
  human_click_count integer not null default 0,
  -- 'hard' or 'soft'.
  bounce text check (bounce is null or bounce in ('hard', 'soft')),
  bounce_reason text,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  visited_at timestamptz,
  converted_at timestamptz,
  last_activity_at timestamptz,
  device text,
  client text,
  country text,
  city text,
  unique (campaign_id, email)
);
create index if not exists email_campaign_recipients_queue on public.email_campaign_recipients (campaign_id, status);
create index if not exists email_campaign_recipients_provider on public.email_campaign_recipients (provider_message_id) where provider_message_id is not null;
create index if not exists email_campaign_recipients_lead on public.email_campaign_recipients (lead_id) where lead_id is not null;

-- 3 ------------------------------------------------------------ its links
-- The web links of the email as sent; a click is logged against one of these
-- and redirected to the URL stored here, never one taken from the click.
create table if not exists public.email_campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  position integer not null,
  url text not null,
  label text,
  unique (campaign_id, position)
);

-- 4 ------------------------------------------------------------ what happened
create table if not exists public.email_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  recipient_id uuid not null references public.email_campaign_recipients (id) on delete cascade,
  type text not null check (type in (
    'queued', 'sent', 'failed', 'delivered', 'delivery_delayed', 'soft_bounce', 'hard_bounce', 'rejected',
    'complaint', 'opened', 'clicked', 'unsubscribed', 'website_visit', 'conversion'
  )),
  occurred_at timestamptz not null default now(),
  link_id uuid references public.email_campaign_links (id) on delete set null,
  url text,
  user_agent text,
  ip_country text,
  ip_city text,
  device text,
  client text,
  -- An open by a mail proxy fetching images, or a click by a security scanner.
  is_machine boolean not null default false,
  bounce_type text,
  bounce_subtype text,
  diagnostic text,
  -- The service's id for the event, so one delivered twice is kept once.
  provider_event_id text unique,
  -- Made up for a practice campaign's reports.
  simulated boolean not null default false,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists email_events_campaign on public.email_events (campaign_id, type, occurred_at);
create index if not exists email_events_recipient on public.email_events (recipient_id, occurred_at);

-- 5 ------------------------------------------------------------ attribution
alter table public.leads
  add column if not exists source_email_campaign_id uuid references public.email_campaigns (id) on delete set null;
comment on column public.leads.source_email_campaign_id is 'The email campaign that brought this lead to the website and converted (0356).';

-- 6 ------------------------------------------------------------ sending speed, website conversions
alter table public.email_settings
  add column if not exists send_per_second numeric(6, 2) not null default 10 check (send_per_second > 0 and send_per_second <= 100),
  add column if not exists send_per_hour integer not null default 20000 check (send_per_hour between 1 and 1000000),
  add column if not exists warmup_enabled boolean not null default false,
  add column if not exists warmup_start_cap integer not null default 200 check (warmup_start_cap between 1 and 1000000),
  add column if not exists warmup_growth_pct integer not null default 50 check (warmup_growth_pct between 0 and 500),
  add column if not exists warmup_started_on date,
  add column if not exists conversion_events jsonb not null default
    '[{"key":"enquiry_form","label":"Enquiry form sent"},{"key":"whatsapp_click","label":"WhatsApp button"},{"key":"book_consultation","label":"Book a consultation"},{"key":"apply_now","label":"Apply now"}]'::jsonb;

-- 7 ------------------------------------------------------------ stamps, rights
drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at before update on public.email_campaigns
  for each row execute function set_updated_at();

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_campaign_links enable row level security;
alter table public.email_events enable row level security;

drop policy if exists email_campaigns_read on public.email_campaigns;
create policy email_campaigns_read on public.email_campaigns for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_campaigns_write on public.email_campaigns;
create policy email_campaigns_write on public.email_campaigns for all
  using ((select public.staff_has_permission('email.campaigns.create')))
  with check ((select public.staff_has_permission('email.campaigns.create')));

-- Read by whoever may see reports; written by the server alone (no write policy).
drop policy if exists email_campaign_recipients_read on public.email_campaign_recipients;
create policy email_campaign_recipients_read on public.email_campaign_recipients for select
  using ((select public.staff_has_permission('email.reports.view')));
drop policy if exists email_campaign_links_read on public.email_campaign_links;
create policy email_campaign_links_read on public.email_campaign_links for select
  using ((select public.staff_has_permission('email.reports.view')));
drop policy if exists email_events_read on public.email_events;
create policy email_events_read on public.email_events for select
  using ((select public.staff_has_permission('email.reports.view')));

drop trigger if exists trg_audit_email_campaigns on public.email_campaigns;
create trigger trg_audit_email_campaigns after insert or update or delete on public.email_campaigns
  for each row execute function public.log_audit_event('id');

-- Logs, written in bulk by the server: kept out of the audit log.
create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files',
    'calendar_invites', 'calendar_reminder_log', 'student_gmail_recovery',
    'student_welcome_emails',
    'email_campaign_recipients', 'email_campaign_links', 'email_events'
  ])
$$;

-- 8 ------------------------------------------------------------ permissions
with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select v.key, v.category, v.label, v.description, v.default_roles, base.m + v.ord
from base, (values
  ('email.campaigns.create', 'Email campaigns', 'Create email campaigns', 'Draft email campaigns and send them for approval.', array['marketing', 'digital_marketing']::staff_role[], 10),
  ('email.campaigns.send', 'Email campaigns', 'Send email campaigns', 'Send or schedule an email campaign without approval, and pause, resume or cancel one.', array['marketing', 'digital_marketing']::staff_role[], 20),
  ('email.campaigns.approve', 'Email campaigns', 'Approve email campaigns', 'Approve or send back campaigns waiting for approval.', array[]::staff_role[], 30),
  ('email.reports.view', 'Email campaigns', 'See email reports', 'See who received, opened and clicked each campaign, and the email activity on a student''s page.', array['management', 'marketing', 'digital_marketing']::staff_role[], 40)
) as v(key, category, label, description, default_roles, ord)
on conflict (key) do update set category = excluded.category, label = excluded.label, description = excluded.description;

notify pgrst, 'reload schema';
