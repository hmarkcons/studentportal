-- Email campaigns, part 5: the reports' numbers, counted in the database.
--
-- A campaign to fifty thousand people has hundreds of thousands of events, so
-- every breakdown a report shows is one statement here rather than rows read
-- into the server. All security invoker: email_campaign_recipients,
-- email_campaign_links and email_events are readable only with
-- email.reports.view (0356), so whoever lacks it gets nothing back.
--
-- "People" always means is_machine = false: an open by Apple's privacy proxy
-- or a click by a link scanner is in the totals and nowhere else.

-- 1 ----------------------------------------------------- activity, by the hour
create or replace function public.email_campaign_timeline(p_campaign_id uuid, p_from timestamptz, p_hours integer default 168)
returns table (bucket timestamptz, opens bigint, clicks bigint, visits bigint)
language sql stable security invoker set search_path = public as $$
  select
    date_trunc('hour', e.occurred_at),
    count(*) filter (where e.type = 'opened'),
    count(*) filter (where e.type = 'clicked'),
    count(*) filter (where e.type = 'website_visit')
  from email_events e
  where e.campaign_id = p_campaign_id
    and e.type in ('opened', 'clicked', 'website_visit')
    and not e.is_machine
    and e.occurred_at >= p_from
    and e.occurred_at < p_from + make_interval(hours => least(greatest(p_hours, 1), 2160))
  group by 1
  order by 1
$$;

-- 2 ---------------------------------------------------------- each link's clicks
create or replace function public.email_campaign_link_report(p_campaign_id uuid)
returns table (link_id uuid, pos integer, url text, label text, clicks bigint, human_clicks bigint, people bigint)
language sql stable security invoker set search_path = public as $$
  select
    l.id,
    l.position,
    l.url,
    l.label,
    count(e.id),
    count(e.id) filter (where not e.is_machine),
    count(distinct e.recipient_id) filter (where not e.is_machine)
  from email_campaign_links l
  left join email_events e
    on e.campaign_id = l.campaign_id and e.type = 'clicked' and e.link_id = l.id
  where l.campaign_id = p_campaign_id
  group by l.id, l.position, l.url, l.label
  order by l.position
$$;

-- 3 ------------------------------------- recipients by domain, device, place, bounce
create or replace function public.email_campaign_breakdown(p_campaign_id uuid, p_dimension text)
returns table (key text, recipients bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, unsubscribed bigint)
language sql stable security invoker set search_path = public as $$
  select
    k.key,
    count(*),
    count(*) filter (where r.delivered_at is not null),
    count(*) filter (where r.human_open_count > 0),
    count(*) filter (where r.human_click_count > 0),
    count(*) filter (where r.bounce is not null),
    count(*) filter (where r.unsubscribed_at is not null)
  from email_campaign_recipients r
  cross join lateral (
    select case p_dimension
      when 'domain' then lower(split_part(r.email, '@', 2))
      when 'device' then r.device
      when 'client' then r.client
      when 'country' then r.country
      when 'city' then case when r.city is not null then concat_ws(', ', r.city, r.country) end
      when 'bounce_reason' then case when r.bounce is not null then coalesce(r.bounce_reason, 'Not delivered') end
      when 'bounce_domain' then case when r.bounce is not null then lower(split_part(r.email, '@', 2)) end
    end as key
  ) k
  where r.campaign_id = p_campaign_id
    and r.status = 'sent'
    and k.key is not null
  group by k.key
  order by count(*) desc, k.key
  limit 50
$$;

-- 4 ------------------------------------------- website pages and conversions
create or replace function public.email_campaign_web_report(p_campaign_id uuid)
returns table (kind text, key text, events bigint, people bigint)
language sql stable security invoker set search_path = public as $$
  (
    select
      'page'::text,
      coalesce(nullif(regexp_replace(split_part(split_part(e.url, '?', 1), '#', 1), '^https?://[^/]+', ''), ''), '/'),
      count(*),
      count(distinct e.recipient_id)
    from email_events e
    where e.campaign_id = p_campaign_id and e.type = 'website_visit'
    group by 2
    order by 3 desc
    limit 50
  )
  union all
  (
    select 'conversion'::text, coalesce(e.meta ->> 'conversion', 'conversion'), count(*), count(distinct e.recipient_id)
    from email_events e
    where e.campaign_id = p_campaign_id and e.type = 'conversion'
    group by 2
    order by 3 desc
  )
$$;

-- 5 ---------------------------------------------- every campaign, day by day
-- Karachi's days. Practice sends and simulated events are left out unless asked
-- for: the sender's health is what real mail did.
create index if not exists email_events_occurred on public.email_events (occurred_at);

create or replace function public.email_daily_activity(p_since date, p_include_practice boolean default false)
returns table (day date, sent bigint, delivered bigint, hard_bounces bigint, soft_bounces bigint, complaints bigint, opened bigint, clicked bigint, unsubscribes bigint)
language sql stable security invoker set search_path = public as $$
  select
    (e.occurred_at at time zone 'Asia/Karachi')::date,
    count(*) filter (where e.type = 'sent'),
    count(*) filter (where e.type = 'delivered'),
    count(*) filter (where e.type = 'hard_bounce'),
    count(*) filter (where e.type = 'soft_bounce'),
    count(*) filter (where e.type = 'complaint'),
    count(distinct e.recipient_id) filter (where e.type = 'opened' and not e.is_machine),
    count(distinct e.recipient_id) filter (where e.type = 'clicked' and not e.is_machine),
    count(*) filter (where e.type = 'unsubscribed')
  from email_events e
  join email_campaigns c on c.id = e.campaign_id
  where e.occurred_at >= (p_since::timestamp at time zone 'Asia/Karachi')
    and (p_include_practice or (not c.practice and not e.simulated))
  group by 1
  order by 1
$$;

-- 6 ------------------------------------------------------- the audience's health
create or replace function public.email_audience_health(p_since timestamptz)
returns table (status text, total bigint, changed_since bigint)
language sql stable security invoker set search_path = public as $$
  select s.status, count(*), count(*) filter (where s.status_changed_at >= p_since)
  from email_contact_status s
  group by s.status
$$;

grant execute on function public.email_campaign_timeline(uuid, timestamptz, integer) to authenticated;
grant execute on function public.email_campaign_link_report(uuid) to authenticated;
grant execute on function public.email_campaign_breakdown(uuid, text) to authenticated;
grant execute on function public.email_campaign_web_report(uuid) to authenticated;
grant execute on function public.email_daily_activity(date, boolean) to authenticated;
grant execute on function public.email_audience_health(timestamptz) to authenticated;

notify pgrst, 'reload schema';
