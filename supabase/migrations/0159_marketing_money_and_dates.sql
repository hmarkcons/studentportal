-- Referral incentives were money anybody could move, and the marketing tables
-- accepted nonsense figures and impossible dates.
--
-- Checked against production with a counselor's own session before this was
-- written. referrals_write was `for all using (is_active_staff())`, unlike
-- every other table in 0015, so a counselor could:
--
--   * log a referral with an incentive of 50,000;
--   * mark that incentive paid;
--   * raise it afterwards to 999,999;
--   * make it negative;
--   * log the same referrer twice for one lead, so one lead owes two payments;
--   * delete the record entirely.
--
-- Logging a referral is ordinary work — a counselor learns who sent a student
-- in — so that stays open. Attaching an amount and declaring it paid is
-- finance's, and is what this narrows.

-- --------------------------------------------------------- who may do what
drop policy if exists "referrals_write" on referrals;

-- Anyone active may record that a lead was referred. A WITH CHECK can look at
-- the row being written, which is how "you may log the referral but not the
-- money" gets said — row-level security cannot restrict a column, but it can
-- refuse a row that carries a value in one.
drop policy if exists "referrals_insert" on referrals;
create policy "referrals_insert" on referrals
  for insert with check (
    is_active_staff()
    and (
      incentive_owed is null
      or has_role(array['finance', 'management', 'super_admin']::staff_role[])
    )
    and (
      incentive_status = 'owed'
      or has_role(array['finance', 'management', 'super_admin']::staff_role[])
    )
  );

-- Setting the amount, and declaring it paid.
drop policy if exists "referrals_update" on referrals;
create policy "referrals_update" on referrals
  for update
  using (has_role(array['finance', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['finance', 'management', 'super_admin']::staff_role[]));

-- Deleting a referral deletes a record of money owed.
drop policy if exists "referrals_delete" on referrals;
create policy "referrals_delete" on referrals
  for delete using (has_role(array['finance', 'management', 'super_admin']::staff_role[]));

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'marketing.referral_incentives',
  'Marketing',
  'Set and pay referral incentives',
  'Attach an incentive amount to a referral, mark it paid, and delete a referral record. Logging who referred a lead is not affected.',
  '{finance,management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- --------------------------------------------------------- one per referrer
-- The same referrer logged twice against one lead is one lead owing two
-- payments for one introduction. Two genuinely different referrers for one
-- lead is a judgement nobody here can make for the office, so that stays
-- possible; the exact duplicate does not. Case- and space-insensitive,
-- because "Ali " and "ali" are the same person.
create unique index if not exists referrals_lead_referrer_unique
  on referrals (lead_id, lower(btrim(referrer_name)));

-- ------------------------------------------------------------ the figures
-- Every money column in this module was unconstrained: a negative budget, a
-- negative spend and a negative incentive were all accepted (checked). An
-- incentive of -5,000 is not a smaller debt, it is a nonsense one, and a
-- budget-versus-spend comparison built on either means nothing.
alter table referrals drop constraint if exists referrals_incentive_owed_check;
alter table referrals
  add constraint referrals_incentive_owed_check
  check (incentive_owed is null or incentive_owed >= 0);

alter table campaigns drop constraint if exists campaigns_budget_check;
alter table campaigns
  add constraint campaigns_budget_check check (budget is null or budget >= 0);

alter table campaigns drop constraint if exists campaigns_actual_spend_check;
alter table campaigns
  add constraint campaigns_actual_spend_check check (actual_spend is null or actual_spend >= 0);

alter table campaigns drop constraint if exists campaigns_expected_footfall_check;
alter table campaigns
  add constraint campaigns_expected_footfall_check
  check (expected_footfall is null or expected_footfall >= 0);

alter table ad_campaigns drop constraint if exists ad_campaigns_planned_spend_check;
alter table ad_campaigns
  add constraint ad_campaigns_planned_spend_check
  check (planned_spend is null or planned_spend >= 0);

alter table ad_campaigns drop constraint if exists ad_campaigns_actual_spend_check;
alter table ad_campaigns
  add constraint ad_campaigns_actual_spend_check
  check (actual_spend is null or actual_spend >= 0);

-- -------------------------------------------------------------- the dates
-- A campaign running from December to January of the same year was accepted
-- (checked). Anything ordering or reporting by date reads that as a campaign
-- eleven months long and running backwards.
alter table campaigns drop constraint if exists campaigns_event_dates_order;
alter table campaigns
  add constraint campaigns_event_dates_order
  check (event_date_start is null or event_date_end is null or event_date_end >= event_date_start);

alter table ad_campaigns drop constraint if exists ad_campaigns_dates_order;
alter table ad_campaigns
  add constraint ad_campaigns_dates_order
  check (start_date is null or end_date is null or end_date >= start_date);

-- ------------------------------------------------- history outlives people
-- campaigns.created_by and social_calendar_posts.created_by referenced staff
-- with NO ACTION, so a marketing staff member who had ever created a campaign
-- or a content slot could not be deleted at all — the attempt failed with
-- "Database error deleting user" (checked). Same bug and same fix as
-- audit_log.actor_id in 0136 and inventory_requests.requested_by in 0150: the
-- record survives the person.
alter table campaigns drop constraint if exists campaigns_created_by_fkey;
alter table campaigns
  add constraint campaigns_created_by_fkey
  foreign key (created_by) references staff (id) on delete set null;

alter table social_calendar_posts drop constraint if exists social_calendar_posts_created_by_fkey;
alter table social_calendar_posts
  add constraint social_calendar_posts_created_by_fkey
  foreign key (created_by) references staff (id) on delete set null;

-- A campaign a lead came in through cannot be deleted while the lead points at
-- it, which is right — but NO ACTION reports it as a raw foreign-key error. The
-- lead's origin is worth keeping either way, so the reference is cleared
-- instead of blocking the delete.
alter table leads drop constraint if exists leads_campaign_id_fkey;
alter table leads
  add constraint leads_campaign_id_fkey
  foreign key (campaign_id) references campaigns (id) on delete set null;

create index if not exists social_calendar_posts_date_status_idx
  on social_calendar_posts (post_date, status);
