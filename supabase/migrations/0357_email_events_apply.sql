-- Email campaigns: the email as prepared for a campaign, and one function that
-- applies an event to a recipient's counts.
--
-- A campaign's email is prepared once when it starts (tracked links numbered,
-- the open pixel's place marked, the preview text in) and kept on the
-- campaign, so every recipient's copy is made from the same text and a later
-- change to the template version cannot reach a campaign mid-send.
--
-- Opens and clicks arrive at the same moment from many recipients and, for one
-- recipient, more than once; counting them as read-then-write would lose some.
-- email_apply_event does each in one statement.

alter table public.email_campaigns
  add column if not exists prepared_html text,
  add column if not exists prepared_text text;

create or replace function public.email_apply_event(
  p_recipient_id uuid,
  p_type text,
  p_at timestamptz,
  p_machine boolean default false,
  p_device text default null,
  p_client text default null,
  p_country text default null,
  p_city text default null,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update email_campaign_recipients r set
    delivered_at = case when p_type = 'delivered' then coalesce(r.delivered_at, p_at) else r.delivered_at end,
    open_count = r.open_count + case when p_type = 'opened' then 1 else 0 end,
    human_open_count = r.human_open_count
      + case when p_type = 'opened' and not p_machine then 1 else 0 end
      -- A person who clicked opened it, even with images off.
      + case when p_type = 'clicked' and not p_machine and r.human_open_count = 0 then 1 else 0 end,
    first_open_at = case
      when p_type = 'opened' then least(coalesce(r.first_open_at, p_at), p_at)
      when p_type = 'clicked' and not p_machine and r.first_open_at is null then p_at
      else r.first_open_at end,
    click_count = r.click_count + case when p_type = 'clicked' then 1 else 0 end,
    human_click_count = r.human_click_count + case when p_type = 'clicked' and not p_machine then 1 else 0 end,
    first_click_at = case when p_type = 'clicked' then least(coalesce(r.first_click_at, p_at), p_at) else r.first_click_at end,
    bounce = case
      when p_type = 'hard_bounce' then 'hard'
      when p_type = 'soft_bounce' then coalesce(r.bounce, 'soft')
      else r.bounce end,
    bounce_reason = case when p_type in ('hard_bounce', 'soft_bounce') then coalesce(p_reason, r.bounce_reason) else r.bounce_reason end,
    complained_at = case when p_type = 'complaint' then coalesce(r.complained_at, p_at) else r.complained_at end,
    unsubscribed_at = case when p_type = 'unsubscribed' then coalesce(r.unsubscribed_at, p_at) else r.unsubscribed_at end,
    visited_at = case when p_type = 'website_visit' then coalesce(r.visited_at, p_at) else r.visited_at end,
    converted_at = case when p_type = 'conversion' then coalesce(r.converted_at, p_at) else r.converted_at end,
    last_activity_at = case
      when p_type in ('opened', 'clicked', 'website_visit', 'conversion') and not p_machine then greatest(coalesce(r.last_activity_at, p_at), p_at)
      else r.last_activity_at end,
    device = case when p_type in ('opened', 'clicked') and not p_machine and p_device is not null and p_device <> 'unknown' then p_device else r.device end,
    client = case when p_type = 'opened' and not p_machine and p_client is not null then p_client else r.client end,
    country = coalesce(case when not p_machine then p_country end, r.country),
    city = coalesce(case when not p_machine then p_city end, r.city)
  where r.id = p_recipient_id;
end;
$$;

-- Called by the server alone (tracking routes, webhooks, the sender).
revoke all on function public.email_apply_event(uuid, text, timestamptz, boolean, text, text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
