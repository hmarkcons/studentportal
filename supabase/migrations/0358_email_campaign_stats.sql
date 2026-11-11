-- Email campaigns: each campaign's results counted in the database, for the
-- campaign list, the report and the dashboards — one statement over the
-- recipients rather than tens of thousands of rows read into the server.
--
-- Security invoker: it reads email_campaign_recipients as the caller, so only
-- someone allowed to see email reports (0356) gets numbers back.

create or replace function public.email_campaign_stats(p_campaign_ids uuid[])
returns table (
  campaign_id uuid,
  recipients bigint,
  queued bigint,
  sent bigint,
  failed bigint,
  delivered bigint,
  opened_any bigint,
  opened_human bigint,
  clicked_any bigint,
  clicked_human bigint,
  hard_bounces bigint,
  soft_bounces bigint,
  complaints bigint,
  unsubscribes bigint,
  visited bigint,
  converted bigint
)
language sql stable security invoker set search_path = public as $$
  select
    r.campaign_id,
    count(*),
    count(*) filter (where r.status in ('queued', 'sending')),
    count(*) filter (where r.status = 'sent'),
    count(*) filter (where r.status = 'failed'),
    count(*) filter (where r.delivered_at is not null),
    count(*) filter (where r.open_count > 0),
    count(*) filter (where r.human_open_count > 0),
    count(*) filter (where r.click_count > 0),
    count(*) filter (where r.human_click_count > 0),
    count(*) filter (where r.bounce = 'hard'),
    count(*) filter (where r.bounce = 'soft'),
    count(*) filter (where r.complained_at is not null),
    count(*) filter (where r.unsubscribed_at is not null),
    count(*) filter (where r.visited_at is not null),
    count(*) filter (where r.converted_at is not null)
  from email_campaign_recipients r
  where r.campaign_id = any (p_campaign_ids)
  group by r.campaign_id
$$;

grant execute on function public.email_campaign_stats(uuid[]) to authenticated;

notify pgrst, 'reload schema';
