-- Email campaigns: what the brief asked of Phases 2–5 and was still missing.
--
--   1. Segments on email activity: each address's record across REAL
--      campaigns (a practice send reached nobody, so it counts for nothing).
--   2. A campaign may spread its send over a number of hours.
--   3. The sending domain and Amazon's DKIM tokens, for Settings' DNS check.
--   4. Reports: day by day after the first 72 hours; time on the website;
--      the audience over time; the share of people reached who engaged.

-- 1 ------------------------------------------------- engagement, by address
-- Read by the audience loader through the service role; security invoker, so
-- a signed-in caller gets only what RLS on the recipients already lets them see.
create or replace function public.email_engagement_by_address()
returns table (email text, received integer, last_sent_at timestamptz, last_opened boolean, last_clicked boolean, ever_opened boolean, ever_clicked boolean)
language sql stable security invoker set search_path = public as $$
  with real_sends as (
    select r.email, r.sent_at, r.human_open_count, r.human_click_count
    from email_campaign_recipients r
    join email_campaigns c on c.id = r.campaign_id
    where r.status = 'sent' and not c.practice and r.sent_at is not null
  ),
  latest as (
    select distinct on (email) email, sent_at, human_open_count > 0 as opened, human_click_count > 0 as clicked
    from real_sends
    order by email, sent_at desc
  )
  select
    s.email,
    count(*)::integer,
    max(s.sent_at),
    bool_or(l.opened),
    bool_or(l.clicked),
    bool_or(s.human_open_count > 0),
    bool_or(s.human_click_count > 0)
  from real_sends s
  join latest l on l.email = s.email
  group by s.email
$$;

grant execute on function public.email_engagement_by_address() to authenticated;

-- 2 ------------------------------------------------------ spread over hours
alter table public.email_campaigns
  add column if not exists spread_hours integer check (spread_hours is null or spread_hours between 1 and 72);

-- 3 ----------------------------------------------------- the sending domain
alter table public.email_settings
  add column if not exists sending_domain text check (sending_domain is null or sending_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  add column if not exists dkim_tokens text[] not null default '{}' check (cardinality(dkim_tokens) <= 5);

-- 4a ------------------------------------------- activity, by the Karachi day
create or replace function public.email_campaign_daily(p_campaign_id uuid, p_from timestamptz, p_days integer default 30)
returns table (day date, opens bigint, clicks bigint, visits bigint)
language sql stable security invoker set search_path = public as $$
  select
    (e.occurred_at at time zone 'Asia/Karachi')::date,
    count(*) filter (where e.type = 'opened'),
    count(*) filter (where e.type = 'clicked'),
    count(*) filter (where e.type = 'website_visit')
  from email_events e
  where e.campaign_id = p_campaign_id
    and e.type in ('opened', 'clicked', 'website_visit')
    and not e.is_machine
    and e.occurred_at >= p_from
    and e.occurred_at < p_from + make_interval(days => least(greatest(p_days, 1), 366))
  group by 1
  order by 1
$$;

-- 4b ------------------------------------------------- time on the website
-- A visit is one recipient's pages under one session id from hmark-track.js.
-- Its length is first page to last; a one-page visit has no measurable
-- length, so the average is over visits of two pages or more, and says so.
create or replace function public.email_campaign_web_sessions(p_campaign_id uuid)
returns table (visits bigint, page_views bigint, multi_page_visits bigint, avg_seconds numeric)
language sql stable security invoker set search_path = public as $$
  with v as (
    select e.recipient_id, coalesce(e.meta ->> 'session', '') as session, count(*) as pages,
           extract(epoch from max(e.occurred_at) - min(e.occurred_at)) as seconds
    from email_events e
    where e.campaign_id = p_campaign_id and e.type = 'website_visit'
    group by 1, 2
  )
  select count(*), coalesce(sum(pages), 0), count(*) filter (where pages > 1),
         round(avg(seconds) filter (where pages > 1)::numeric, 0)
  from v
$$;

-- 4c ------------------------------------------------- the audience over time
-- Leads are read past RLS (a counsellor's slice would be the wrong total), so
-- this is security definer and answers only someone allowed to see reports.
create or replace function public.email_audience_trend(p_weeks integer default 12)
returns table (week_start date, new_leads bigint, new_contacts bigint, unsubscribed bigint, bounced bigint, complained bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  first_week date := (date_trunc('week', (now() at time zone 'Asia/Karachi')) - make_interval(weeks => least(greatest(p_weeks, 1), 104) - 1))::date;
begin
  if not public.staff_has_permission('email.reports.view') then
    return;
  end if;
  return query
  with weeks as (
    select generate_series(first_week, (now() at time zone 'Asia/Karachi')::date, interval '1 week')::date as w
  ),
  l as (
    select date_trunc('week', coalesce(date_of_inquiry::timestamp, created_at at time zone 'Asia/Karachi'))::date as w, count(*) as n
    from leads where coalesce(date_of_inquiry::timestamp, created_at at time zone 'Asia/Karachi') >= first_week group by 1
  ),
  c as (
    select date_trunc('week', created_at at time zone 'Asia/Karachi')::date as w, count(*) as n
    from email_contacts where created_at at time zone 'Asia/Karachi' >= first_week group by 1
  ),
  s as (
    select date_trunc('week', status_changed_at at time zone 'Asia/Karachi')::date as w,
           count(*) filter (where status = 'unsubscribed') as unsub,
           count(*) filter (where status = 'bounced') as bounced,
           count(*) filter (where status = 'complained') as complained
    from email_contact_status where status_changed_at at time zone 'Asia/Karachi' >= first_week group by 1
  )
  select weeks.w, coalesce(l.n, 0), coalesce(c.n, 0), coalesce(s.unsub, 0), coalesce(s.bounced, 0), coalesce(s.complained, 0)
  from weeks
  left join l on l.w = weeks.w
  left join c on c.w = weeks.w
  left join s on s.w = weeks.w
  order by weeks.w;
end;
$$;

-- 4d ------------------------------------ engaged, of the people recently reached
create or replace function public.email_engaged_share(p_days integer default 90, p_include_practice boolean default false)
returns table (reached bigint, engaged bigint)
language sql stable security invoker set search_path = public as $$
  select count(distinct r.email),
         count(distinct r.email) filter (where r.human_open_count > 0 or r.human_click_count > 0)
  from email_campaign_recipients r
  join email_campaigns c on c.id = r.campaign_id
  where r.status = 'sent'
    and r.sent_at >= now() - make_interval(days => least(greatest(p_days, 1), 3650))
    and (p_include_practice or not c.practice)
$$;

grant execute on function public.email_campaign_daily(uuid, timestamptz, integer) to authenticated;
grant execute on function public.email_campaign_web_sessions(uuid) to authenticated;
grant execute on function public.email_audience_trend(integer) to authenticated;
grant execute on function public.email_engaged_share(integer, boolean) to authenticated;

notify pgrst, 'reload schema';
