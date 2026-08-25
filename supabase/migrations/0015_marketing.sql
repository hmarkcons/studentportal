-- HMARK CRM rebuild — step 11: Marketing & Campaign Management (Module 1I),
-- Marketing Planning (1I2), and the Digital Marketing Module (1J).
-- Run after 0014_communication.sql.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('event', 'digital')),
  name text not null,
  event_date_start date,
  event_date_end date,
  venue text,
  city text,
  host_organizer text,
  expected_footfall int,
  budget numeric(12, 2),
  actual_spend numeric(12, 2),
  pre_event_checklist jsonb not null default '{}'::jsonb,
  staffing jsonb not null default '[]'::jsonb,
  partner_university_id uuid references universities (id),
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_campaigns_updated_at on campaigns;
create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

alter table leads add column campaign_id uuid references campaigns (id);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  referrer_name text not null,
  incentive_owed numeric(12, 2),
  incentive_status text not null default 'owed' check (incentive_status in ('owed', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_referrals_updated_at on referrals;
create trigger trg_referrals_updated_at
  before update on referrals
  for each row execute function set_updated_at();

create table social_calendar_posts (
  id uuid primary key default gen_random_uuid(),
  post_date date not null,
  theme text,
  style_notes text,
  target_country text,
  target_university_id uuid references universities (id),
  asset_path text,
  status text not null default 'brief_sent' check (
    status in ('brief_sent', 'in_design', 'ready_for_review', 'approved', 'scheduled', 'posted')
  ),
  platforms text[] not null default '{}',
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_social_calendar_posts_updated_at on social_calendar_posts;
create trigger trg_social_calendar_posts_updated_at
  before update on social_calendar_posts
  for each row execute function set_updated_at();

create table ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform text,
  country text,
  university_id uuid references universities (id),
  budget_period text check (budget_period in ('daily', 'weekly', 'monthly')),
  planned_spend numeric(12, 2),
  actual_spend numeric(12, 2),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ad_campaigns_updated_at on ad_campaigns;
create trigger trg_ad_campaigns_updated_at
  before update on ad_campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — internal marketing content, not student-facing;
-- broad staff read, marketing-role write.
-- ---------------------------------------------------------------------------

alter table campaigns enable row level security;
alter table referrals enable row level security;
alter table social_calendar_posts enable row level security;
alter table ad_campaigns enable row level security;

create policy "campaigns_select" on campaigns for select using (is_active_staff());
create policy "campaigns_write" on campaigns for all
  using (has_role(array['marketing', 'digital_marketing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['marketing', 'digital_marketing', 'management', 'super_admin']::staff_role[]));

create policy "referrals_select" on referrals for select using (is_active_staff());
create policy "referrals_write" on referrals for all
  using (is_active_staff()) with check (is_active_staff());

create policy "social_calendar_posts_select" on social_calendar_posts for select using (is_active_staff());
create policy "social_calendar_posts_write" on social_calendar_posts for all
  using (has_role(array['marketing', 'digital_marketing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['marketing', 'digital_marketing', 'management', 'super_admin']::staff_role[]));

create policy "ad_campaigns_select" on ad_campaigns for select using (is_active_staff());
create policy "ad_campaigns_write" on ad_campaigns for all
  using (has_role(array['digital_marketing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['digital_marketing', 'management', 'super_admin']::staff_role[]));
