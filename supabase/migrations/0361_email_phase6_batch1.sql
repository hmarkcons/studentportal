-- Email campaigns, Phase 6 (first part): reusable content blocks, a log of
-- who did what, and how long the finer details of each open and click are
-- kept. (Resend to non-openers, the spam check and Slack alerts need no new
-- tables.)

-- 1 ------------------------------------------------------- content blocks
-- A header, footer, signature or row of social icons kept once and put into
-- any template with {{block:key}} — so changing the office address or a
-- social link changes every email that uses it from then on.
create table if not exists public.email_content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  html text not null default '' check (char_length(html) <= 100000),
  updated_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_email_content_blocks_updated_at on public.email_content_blocks;
create trigger trg_email_content_blocks_updated_at before update on public.email_content_blocks
  for each row execute function set_updated_at();

alter table public.email_content_blocks enable row level security;
drop policy if exists email_content_blocks_read on public.email_content_blocks;
create policy email_content_blocks_read on public.email_content_blocks for select
  using ((select public.staff_has_permission('page.marketing.email')));
drop policy if exists email_content_blocks_write on public.email_content_blocks;
create policy email_content_blocks_write on public.email_content_blocks for all
  using ((select public.staff_has_permission('email.templates.manage')))
  with check ((select public.staff_has_permission('email.templates.manage')));

drop trigger if exists trg_audit_email_content_blocks on public.email_content_blocks;
create trigger trg_audit_email_content_blocks after insert or update or delete on public.email_content_blocks
  for each row execute function public.log_audit_event('id');

-- 2 ------------------------------------------------------- who did what
-- Sends, approvals, exports, lists and tasks made from reports, settings
-- changed. Written by the server (service role) only; read by whoever may
-- see email reports. Row changes are in the audit log already; this is the
-- actions, which change no row of their own (an export) or many (a send).
create table if not exists public.email_activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id uuid references public.staff (id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  summary text not null default '' check (char_length(summary) <= 500),
  detail jsonb not null default '{}'::jsonb
);
create index if not exists email_activity_log_at on public.email_activity_log (at desc);
create index if not exists email_activity_log_campaign on public.email_activity_log (campaign_id, at desc) where campaign_id is not null;

alter table public.email_activity_log enable row level security;
drop policy if exists email_activity_log_read on public.email_activity_log;
create policy email_activity_log_read on public.email_activity_log for select
  using ((select public.staff_has_permission('email.reports.view')));

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
    'email_campaign_recipients', 'email_campaign_links', 'email_events',
    'email_activity_log'
  ])
$$;

-- 3 ---------------------------------------------------------- data retention
-- After this many months an open's or click's browser string and city are
-- cleared; the counts, device, mail app and country stay, so every report
-- still adds up. 0 keeps them for ever.
alter table public.email_settings
  add column if not exists retention_months integer not null default 12 check (retention_months between 0 and 120);

create or replace function public.email_purge_event_details(p_months integer)
returns table (events bigint, recipients bigint)
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz;
  e bigint := 0;
  r bigint := 0;
begin
  if p_months is null or p_months <= 0 then
    return query select 0::bigint, 0::bigint;
    return;
  end if;
  cutoff := now() - make_interval(months => p_months);
  update email_events set user_agent = null, ip_city = null
    where occurred_at < cutoff and (user_agent is not null or ip_city is not null);
  get diagnostics e = row_count;
  update email_campaign_recipients set city = null
    where sent_at < cutoff and city is not null;
  get diagnostics r = row_count;
  return query select e, r;
end;
$$;

-- Only the server's daily run calls it.
revoke execute on function public.email_purge_event_details(integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
