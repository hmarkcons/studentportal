-- Email campaigns, Phase 6 (second part): engagement scoring and hot leads,
-- the sunset policy, and sending at each person's usual hour.
--
-- Only REAL campaigns count anywhere here: a practice send reached nobody,
-- and its simulated activity must never make a lead look hot, nor anyone
-- look silent enough to stop emailing.

-- 1 -------------------------------------------------- engagement scoring
-- Each lead's score from the last 120 days of real campaigns: an open 1, a
-- click 3, a website visit 5, an enquiry or other conversion 10, each halving
-- every 30 days. Anyone who unsubscribed or reported spam scores nothing.
-- Security definer, because a counsellor may not read the recipients table:
-- whoever may see email reports gets every lead; anyone else on the staff,
-- only the leads assigned to them (the office's choice, 2026-11-12).
create or replace function public.email_lead_scores(p_lead_ids uuid[] default null, p_limit integer default 200)
returns table (lead_id uuid, score numeric, opened integer, clicked integer, visited integer, converted integer, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  everyone boolean := public.staff_has_permission('email.reports.view');
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from staff s where s.id = me and s.status = 'active') then
    return;
  end if;
  return query
  with r as (
    select
      r.lead_id,
      case when r.human_open_count > 0 and r.first_open_at is not null then power(0.5, extract(epoch from now() - r.first_open_at) / 2592000.0) else 0 end as o,
      case when r.human_click_count > 0 and r.first_click_at is not null then 3 * power(0.5, extract(epoch from now() - r.first_click_at) / 2592000.0) else 0 end as k,
      case when r.visited_at is not null then 5 * power(0.5, extract(epoch from now() - r.visited_at) / 2592000.0) else 0 end as v,
      case when r.converted_at is not null then 10 * power(0.5, extract(epoch from now() - r.converted_at) / 2592000.0) else 0 end as cv,
      r.human_open_count > 0 as did_open,
      r.human_click_count > 0 as did_click,
      r.visited_at is not null as did_visit,
      r.converted_at is not null as did_convert,
      greatest(r.first_open_at, r.first_click_at, r.visited_at, r.converted_at) as at,
      r.unsubscribed_at is not null or r.complained_at is not null as gone
    from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    join leads l on l.id = r.lead_id
    where r.lead_id is not null
      and r.status = 'sent'
      and not c.practice
      and r.sent_at >= now() - interval '120 days'
      and (p_lead_ids is null or r.lead_id = any (p_lead_ids))
      and (everyone or l.assigned_counselor_id = me)
  )
  select
    r.lead_id,
    round(sum(r.o + r.k + r.v + r.cv)::numeric, 1),
    count(*) filter (where r.did_open)::integer,
    count(*) filter (where r.did_click)::integer,
    count(*) filter (where r.did_visit)::integer,
    count(*) filter (where r.did_convert)::integer,
    max(r.at)
  from r
  group by r.lead_id
  having not bool_or(r.gone) and sum(r.o + r.k + r.v + r.cv) > 0
  order by 2 desc, 7 desc nulls last
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

grant execute on function public.email_lead_scores(uuid[], integer) to authenticated;

-- 2 ------------------------------------------------------------ the sunset
-- People emailed for months who never open: flagged, sent one re-engagement
-- email, and — if still silent after a grace period — no longer emailed.
-- "confirm": a person presses the button for each step; "automatic": the
-- daily run does it (and needs the re-engagement template chosen).
alter table public.email_settings
  add column if not exists sunset_mode text not null default 'confirm' check (sunset_mode in ('confirm', 'automatic')),
  add column if not exists sunset_months integer not null default 6 check (sunset_months between 2 and 24),
  add column if not exists sunset_grace_days integer not null default 30 check (sunset_grace_days between 7 and 90),
  add column if not exists sunset_template_id uuid references public.email_templates (id) on delete set null,
  add column if not exists sunset_subject text not null default 'Do you still want to hear from HMARK?' check (char_length(sunset_subject) between 1 and 200);

create table if not exists public.email_sunset_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('confirm', 'automatic')),
  list_id uuid references public.email_lists (id) on delete set null,
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  people integer not null default 0,
  status text not null default 'waiting' check (status in ('waiting', 'suppressed', 'closed')),
  suppressed integer not null default 0,
  note text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.email_sunset_runs enable row level security;
drop policy if exists email_sunset_runs_read on public.email_sunset_runs;
create policy email_sunset_runs_read on public.email_sunset_runs for select
  using ((select public.staff_has_permission('page.marketing.email')));
-- Written by the server only (service role), after its own permission check.

drop trigger if exists trg_audit_email_sunset_runs on public.email_sunset_runs;
create trigger trg_audit_email_sunset_runs after insert or update or delete on public.email_sunset_runs
  for each row execute function public.log_audit_event('id');

-- Who has gone silent: subscribed, sent at least two real campaigns, the
-- first more than p_months ago, and no open, click or visit by a person since
-- p_months ago. Read by the server through the service role.
create or replace function public.email_sunset_candidates(p_months integer)
returns table (email text, lead_id uuid, contact_id uuid, received integer, last_engaged_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with sends as (
    select r.email, max(r.lead_id::text)::uuid as lead_id, max(r.contact_id::text)::uuid as contact_id, count(*)::integer as received, min(r.sent_at) as first_sent
    from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where r.status = 'sent' and not c.practice and r.sent_at is not null
    group by r.email
  )
  select s.email, s.lead_id, s.contact_id, s.received, st.last_engaged_at
  from sends s
  join email_contact_status st on st.email = s.email
  where st.status = 'subscribed'
    and s.received >= 2
    and s.first_sent < now() - make_interval(months => p_months)
    and (st.last_engaged_at is null or st.last_engaged_at < now() - make_interval(months => p_months))
    and (s.lead_id is not null or s.contact_id is not null)
$$;

revoke execute on function public.email_sunset_candidates(integer) from public, anon, authenticated;

-- 3 --------------------------------------------------- each person's hour
alter table public.email_campaigns
  add column if not exists send_at_best_hour boolean not null default false;

-- Each address's usual hour to open (Karachi), from real opens by a person in
-- the last 180 days; only addresses with at least two such opens.
create or replace function public.email_best_hours(p_emails text[])
returns table (email text, best_hour integer, opens integer)
language sql stable security invoker set search_path = public as $$
  with o as (
    select r.email, extract(hour from (e.occurred_at at time zone 'Asia/Karachi'))::integer as h
    from email_events e
    join email_campaign_recipients r on r.id = e.recipient_id
    join email_campaigns c on c.id = e.campaign_id
    where e.type = 'opened' and not e.is_machine and not e.simulated and not c.practice
      and e.occurred_at >= now() - interval '180 days'
      and r.email = any (p_emails)
  ),
  counted as (
    select email, h, count(*) as n, sum(count(*)) over (partition by email) as total
    from o group by email, h
  )
  select distinct on (email) email, h, total::integer
  from counted
  where total >= 2
  order by email, n desc, h
$$;

-- When everyone opens, hour by hour (Karachi), for the draft's suggestion.
create or replace function public.email_open_hours(p_days integer default 180)
returns table (hour integer, opens bigint)
language sql stable security invoker set search_path = public as $$
  select extract(hour from (e.occurred_at at time zone 'Asia/Karachi'))::integer, count(*)
  from email_events e
  join email_campaigns c on c.id = e.campaign_id
  where e.type = 'opened' and not e.is_machine and not e.simulated and not c.practice
    and e.occurred_at >= now() - make_interval(days => least(greatest(p_days, 1), 3650))
  group by 1
  order by 1
$$;

grant execute on function public.email_best_hours(text[]) to authenticated;
grant execute on function public.email_open_hours(integer) to authenticated;

notify pgrst, 'reload schema';
