-- Email campaigns, Phase 6 (third part): A/B tests.
--
-- A campaign may test a second version — another subject line (and preview
-- text), another template, or both — on a share of its audience, wait, pick
-- the version more people opened (or clicked), and send that to everyone
-- else. Version A is the campaign's own subject and template.

alter table public.email_campaigns
  add column if not exists ab_enabled boolean not null default false,
  add column if not exists ab_subject_b text check (ab_subject_b is null or char_length(ab_subject_b) <= 200),
  add column if not exists ab_preheader_b text check (ab_preheader_b is null or char_length(ab_preheader_b) <= 250),
  add column if not exists ab_template_version_id_b uuid references public.email_template_versions (id) on delete set null,
  add column if not exists ab_test_percent integer not null default 20 check (ab_test_percent between 10 and 50),
  add column if not exists ab_winner_by text not null default 'opens' check (ab_winner_by in ('opens', 'clicks')),
  add column if not exists ab_wait_hours integer not null default 4 check (ab_wait_hours between 1 and 48),
  -- Set when the campaign starts: when the winner is picked.
  add column if not exists ab_decide_at timestamptz,
  add column if not exists ab_winner text check (ab_winner is null or ab_winner in ('A', 'B')),
  add column if not exists ab_decided_at timestamptz,
  -- Version B as sent, made once when the campaign starts (A's is prepared_html).
  add column if not exists ab_prepared_html_b text,
  add column if not exists ab_prepared_text_b text;

-- Which version each recipient got; 'held' waits for the winner.
alter table public.email_campaign_recipients
  add column if not exists variant text check (variant is null or variant in ('A', 'B'));

do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.email_campaign_recipients'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%queued%';
  if con is not null then
    execute format('alter table public.email_campaign_recipients drop constraint %I', con);
  end if;
end $$;
alter table public.email_campaign_recipients
  add constraint email_campaign_recipients_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'held'));

-- A campaign's counts (0358): "queued" now includes those held for the winner.
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
    count(*) filter (where r.status in ('queued', 'sending', 'held')),
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

-- Each version's results, for the winner and the report. Only the test
-- group counts: the rest got the winner after it was picked.
create or replace function public.email_campaign_variant_stats(p_campaign_id uuid, p_until timestamptz default null)
returns table (variant text, sent bigint, opened bigint, clicked bigint)
language sql stable security invoker set search_path = public as $$
  select
    r.variant,
    count(*) filter (where r.status = 'sent'),
    count(*) filter (where r.status = 'sent' and r.human_open_count > 0),
    count(*) filter (where r.status = 'sent' and r.human_click_count > 0)
  from email_campaign_recipients r
  where r.campaign_id = p_campaign_id
    and r.variant is not null
    and (p_until is null or r.sent_at <= p_until)
  group by r.variant
  order by r.variant
$$;

grant execute on function public.email_campaign_variant_stats(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
