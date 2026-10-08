-- Calendar invitations to guests, and reminders before what is on a calendar.
--
-- calendar_invites: one row per guest of a calendar item (a personal item or
-- a task on an application) — the version of the event they were last sent,
-- under which SEQUENCE, so a change is sent to them as an update of the same
-- event, a guest taken off is sent a cancellation, and a deleted item is
-- cancelled for everyone from what is kept here (src/lib/calendarInvites.ts).
--
-- calendar_reminder_log: which reminder went to whom — the day before, or an
-- hour before something with a time — so the ten-minute and daily runs never
-- send one twice (src/lib/calendarUpcoming.ts). Rows older than a month are
-- cleared by the ten-minute cron.
--
-- Both are written by the server alone, with the service role.

create table if not exists public.calendar_invites (
  source_table text not null check (source_table in ('personal_tasks', 'application_tasks')),
  source_id uuid not null,
  email text not null,
  sequence integer not null default 0,
  signature text not null,
  event jsonb not null,
  organizer_name text,
  status text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
  error text,
  cancelled boolean not null default false,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id, email)
);

create table if not exists public.calendar_reminder_log (
  item_key text not null,
  recipient text not null,
  mode text not null check (mode in ('tomorrow', 'soon')),
  sent_at timestamptz not null default now(),
  primary key (item_key, recipient, mode)
);
create index if not exists calendar_reminder_log_sent_idx on public.calendar_reminder_log (sent_at);

alter table public.calendar_invites enable row level security;
alter table public.calendar_reminder_log enable row level security;
revoke all on public.calendar_invites from anon, authenticated;
revoke all on public.calendar_reminder_log from anon, authenticated;

comment on table public.calendar_invites is
  'The calendar invitation each guest was last sent, by item and SEQUENCE (0324). Service role only.';
comment on table public.calendar_reminder_log is
  'Calendar reminders sent, so none goes twice (0324). Service role only.';

-- Logs of what was sent, not records people change: left out of the audit log (0322).
create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files',
    'calendar_invites', 'calendar_reminder_log'
  ])
$$;
