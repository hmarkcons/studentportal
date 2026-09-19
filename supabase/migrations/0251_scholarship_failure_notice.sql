-- Remember that we told somebody the scholarship research is broken.
--
-- The 06:00 cron records its failures and says nothing. Nine failed runs sat in
-- the history while the Anthropic key had no credit, and the only way to find
-- out was to open the page and look. A usage alert on the API account covers
-- the opposite case -- spending too much -- and would never have fired.
--
-- Stamped on the run rather than kept in a table of its own: "have we already
-- reported this run of failures?" is then answerable from the same rows the
-- decision is made on, and the history shows which failure was the one that
-- sent a mail.
alter table public.scholarship_body_update_runs
  add column if not exists failure_notified_at timestamptz;

comment on column public.scholarship_body_update_runs.failure_notified_at is
  'When this failure was reported by email. Set on every run in the streak that triggered it, so an ongoing outage is reported once rather than every morning.';

-- The cron reads the newest finished runs to count the streak.
create index if not exists scholarship_runs_finished_idx
  on public.scholarship_body_update_runs (finished_at desc)
  where finished_at is not null;

-- Start from now, not from the backlog.
--
-- Every failure on file is from the spell when the API key had no credit --
-- nine of them, and they are the most recent runs, so without this the first
-- cron after deploy would email every Super Admin and Processing officer about
-- a condition that is already known and already being dealt with. An alert
-- whose first act is to report old news is one people learn to ignore.
--
-- Marking them reported is exactly true: they have been, in the conversation
-- that led to this migration. A success will break the streak, and the next
-- genuine outage is then reported normally.
update public.scholarship_body_update_runs
   set failure_notified_at = now()
 where status = 'failed'
   and failure_notified_at is null;
